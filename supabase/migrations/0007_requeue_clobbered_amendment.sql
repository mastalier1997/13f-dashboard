-- One-time repair: Berkshire's Q1 2025 was clobbered by its NEW HOLDINGS
-- amendment (0000950123-25-008361) — the old ingest treated every amendment
-- as a full restatement and replaced the $257B portfolio with the 4
-- previously-confidential positions. Drop the row (cascades to holdings) so
-- the next ingest run rebuilds the quarter with the merge-aware logic.

delete from filings
where cik = '0001067983'
  and quarter = 'Q1 2025';
