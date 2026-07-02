-- Data API grant (required for Supabase projects created after 2026-05-30).
-- Newer projects need explicit Postgres grants before tables are reachable
-- through the auto-generated REST API.
grant usage on schema public to anon, authenticated;
grant select on funds, filings, holdings to anon, authenticated;
-- writes (adding funds) — tighten this later when you add real auth:
grant insert on funds to anon;
