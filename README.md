# 13f-dashboard

A personal 13F holdings tracker. React frontend, Supabase (Postgres) backend,
SEC EDGAR as the free data source. See **[BACKLOG.md](BACKLOG.md)** for the
prioritized feature backlog.

```
  SEC EDGAR (free)                Supabase (Postgres)            React app
 ┌────────────────┐   ingest    ┌────────────────────┐  query  ┌──────────────┐
 │ submissions API │ ─────────▶ │  funds             │ ◀────── │  src/data.js │
 │ 13F XML tables  │   (cron)   │  filings           │  REST/  │              │
 │                 │            │  holdings          │  client │              │
 └────────────────┘            └────────────────────┘         └──────────────┘
```

13F data is not live — funds file up to 45 days after quarter-end — so there is
no always-on server, just a daily GitHub Actions cron that writes new filings
to Postgres.

## Repo layout

| Path | What it is |
|---|---|
| `supabase/migrations/0001_schema.sql` | Tables: `funds`, `filings`, `holdings` + indexes |
| `supabase/migrations/0002_grants.sql` | Data API grants (needed for projects created after 2026-05-30) |
| `supabase/migrations/0003_rls.sql` | Row Level Security + public-read policies |
| `supabase/seed.sql` | Starter fund list (complete it from `SEED_FUNDS` in `App.jsx`) |
| `scripts/ingest.js` | EDGAR → Supabase ingestion job |
| `.github/workflows/ingest.yml` | Daily cron (06:00 UTC) + manual trigger |
| `src/App.jsx` | React frontend: fund list, quarter selector, stat tiles, holdings table, QoQ diff, add-fund flow |
| `src/mock.js` | Mock data layer (deterministic portfolios) — the app runs on it with zero setup |
| `src/data.js` | Supabase data layer (same interface as the mock) |
| `src/api.js` | Auto-switch: Supabase when `VITE_SUPABASE_URL` is set, otherwise mock |
| `BACKLOG.md` | Feature backlog |

## Run the frontend

```bash
npm install
npm run dev        # mock data, no configuration needed
```

To point it at a real Supabase project, copy `.env.example` to `.env.local`
and fill in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — the app switches
off mock data automatically.

## Setup

1. **Supabase**: create a project at supabase.com, then run the three files in
   `supabase/migrations/` (in order) and `supabase/seed.sql` in the SQL Editor.
2. **GitHub secrets** (repo → Settings → Secrets → Actions):
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (service_role — never in the frontend),
   `SEC_USER_AGENT` (e.g. `13f-dashboard you@example.com`).
3. **First ingest**: run the `ingest-13f` workflow manually (Actions →
   workflow_dispatch), or locally:
   ```bash
   npm install
   # no credentials needed — parses one fund from EDGAR and prints it:
   npm run ingest:dry-run
   # real run:
   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run ingest
   ```
4. **Frontend**: create `.env.local` from `.env.example` (anon key only) and
   the app switches from mock to live data automatically.

## Supabase MCP (optional, for Claude Code)

This repo's Claude Code environment currently has **no Supabase MCP server**,
so project creation/SQL can't be automated from a session. To enable it, add
the official server with a personal access token
(supabase.com → Account → Access Tokens):

```bash
claude mcp add supabase -- npx -y @supabase/mcp-server-supabase@latest --access-token=<your-token>
```

For remote/web sessions, add the same server in the environment's MCP settings
and make sure the network policy allows `*.supabase.com` / `*.supabase.co`.

## Data caveats

- 13F is filed up to 45 days after quarter-end — data can be ~5 months stale.
- Long US equities only: no shorts, options detail, cash, bonds, or non-US holdings.
- The SEC does not verify 13F accuracy — treat it as reported, not audited.
- EDGAR gives CUSIPs, not tickers; pre-2023 filings report values in $1000s
  (the ingest job normalizes to whole dollars).
