-- Funds you track. Seed with the 20 in the app, add more anytime.
create table funds (
  cik        text primary key,          -- 10-digit, zero-padded
  name       text not null,
  manager    text,
  custom     boolean default false,     -- true = you added it via the UI
  created_at timestamptz default now()
);

-- One row per fund per reporting period.
create table filings (
  id           bigint generated always as identity primary key,
  cik          text references funds(cik) on delete cascade,
  quarter      text not null,           -- e.g. 'Q1 2025'
  period_end   date not null,           -- e.g. 2025-03-31
  filed_date   date,                    -- when the fund actually filed
  accession_no text,                    -- EDGAR accession, for dedupe
  unique (cik, quarter)
);

-- The holdings line items (the 13F information table).
create table holdings (
  id          bigint generated always as identity primary key,
  filing_id   bigint references filings(id) on delete cascade,
  ticker      text,                     -- may be null; EDGAR gives CUSIP
  cusip       text,
  name        text,
  shares      bigint,
  value       bigint                    -- normalized to whole dollars
);

create index on filings (cik);
create index on holdings (filing_id);
