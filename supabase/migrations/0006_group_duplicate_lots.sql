-- Collapse duplicate lots of one security within a filing.
--
-- 13F information tables carry one row per manager/discretion split, so a
-- single stake (e.g. Berkshire's Apple position) appears as several rows
-- sharing a CUSIP. The dashboard wants one row per security. The ingest
-- script now groups before inserting; this fixes rows already stored.

with dupes as (
  select filing_id,
         coalesce(cusip, name) as grp,
         min(id)               as keep_id,
         sum(shares)           as shares,
         sum(value)            as value
  from holdings
  group by filing_id, coalesce(cusip, name)
  having count(*) > 1
)
update holdings h
set shares = d.shares,
    value  = d.value
from dupes d
where h.id = d.keep_id;

delete from holdings h
using (
  select filing_id, coalesce(cusip, name) as grp, min(id) as keep_id
  from holdings
  group by filing_id, coalesce(cusip, name)
  having count(*) > 1
) d
where h.filing_id = d.filing_id
  and coalesce(h.cusip, h.name) = d.grp
  and h.id <> d.keep_id;
