# 13F Tracker — Feature Backlog

Status legend: 🔲 not started · 🔶 in progress · ✅ done

The React app (`App.jsx`) works fully against a mock data layer. Everything below
is what's needed to move from mock to live SEC data, then grow the product.
Ordered by priority within each milestone.

---

## Milestone 1 — Infrastructure (mock → live plumbing)

### 1.1 Supabase project setup 🔲
- Create a Supabase project (supabase.com), note Project URL + anon key (Settings → API).
- Run `supabase/migrations/0001_schema.sql` in the SQL Editor (tables: `funds`, `filings`, `holdings` + indexes).
- Run `supabase/migrations/0002_grants.sql` — required for projects created after 2026-05-30 so the REST API can reach the tables.
- Run `supabase/migrations/0003_rls.sql` — RLS with public-read policies (do before ever having users).
- **Blocked in this repo/session:** no Supabase MCP server or CLI is available in the
  Claude Code environment, so this must be done manually or after adding the
  Supabase MCP server (see README).

### 1.2 Seed the 20 tracked funds 🔲
- Copy the `SEED_FUNDS` array values from `App.jsx` into `supabase/seed.sql`.
- ⚠️ Verify **every** CIK on EDGAR before trusting the data — some managers file
  under holding-company/family-office names; a wrong CIK silently pulls the wrong portfolio.

### 1.3 EDGAR ingestion job 🔶 (scaffolded in `scripts/ingest.js`)
- [x] Fetch each fund's submissions from `https://data.sec.gov/submissions/CIK##########.json`.
- [x] Filter `13F-HR` (and `13F-HR/A` amendments), dedupe by accession number.
- [x] Locate & parse the information-table XML (`<infoTable>` per holding).
- [x] Normalize value units — pre-2023 filings report in $1000s, newer in whole dollars (off by 1000× otherwise).
- [x] Descriptive `User-Agent` header on every request + rate limiting (<10 req/s).
- [x] Handle amendments: prefer the latest filing for a given period.
- [ ] Run end-to-end against a real Supabase project (EDGAR is blocked from this CI environment — test locally).

### 1.4 Scheduled ingestion (GitHub Actions) 🔶 (scaffolded in `.github/workflows/ingest.yml`)
- [x] Daily cron at 06:00 UTC + manual `workflow_dispatch`.
- [ ] Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to GitHub repo secrets (service_role key — never in the frontend).
- Doubles as the keep-alive ping that stops Supabase pausing the project after 7 idle days.

### 1.5 Swap the frontend data layer 🔶 (scaffolded in `src/data.js`)
- [x] `getFunds`, `getFilings`, `getHoldings`, `addFund` implemented against Supabase.
- [ ] Add `App.jsx` to this repo and replace its mock DATA LAYER block with imports from `src/data.js`.
- [ ] Create `.env.local` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

### 1.6 Vite app scaffold & deploy 🔲
- `npm create vite@latest` (React template), drop `App.jsx` into `src/`.
- Deploy free on Vercel / Netlify / Cloudflare Pages.

---

## Milestone 2 — Product hardening

### 2.1 "Awaiting first sync" state for newly added funds 🔲
- A fund added via the UI has no holdings until the next ingest run.
- Show a pending state, or trigger a one-off ingest for the new CIK (e.g. `workflow_dispatch` with a CIK input).

### 2.2 Data caveats surfaced in the UI 🔲
- 13F is filed up to 45 days after quarter-end → data can be ~5 months stale.
- Long US equities only — no shorts, options detail, cash, bonds, non-US holdings.
- SEC does not verify 13F accuracy: "as reported, not audited".

### 2.3 Free-tier guardrails 🔲
- Keep the fund list curated (20–50 funds); never ingest all 10,000+ filers (blows the 500 MB cap).
- Client-side caching to stay under 5 GB egress/month.
- Plan the move to Pro ($25/mo) before first real users (no pause, daily backups, 8 GB).

### 2.4 Auth & multi-user readiness 🔲
- Replace the `grant insert on funds to anon` shortcut with real Supabase Auth.
- Tighten RLS write policies (currently only the service_role ingest job writes).

---

## Milestone 3 — New features (from the guide's "suggested next features")

### 3.1 CUSIP → ticker mapping 🔲
- EDGAR identifies securities by CUSIP only; there's no free official CUSIP→ticker service.
- Build a `cusip_tickers` lookup table, filled in as new securities are encountered; fall back to issuer name.

### 3.2 New-filing alerts 🔲
- Email/push notification when a tracked fund files a new 13F.
- Hook into the ingest job: any newly inserted filing triggers a notification.

### 3.3 Consensus view 🔲
- Cross-fund aggregation: which stocks the most tracked funds are buying / selling this quarter.
- Needs the CUSIP mapping (3.1) to group positions across funds reliably.

### 3.4 Price-overlay / "follow the whale" performance 🔲
- Overlay each position against the stock's price move since the filing date.
- Requires a price data source and the ticker mapping (3.1).

### 3.5 Historical portfolio-value chart per fund 🔲
- Total reported portfolio value per quarter, charted over time.
- Data already available from `filings` × `holdings` — aggregation + chart only.

---

## Dependencies at a glance

```
1.1 ──▶ 1.2 ──▶ 1.3 ──▶ 1.4
             └─▶ 1.5 ──▶ 1.6 ──▶ 2.1, 2.2
3.1 ──▶ 3.3, 3.4
1.3 ──▶ 3.2, 3.5
```
