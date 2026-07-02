// Mock data layer — same four async functions as src/data.js (the Supabase
// layer), so the app can swap between them without changing (see src/api.js).
//
// Portfolios are generated deterministically from each fund's CIK: the same
// fund always shows the same holdings, evolving quarter to quarter, so the
// quarter-over-quarter diff view has stable, plausible content.

// ⚠️ CIKs are reasonable starting points but must be verified on EDGAR before
// live ingestion — some managers file under holding-company or family-office
// names (see BACKLOG.md 1.2).
export const SEED_FUNDS = [
  { cik: '0001067983', name: 'Berkshire Hathaway', manager: 'Warren Buffett' },
  { cik: '0001649339', name: 'Scion Asset Management', manager: 'Michael Burry' },
  { cik: '0001336528', name: 'Pershing Square Capital', manager: 'Bill Ackman' },
  { cik: '0001350694', name: 'Bridgewater Associates', manager: 'Ray Dalio' },
  { cik: '0001037389', name: 'Renaissance Technologies', manager: 'Jim Simons (founder)' },
  { cik: '0001423053', name: 'Citadel Advisors', manager: 'Ken Griffin' },
  { cik: '0001009207', name: 'D. E. Shaw & Co.', manager: 'David Shaw (founder)' },
  { cik: '0001273087', name: 'Millennium Management', manager: 'Izzy Englander' },
  { cik: '0001040273', name: 'Third Point', manager: 'Dan Loeb' },
  { cik: '0001079114', name: 'Greenlight Capital', manager: 'David Einhorn' },
  { cik: '0001061768', name: 'Baupost Group', manager: 'Seth Klarman' },
  { cik: '0001656456', name: 'Appaloosa Management', manager: 'David Tepper' },
  { cik: '0000921669', name: 'Icahn Capital', manager: 'Carl Icahn' },
  { cik: '0001167483', name: 'Tiger Global Management', manager: 'Chase Coleman' },
  { cik: '0001135730', name: 'Coatue Management', manager: 'Philippe Laffont' },
  { cik: '0001061165', name: 'Lone Pine Capital', manager: 'Stephen Mandel (founder)' },
  { cik: '0001103804', name: 'Viking Global Investors', manager: 'Andreas Halvorsen' },
  { cik: '0001029160', name: 'Soros Fund Management', manager: 'George Soros (founder)' },
  { cik: '0001536411', name: 'Duquesne Family Office', manager: 'Stanley Druckenmiller' },
  { cik: '0001697748', name: 'ARK Investment Management', manager: 'Cathie Wood' },
];

// Reporting periods, oldest → newest. Latest 13F visible mid-2026 covers Q1 2026.
const QUARTERS = [
  { quarter: 'Q2 2024', periodEnd: '2024-06-30', filedDate: '2024-08-14' },
  { quarter: 'Q3 2024', periodEnd: '2024-09-30', filedDate: '2024-11-14' },
  { quarter: 'Q4 2024', periodEnd: '2024-12-31', filedDate: '2025-02-13' },
  { quarter: 'Q1 2025', periodEnd: '2025-03-31', filedDate: '2025-05-15' },
  { quarter: 'Q2 2025', periodEnd: '2025-06-30', filedDate: '2025-08-14' },
  { quarter: 'Q3 2025', periodEnd: '2025-09-30', filedDate: '2025-11-13' },
  { quarter: 'Q4 2025', periodEnd: '2025-12-31', filedDate: '2026-02-12' },
  { quarter: 'Q1 2026', periodEnd: '2026-03-31', filedDate: '2026-05-14' },
];

// Security universe funds pick from: [ticker, name, cusip, base price $]
const UNIVERSE = [
  ['AAPL', 'Apple Inc', '037833100', 195],
  ['MSFT', 'Microsoft Corp', '594918104', 420],
  ['AMZN', 'Amazon.com Inc', '023135106', 185],
  ['GOOGL', 'Alphabet Inc Cl A', '02079K305', 165],
  ['NVDA', 'NVIDIA Corp', '67066G104', 120],
  ['META', 'Meta Platforms Inc', '30303M102', 500],
  ['TSLA', 'Tesla Inc', '88160R101', 240],
  ['BRK.B', 'Berkshire Hathaway Cl B', '084670702', 430],
  ['JPM', 'JPMorgan Chase & Co', '46625H100', 210],
  ['V', 'Visa Inc Cl A', '92826C839', 280],
  ['JNJ', 'Johnson & Johnson', '478160104', 150],
  ['WMT', 'Walmart Inc', '931142103', 80],
  ['PG', 'Procter & Gamble Co', '742718109', 165],
  ['XOM', 'Exxon Mobil Corp', '30231G102', 115],
  ['BAC', 'Bank of America Corp', '060505104', 40],
  ['KO', 'Coca-Cola Co', '191216100', 63],
  ['DIS', 'Walt Disney Co', '254687106', 95],
  ['NFLX', 'Netflix Inc', '64110L106', 650],
  ['ADBE', 'Adobe Inc', '00724F101', 520],
  ['CRM', 'Salesforce Inc', '79466L302', 270],
  ['INTC', 'Intel Corp', '458140100', 32],
  ['AMD', 'Advanced Micro Devices', '007903107', 155],
  ['PYPL', 'PayPal Holdings Inc', '70450Y103', 65],
  ['UNH', 'UnitedHealth Group Inc', '91324P102', 520],
  ['HD', 'Home Depot Inc', '437076102', 350],
  ['CVX', 'Chevron Corp', '166764100', 155],
  ['PFE', 'Pfizer Inc', '717081103', 28],
  ['MRK', 'Merck & Co Inc', '58933Y105', 125],
  ['VZ', 'Verizon Communications', '92343V104', 40],
  ['CSCO', 'Cisco Systems Inc', '17275R102', 48],
  ['ORCL', 'Oracle Corp', '68389X105', 140],
  ['IBM', 'IBM Corp', '459200101', 185],
  ['QCOM', 'Qualcomm Inc', '747525103', 170],
  ['GE', 'GE Aerospace', '369604301', 160],
  ['GM', 'General Motors Co', '37045V100', 45],
  ['UBER', 'Uber Technologies Inc', '90353T100', 70],
];

