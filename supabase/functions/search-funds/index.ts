// EDGAR 13F-filer autocomplete proxy.
//
// The frontend can't call EDGAR directly (no CORS headers on sec.gov), so this
// function wraps EDGAR's company search, filtered to entities that have filed
// 13F-HR, and returns [{ cik, name }]. Nothing is stored — the DB only ever
// holds funds the owner explicitly adds.
//
// Invoke: POST { q: "berkshire" }  →  [{ cik: "0001067983", name: "BERKSHIRE HATHAWAY INC" }]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UA = {
  'User-Agent': Deno.env.get('SEC_USER_AGENT') ?? '13f-dashboard jan.mastalier@gmail.com',
};

interface FundHit {
  cik: string;
  name: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function parseResults(html: string): FundHit[] {
  // Multi-match page: a table row per company — CIK link cell, then name cell.
  const rows = [...html.matchAll(/CIK=(\d{10})[^>]*>[^<]*<\/a>\s*<\/td>\s*<td[^>]*>([^<]+)/g)];
  if (rows.length > 0) {
    return rows.map(([, cik, name]) => ({ cik, name: decodeEntities(name.trim()) }));
  }
  // Exactly one match: EDGAR redirects to that company's filing page instead.
  const single = html.match(/companyName">([^<]+?)\s*<[\s\S]*?CIK=(\d{10})/);
  return single ? [{ cik: single[2], name: decodeEntities(single[1].trim()) }] : [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let q = '';
  try {
    ({ q = '' } = await req.json());
  } catch {
    // no/invalid body — treated as empty query
  }
  q = String(q).trim();
  if (q.length < 2) return Response.json([], { headers: CORS });

  const url =
    'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=13F-HR&count=20' +
    `&company=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) {
    return Response.json({ error: `EDGAR responded ${res.status}` }, { status: 502, headers: CORS });
  }

  return Response.json(parseResults(await res.text()), { headers: CORS });
});
