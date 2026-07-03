// EDGAR → Supabase ingestion job.
//
// For every fund in the `funds` table, pull new 13F-HR filings from SEC EDGAR,
// parse the information-table XML, and write filings + holdings to Postgres.
// Run on a schedule (see .github/workflows/ingest.yml) — 13F data is not live,
// so a daily check is plenty.
//
// Env:
//   SUPABASE_URL          project URL
//   SUPABASE_SERVICE_KEY  service_role key (bypasses RLS; never in the frontend)
//   SEC_USER_AGENT        e.g. "my-13f-tracker me@example.com" (SEC blocks without it)
//
// Dry run (no Supabase writes, parses one CIK and prints the result):
//   npm run ingest:dry-run -- 0001067983
//
// Limit how many filings back to pull per fund (default: all available):
//   npm run ingest -- --limit 5

import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';

interface ThirteenF {
  form: string;
  accession: string;
  periodEnd: string;
  filedDate: string;
}

interface InfoTableRow {
  cusip?: string;
  nameOfIssuer?: string;
  shrsOrPrnAmt?: { sshPrnamt?: number };
  value?: number | string;
}

interface EdgarSubmissions {
  filings: {
    recent: {
      form: string[];
      accessionNumber: string[];
      reportDate: string[];
      filingDate: string[];
    };
  };
}

interface EdgarDirectoryIndex {
  directory: { item: { name: string }[] };
}

const UA = {
  'User-Agent': process.env.SEC_USER_AGENT ?? '13f-dashboard jan.mastalier@gmail.com',
};

// SEC asks for <10 req/s; stay well under it.
const REQUEST_DELAY_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function edgarFetch(url: string): Promise<Response> {
  await sleep(REQUEST_DELAY_MS);
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`EDGAR ${res.status} for ${url}`);
  return res;
}

// '2025-03-31' -> 'Q1 2025'
function toQuarterLabel(periodEnd: string): string {
  const [year, month] = periodEnd.split('-').map(Number);
  return `Q${Math.ceil(month / 3)} ${year}`;
}

// Filings before 2023 report `value` in thousands of dollars; newer ones in
// whole dollars. Normalize everything to whole dollars or be off by 1000×.
function normalizeValue(rawValue: number | string | undefined, filedDate: string): number {
  const v = Number(rawValue) || 0;
  return filedDate < '2023-01-01' ? v * 1000 : v;
}

// The holdings live in an XML information table inside the filing folder.
// The folder index tells us which file it is (name varies by filer).
async function fetchInfoTable(cik: string, accession: string): Promise<InfoTableRow[]> {
  const cikNum = String(Number(cik)); // folder path uses the unpadded CIK
  const accPlain = accession.replace(/-/g, '');
  const base = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accPlain}`;

  const index: EdgarDirectoryIndex = await edgarFetch(`${base}/index.json`).then((r) => r.json());
  const files = index.directory.item.map((i) => i.name);
  const infoTableFile =
    files.find((n) => /infotable|information_table|form13f/i.test(n) && n.endsWith('.xml')) ??
    files.find((n) => n.endsWith('.xml') && !/primary_doc/i.test(n));
  if (!infoTableFile) throw new Error(`no information table XML in ${base}`);

  const xml = await edgarFetch(`${base}/${infoTableFile}`).then((r) => r.text());
  const parsed = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true, // some filers namespace the tags (ns1:infoTable)
    parseTagValue: false, // keep CUSIPs as strings — auto-numbering drops leading zeros
  }).parse(xml);

  const table: InfoTableRow[] | InfoTableRow = parsed.informationTable?.infoTable ?? [];
  return Array.isArray(table) ? table : [table]; // single-holding filings parse as an object
}

// One row per 13F-HR / 13F-HR/A in the filer's recent submissions.
async function listThirteenFs(cik: string): Promise<ThirteenF[]> {
  const subs: EdgarSubmissions = await edgarFetch(
    `https://data.sec.gov/submissions/CIK${cik}.json`
  ).then((r) => r.json());

  const recent = subs.filings.recent;
  const out: ThirteenF[] = [];
  for (let i = 0; i < recent.form.length; i++) {
    const form = recent.form[i];
    if (form !== '13F-HR' && form !== '13F-HR/A') continue;
    out.push({
      form,
      accession: recent.accessionNumber[i],
      periodEnd: recent.reportDate[i],
      filedDate: recent.filingDate[i],
    });
  }
  return out;
}

