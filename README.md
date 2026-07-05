# 13F Dashboard

A personal tracker for institutional 13F filings. Search any SEC-registered
fund, follow its quarterly holdings, and see how positions change over time —
on a stack that costs nothing to run.

**React + TypeScript** (Vite, Tailwind, Recharts) · **Supabase** (Postgres,
Auth, Edge Functions) · **SEC EDGAR** as the free data source. See
[BACKLOG.md](BACKLOG.md) for the feature backlog.

```
  SEC EDGAR (free)                 Supabase                        React app
 ┌─────────────────┐  ingest   ┌──────────────────┐    query   ┌───────────────┐
 │ submissions API │ ────────▶ │ funds            │ ◀───────── │ chart · table │
 │ 13F XML tables  │  (cron)   │ filings          │   REST     │ stat tiles    │
 │                 │           │ holdings         │            │ dark/light    │
 │ company search  │ ◀──────── │ edge fn:         │ ◀───────── │ autocomplete  │
 │                 │   proxy   │  search-funds    │   invoke   │ owner sign-in │
 └─────────────────┘           └──────────────────┘            └───────────────┘
```

## Features

- **Holdings over time** — line chart of a fund's top positions across its
  last quarters, plus per-quarter stat tiles (portfolio value, QoQ change,
  position count, filing date).
- **Quarter-by-quarter table** — value, % of portfolio, and share-count deltas
  (▲ / ▼ / new) against the prior quarter.
- **Dark & light mode** — follows the OS preference, toggleable, no flash on load.
- **Fund search via EDGAR, not the DB** — autocomplete queries the SEC's
  company index live through the `search-funds` edge function (sec.gov sends
  no CORS headers, so the browser can't call it directly). The database only
  stores funds you explicitly add.
- **Owner-gated writes** — everyone can read; adding and removing funds
  requires sign-in, enforced by Row Level Security (email check in Postgres,
  not just hidden buttons). There is deliberately no sign-up flow.
- **Honest 13F parsing** — duplicate manager-split lots are grouped per
  security, values pre-2023 are normalized from $1000s, and `NEW HOLDINGS`
  amendments are merged into the original filing instead of clobbering it
  (a full restatement still replaces).

## How data flows

13F data is not live — funds file up to 45 days after quarter-end — so there
is no always-on server. A daily GitHub Actions cron (06:00 UTC) pulls the
**5 most recent filings** per tracked fund from EDGAR and writes new ones to
Postgres. Adding a fund in the UI stores just the fund row; its holdings
arrive with the next ingest run (or trigger `ingest-13f` manually in Actions).

## Repo layout

| Path | What it is |
|---|---|
| `src/App.tsx` | Shell: layout, theme, auth/session, selection state |
| `src/components/` | Sidebar, EDGAR autocomplete, chart, table, stat tiles, sign-in |
| `src/data.ts` | Supabase data layer (reads, owner-gated writes, auth, fund search) |
| `src/format.ts` | Compact $ / share / % formatting |
| `supabase/functions/search-funds/` | Edge function proxying EDGAR company search |
| `supabase/migrations/0001_schema.sql` | Tables: `funds`, `filings`, `holdings` + indexes |
| `supabase/migrations/0002_grants.sql` | Data API grants |
| `supabase/migrations/0003_rls.sql` | RLS + public-read policies |
| `supabase/migrations/0004_auth_writes.sql` | Owner-only insert/delete on `funds` |
| `supabase/migrations/0005_filing_summary.sql` | Per-filing aggregates view (exact totals past the 1000-row API cap) |
| `supabase/migrations/0006_group_duplicate_lots.sql` | One-time dedupe of manager-split lots |
| `supabase/migrations/0007_requeue_clobbered_amendment.sql` | One-time repair of an amendment-clobbered quarter |
| `supabase/seed.sql` | Starter fund list |
| `scripts/ingest.ts` | EDGAR → Supabase ingestion job (run via `tsx`) |
| `.github/workflows/ingest.yml` | Daily cron + manual trigger |

## Setup

1. **Supabase project**
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push --include-seed        # migrations + seed
   npx supabase functions deploy search-funds # EDGAR search proxy
   ```
2. **Owner account** — Supabase dashboard → Authentication → Users →
   *Add user*. The RLS policies in `0004_auth_writes.sql` check the signed-in
   email; change the hardcoded address there to your own before pushing.
3. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   | Secret | Value |
   |---|---|
   | `SUPABASE_URL` | project URL |
   | `SUPABASE_SERVICE_KEY` | service_role key — never in the frontend |
   | `SEC_USER_AGENT` | e.g. `13f-dashboard you@example.com` (SEC blocks anonymous clients) |
4. **First ingest** — run the `ingest-13f` workflow manually (Actions tab), or locally:
   ```bash
   npm install
   npm run ingest:dry-run                     # no credentials; parses one fund and prints it
   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run ingest -- --limit 5
   ```
5. **Frontend** — copy `.env.example` to `.env.local` and fill in the URL and
   anon key (`npx supabase projects api-keys --project-ref <ref>`), then:
   ```bash
   npm run dev
   ```

## Data caveats

- 13F is filed up to 45 days after quarter-end — data can be ~5 months stale.
- Long US equities only: no shorts, options detail, cash, bonds, or non-US holdings.
- The SEC does not verify 13F accuracy — treat it as reported, not audited.
- EDGAR gives CUSIPs, not tickers; pre-2023 filings report values in $1000s
  (the ingest job normalizes to whole dollars).
- One filer can report a security as several manager-split lots; the ingest
  groups them into one row per security per quarter.