// --- deterministic PRNG -----------------------------------------------------

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- portfolio generation ---------------------------------------------------

// price drifts a few percent per quarter, per stock, deterministically
function priceAt(stockIdx, qIdx) {
  const rng = mulberry32(hashSeed(`px:${stockIdx}:${qIdx}`));
  const base = UNIVERSE[stockIdx][3];
  return base * (1 + 0.02 * qIdx) * (0.9 + rng() * 0.25);
}

const historyCache = new Map();

// Returns [{quarter, filedDate, holdings: [{ticker,name,cusip,shares,value}]}]
function fundHistory(cik) {
  if (historyCache.has(cik)) return historyCache.get(cik);
  const rng = mulberry32(hashSeed(`fund:${cik}`));

  // initial picks: 12–24 names, fund-specific position scale
  const order = UNIVERSE.map((_, i) => i).sort(() => rng() - 0.5);
  const count = 12 + Math.floor(rng() * 13);
  const scale = 0.2 + rng() * 4; // small fund … mega fund
  const positions = new Map(); // stockIdx -> shares
  for (const idx of order.slice(0, count)) {
    positions.set(idx, Math.round((0.5 + rng() * 9.5) * 1_000_000 * scale));
  }

  const history = QUARTERS.map((q, qIdx) => {
    if (qIdx > 0) {
      // evolve: trim, add to, exit, or hold each position
      for (const [idx, shares] of [...positions]) {
        const r = rng();
        if (r < 0.07) positions.delete(idx);
        else if (r < 0.25) positions.set(idx, Math.round(shares * (0.5 + rng() * 0.4)));
        else if (r < 0.45) positions.set(idx, Math.round(shares * (1.1 + rng() * 0.5)));
      }
      // 0–2 new positions
      const additions = Math.floor(rng() * 3);
      const unused = order.filter((i) => !positions.has(i));
      for (const idx of unused.slice(0, additions)) {
        positions.set(idx, Math.round((0.5 + rng() * 5) * 1_000_000 * scale));
      }
    }
    const holdings = [...positions]
      .map(([idx, shares]) => {
        const [ticker, name, cusip] = UNIVERSE[idx];
        return { ticker, name, cusip, shares, value: Math.round(shares * priceAt(idx, qIdx)) };
      })
      .sort((a, b) => b.value - a.value);
    return { quarter: q.quarter, filedDate: q.filedDate, holdings };
  });

  historyCache.set(cik, history);
  return history;
}

// --- the data layer API (matches src/data.js) -------------------------------

const customFunds = []; // funds added via the UI this session; no filings yet

const delay = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 180));

export async function getFunds() {
  await delay();
  return [
    ...SEED_FUNDS.map((f) => ({ ...f, custom: false })),
    ...customFunds,
  ].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFilings(cik) {
  await delay();
  if (customFunds.some((f) => f.cik === cik)) return []; // awaiting first sync
  return fundHistory(cik)
    .map((h) => ({ cik, quarter: h.quarter, filedDate: h.filedDate }))
    .reverse(); // newest first
}

export async function getHoldings(cik, quarter) {
  await delay();
  const entry = fundHistory(cik).find((h) => h.quarter === quarter);
  if (!entry) throw new Error(`no filing for ${cik} ${quarter}`);
  return entry.holdings;
}

export async function addFund({ cik, name, manager }) {
  await delay();
  const clean = cik.replace(/\D/g, '').padStart(10, '0');
  if ([...SEED_FUNDS, ...customFunds].some((f) => f.cik === clean)) {
    throw new Error('That CIK is already tracked.');
  }
  const fund = { cik: clean, name, manager, custom: true };
  customFunds.push(fund);
  return fund;
}