async function ingestFund(
  sb: ReturnType<typeof createClient>,
  cik: string,
  limit?: number
): Promise<void> {
  const filings = await listThirteenFs(cik); // newest-first per EDGAR's submissions API
  for (const f of limit ? filings.slice(0, limit) : filings) {
    // Skip if we already have this exact filing:
    const { data: existing } = await sb
      .from('filings')
      .select('id')
      .eq('accession_no', f.accession)
      .maybeSingle();
    if (existing) continue;

    const quarter = toQuarterLabel(f.periodEnd);

    // Amendments (13F-HR/A) restate a period. Prefer the latest filing for a
    // given (cik, quarter): replace an older filing, skip if ours is older.
    const { data: samePeriod } = await sb
      .from('filings')
      .select('id, filed_date')
      .eq('cik', cik)
      .eq('quarter', quarter)
      .maybeSingle();
    if (samePeriod) {
      if (samePeriod.filed_date >= f.filedDate) continue;
      await sb.from('filings').delete().eq('id', samePeriod.id); // cascades to holdings
    }

    const infoTable = await fetchInfoTable(cik, f.accession);

    const { data: filing, error } = await sb
      .from('filings')
      .insert({
        cik,
        quarter,
        period_end: f.periodEnd,
        filed_date: f.filedDate,
        accession_no: f.accession,
      })
      .select()
      .single();
    if (error) throw error;

    const rows = infoTable.map((h) => ({
      filing_id: filing.id,
      cusip: h.cusip ? String(h.cusip) : null,
      name: h.nameOfIssuer,
      shares: Number(h.shrsOrPrnAmt?.sshPrnamt ?? 0),
      value: normalizeValue(h.value, f.filedDate),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error: insErr } = await sb.from('holdings').insert(rows.slice(i, i + 500));
      if (insErr) throw insErr;
    }
    console.log(`${cik} ${quarter}: ${rows.length} holdings (${f.form} ${f.accession})`);
  }
}

async function dryRun(cik: string): Promise<void> {
  const filings = await listThirteenFs(cik);
  console.log(`CIK ${cik}: ${filings.length} 13F filings found`);
  if (!filings.length) return;
  const latest = filings[0];
  const holdings = await fetchInfoTable(cik, latest.accession);
  console.log(
    `latest: ${latest.form} ${latest.accession} (period ${latest.periodEnd}) — ${holdings.length} holdings`
  );
  for (const h of holdings.slice(0, 5)) {
    console.log(
      ` ${h.nameOfIssuer} | cusip ${h.cusip} | shares ${h.shrsOrPrnAmt?.sshPrnamt} | $${normalizeValue(h.value, latest.filedDate).toLocaleString()}`
    );
  }
}

async function main(): Promise<void> {
  const dryIdx = process.argv.indexOf('--dry-run');
  if (dryIdx !== -1) {
    const cik = (process.argv[dryIdx + 1] ?? '0001067983').replace(/\D/g, '').padStart(10, '0');
    return dryRun(cik);
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required (or use --dry-run)');
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx !== -1 ? Number(process.argv[limitIdx + 1]) : undefined;

  const { data: funds, error } = await sb.from('funds').select('cik,name');
  if (error) throw error;

  let failures = 0;
  for (const fund of funds) {
    try {
      await ingestFund(sb, fund.cik, limit);
    } catch (e) {
      failures++;
      console.error(`FAILED ${fund.cik} (${fund.name}): ${e instanceof Error ? e.message : e}`);
    }
  }
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
