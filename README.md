# 13f-dashboard

A personal 13F holdings tracker. React + TypeScript frontend (Vite, Tailwind),
Supabase (Postgres) backend, SEC EDGAR as the free data source. See
**[BACKLOG.md](BACKLOG.md)** for the prioritized feature backlog.

```
  SEC EDGAR (free)                Supabase (Postgres)            React app
 ┌────────────────┐   ingest    ┌────────────────────┐  query  ┌──────────────┐
 │ submissions API │ ─────────▶ │  funds             │ ◀────── │  src/data.ts │
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
| `supabase/seed.sql` | Starter fund list |
| `scripts/ingest.ts` | EDGAR → Supabase ingestion job (run via `tsx`) |
| `.github/workflows/ingest.yml` | Daily cron (06:00 UTC) + manual trigger |
| `src/data.ts` | Supabase data layer the React app imports |
| `src/App.tsx` | Fund list → filings → holdings dashboard UI |
| `BACKLOG.md` | Feature backlog |

## Setup

1. **Supabase**: `npx supabase login`, then `npx supabase link --project-ref <ref>`
   and `npx supabase db push --include-seed` to apply the 3 migrations + seed data.
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
4. **Frontend**: create `.env.local` from `.env.example` (anon key only —
   `npx supabase projects api-keys --project-ref <ref>` prints it), then
   `npm install && npm run dev`.

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
