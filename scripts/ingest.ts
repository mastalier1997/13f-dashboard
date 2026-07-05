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

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

// Filing folder URL; the path uses the unpadded CIK and dash-less accession.
const filingFolder = (cik: string, accession: string) =>
  `https://www.sec.gov/Archives/edgar/data/${String(Number(cik))}/${accession.replace(/-/g, '')}`;

type AmendmentType = 'restatement' | 'new-holdings';

// A 13F-HR/A either restates the entire information table or only adds
// previously-omitted (confidential) positions; the primary doc says which.
// Treating an additions-only amendment as a restatement would wipe the real
// portfolio (e.g. Berkshire Q1 2025: a 4-position amendment vs $257B filed).
async function fetchAmendmentType(cik: string, accession: string): Promise<AmendmentType> {
  const base = filingFolder(cik, accession);
  const index: EdgarDirectoryIndex = await edgarFetch(`${base}/index.json`).then((r) => r.json());
  const primaryDoc = index.directory.item
    .map((i) => i.name)
    .find((n) => /primary_doc.*\.xml$/i.test(n));
  if (!primaryDoc) return 'restatement'; // unknown → old behavior (replace)

  const xml = await edgarFetch(`${base}/${primaryDoc}`).then((r) => r.text());
  const declared = xml.match(/<amendmentType>([^<]*)</i)?.[1] ?? '';
  return /new\s*holdings/i.test(declared) ? 'new-holdings' : 'restatement';
}

// The holdings live in an XML information table inside the filing folder.
// The folder index tells us which file it is (name varies by filer).
async function fetchInfoTable(cik: string, accession: string): Promise<InfoTableRow[]> {
  const base = filingFolder(cik, accession);
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

interface HoldingLot {
  cusip: string | null;
  name?: string;
  shares: number;
  value: number;
}

// Filers report one row per manager/discretion split, so one security can
// appear as several lots sharing a CUSIP. Group to one row per security.
function groupLots(infoTable: InfoTableRow[], filedDate: string): HoldingLot[] {
  const byKey = new Map<string, HoldingLot>();
  for (const h of infoTable) {
    const cusip = h.cusip ? String(h.cusip) : null;
    const key = cusip ?? h.nameOfIssuer ?? '?';
    const shares = Number(h.shrsOrPrnAmt?.sshPrnamt ?? 0);
    const value = normalizeValue(h.value, filedDate);
    const lot = byKey.get(key);
    if (lot) {
      lot.shares += shares;
      lot.value += value;
    } else {
      byKey.set(key, { cusip, name: h.nameOfIssuer, shares, value });
    }
  }
  return [...byKey.values()];
}

async function insertHoldings(
  sb: SupabaseClient,
  filingId: number,
  lots: HoldingLot[]
): Promise<void> {
  const rows = lots.map((lot) => ({ ...lot, filing_id: filingId }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from('holdings').insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
}

async function ingestFiling(
  sb: SupabaseClient,
  cik: string,
  f: ThirteenF,
  allFilings: ThirteenF[]
): Promise<void> {
  // Skip if we already have this exact filing:
  const { data: existing } = await sb
    .from('filings')
    .select('id')
    .eq('accession_no', f.accession)
    .maybeSingle();
  if (existing) return;

  const quarter = toQuarterLabel(f.periodEnd);
  const isAmendment = f.form === '13F-HR/A';
  const amendmentType = isAmendment ? await fetchAmendmentType(cik, f.accession) : null;

  // An additions-only amendment needs its original on record to merge into —
  // the original may sit outside --limit, so pull it in explicitly.
  if (amendmentType === 'new-holdings') {
    const { data: sp } = await sb
      .from('filings')
      .select('id')
      .eq('cik', cik)
      .eq('quarter', quarter)
      .maybeSingle();
    if (!sp) {
      const original = allFilings.find(
        (o) => o.form === '13F-HR' && o.periodEnd === f.periodEnd && o.filedDate <= f.filedDate
      );
      if (original) await ingestFiling(sb, cik, original, allFilings);
    }
  }

  const { data: samePeriod } = await sb
    .from('filings')
    .select('id, filed_date')
    .eq('cik', cik)
    .eq('quarter', quarter)
    .maybeSingle();

  // Keep the latest data for a (cik, quarter). Ties go to amendments — an
  // amendment filed the same day as the original still supersedes it.
  if (samePeriod) {
    const storedIsNewer =
      samePeriod.filed_date > f.filedDate ||
      (!isAmendment && samePeriod.filed_date === f.filedDate);
    if (storedIsNewer) return;
  }

  const lots = groupLots(await fetchInfoTable(cik, f.accession), f.filedDate);

  if (samePeriod && amendmentType === 'new-holdings') {
    // Merge the previously-omitted positions into the stored filing. Record
    // the amendment's accession so it isn't merged twice; keep the original
    // filed_date so the original filing stays recognized as ingested.
    // ponytail: assumes no CUSIP overlap between original and NEW HOLDINGS
    // amendment (SEC semantics); overlapping rows would need summing here.
    await insertHoldings(sb, samePeriod.id as number, lots);
    const { error } = await sb
      .from('filings')
      .update({ accession_no: f.accession })
      .eq('id', samePeriod.id);
    if (error) throw error;
    console.log(`${cik} ${quarter}: +${lots.length} holdings merged (${f.form} ${f.accession})`);
    return;
  }

  if (samePeriod) {
    await sb.from('filings').delete().eq('id', samePeriod.id); // cascades to holdings
  }

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

  await insertHoldings(sb, filing.id as number, lots);
  console.log(`${cik} ${quarter}: ${lots.length} holdings (${f.form} ${f.accession})`);
}

async function ingestFund(
  sb: SupabaseClient,
  cik: string,
  limit?: number
): Promise<void> {
  const filings = await listThirteenFs(cik); // newest-first per EDGAR's submissions API
  const chosen = limit ? filings.slice(0, limit) : filings;
  // Oldest → newest so originals land before the amendments that patch them.
  for (const f of [...chosen].reverse()) {
    await ingestFiling(sb, cik, f, filings);
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
