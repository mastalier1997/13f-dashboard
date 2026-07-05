-- Per-filing aggregates for the dashboard stat tiles.
--
-- Some filers report tens of thousands of positions per quarter; the Data API
-- caps responses at 1000 rows, so summing value client-side would silently
-- undercount. Aggregate in the DB instead.
-- security_invoker so the view respects the tables' RLS policies.

create view filing_summary
  with (security_invoker = true) as
select
  f.cik,
  f.quarter,
  f.period_end,
  f.filed_date,
  count(h.id)::int          as positions,
  coalesce(sum(h.value), 0) as total_value
from filings f
left join holdings h on h.filing_id = f.id
group by f.id;

grant select on filing_summary to anon, authenticated;
