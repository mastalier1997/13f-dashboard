-- Row Level Security — do this before you ever have users.
alter table funds enable row level security;
alter table filings enable row level security;
alter table holdings enable row level security;

-- everyone can read:
create policy "public read funds"    on funds    for select using (true);
create policy "public read filings"  on filings  for select using (true);
create policy "public read holdings" on holdings for select using (true);

-- adding funds via the UI (matches the anon insert grant; tighten with real auth later):
create policy "public add funds" on funds for insert with check (custom = true);

-- the ingestion job uses the service_role key, which bypasses RLS.
