-- Starter fund list. CIKs are in App.jsx (the SEED_FUNDS array) — copy the
-- remaining values from there.
--
-- ⚠️ Verify every CIK on EDGAR before trusting the data
-- (https://www.sec.gov/cgi-bin/browse-edgar, filter form type 13F-HR).
-- Some managers file under holding-company or family-office names, and a
-- wrong CIK will silently pull the wrong portfolio.
insert into funds (cik, name, manager) values
  ('0001067983', 'Berkshire Hathaway', 'Warren Buffett'),
  ('0001649339', 'Scion Asset Management', 'Michael Burry'),
  ('0001336528', 'Pershing Square', 'Bill Ackman')
  -- …add the rest from SEED_FUNDS in App.jsx
on conflict (cik) do nothing;
