-- RA-8388: is migration 20261116120000_ra_8388_evidence_link_and_duplicate_guard
-- applied to THIS database?
--
-- READ-ONLY. This file is one SELECT. It reads the catalogue and the Prisma
-- migration ledger and changes nothing. To have the server enforce that as
-- well, run it as:
--
--   PGOPTIONS='-c default_transaction_read_only=on' \
--     psql "<connection string>" -X -q -At -f scripts/ci/ra-8388-migration-applied.sql
--
-- With -X -q -At the output is one line per check and the LAST line is the
-- verdict, exactly one of:
--
--   RA-8388 MIGRATION: APPLIED
--   RA-8388 MIGRATION: NOT APPLIED (<what is missing>)
--
-- It can also be pasted into any SQL editor: the rows come back in that order.
--
-- WHAT IT CHECKS, each by name, in the current schema:
--   the ledger   a _prisma_migrations row for this migration that finished and
--                was not rolled back, with no failed attempt left unresolved
--                (the same rule app/api/health/migrations/route.ts applies)
--   3 columns    MoistureReading.evidenceItemId, EnvironmentalData.evidenceItemId,
--                EvidenceItem.metadataSha256
--   3 indexes    each must be unique and valid
--   2 foreign keys, each validated
--
-- WHY BOTH: the ledger and the objects can disagree. down.sql removes the
-- objects and leaves the ledger row saying "finished"; a failed apply leaves a
-- ledger row and possibly some objects. Either case is NOT APPLIED here.
--
-- A database with no _prisma_migrations table gets a verdict, not an error.

WITH ledger_raw AS (
  SELECT CASE
    WHEN to_regclass('"_prisma_migrations"') IS NULL THEN NULL
    ELSE substring(
      query_to_xml(
        $q$SELECT concat_ws(',',
             count(*),
             count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),
             count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)) AS v
           FROM "_prisma_migrations"
           WHERE migration_name = '20261116120000_ra_8388_evidence_link_and_duplicate_guard'$q$,
        false, true, '')::text
      FROM '<v>([^<]*)</v>')
  END AS v
),
ledger AS (
  SELECT v IS NOT NULL AS has_table,
         COALESCE(split_part(v, ',', 1)::int, 0) AS total,
         COALESCE(split_part(v, ',', 2)::int, 0) AS finished,
         COALESCE(split_part(v, ',', 3)::int, 0) AS unresolved
  FROM ledger_raw
),
checks(ord, label, ok) AS (
  SELECT 1,
         'ledger row 20261116120000_ra_8388_evidence_link_and_duplicate_guard'
           || CASE
                WHEN NOT has_table THEN ' (no _prisma_migrations table)'
                WHEN total = 0 THEN ' (no row)'
                WHEN unresolved > 0 THEN ' (a failed attempt is not resolved)'
                WHEN finished = 0 THEN ' (rolled back only)'
                ELSE ' (finished, not rolled back)'
              END,
         has_table AND finished > 0 AND unresolved = 0
  FROM ledger
  UNION ALL
  SELECT c.ord, 'column ' || c.tbl || '.' || c.col,
         EXISTS (SELECT 1 FROM information_schema.columns k
                 WHERE k.table_schema = current_schema()
                   AND k.table_name = c.tbl AND k.column_name = c.col)
  FROM (VALUES (2, 'MoistureReading', 'evidenceItemId'),
               (3, 'EnvironmentalData', 'evidenceItemId'),
               (4, 'EvidenceItem', 'metadataSha256')) AS c(ord, tbl, col)
  UNION ALL
  SELECT i.ord, 'unique index ' || i.idx,
         EXISTS (SELECT 1 FROM pg_index x
                 JOIN pg_class ic ON ic.oid = x.indexrelid
                 JOIN pg_class tc ON tc.oid = x.indrelid
                 JOIN pg_namespace n ON n.oid = ic.relnamespace
                 WHERE n.nspname = current_schema()
                   AND ic.relname = i.idx AND tc.relname = i.tbl
                   AND x.indisunique AND x.indisvalid)
  FROM (VALUES (5, 'MoistureReading', 'MoistureReading_evidenceItemId_key'),
               (6, 'EnvironmentalData', 'EnvironmentalData_evidenceItemId_key'),
               (7, 'EvidenceItem', 'EvidenceItem_signed_capture_key')) AS i(ord, tbl, idx)
  UNION ALL
  SELECT f.ord, 'foreign key ' || f.con,
         EXISTS (SELECT 1 FROM pg_constraint k
                 JOIN pg_class tc ON tc.oid = k.conrelid
                 JOIN pg_namespace n ON n.oid = tc.relnamespace
                 WHERE n.nspname = current_schema()
                   AND tc.relname = f.tbl AND k.conname = f.con
                   AND k.contype = 'f' AND k.convalidated)
  FROM (VALUES (8, 'MoistureReading', 'MoistureReading_evidenceItemId_fkey'),
               (9, 'EnvironmentalData', 'EnvironmentalData_evidenceItemId_fkey')) AS f(ord, tbl, con)
)
SELECT line FROM (
  SELECT ord, label || ': ' || CASE WHEN ok THEN 'PRESENT' ELSE 'MISSING' END AS line
  FROM checks
  UNION ALL
  SELECT 1000,
         CASE WHEN bool_and(ok) THEN 'RA-8388 MIGRATION: APPLIED'
              ELSE 'RA-8388 MIGRATION: NOT APPLIED ('
                   || string_agg(label, '; ' ORDER BY ord) FILTER (WHERE NOT ok) || ')'
         END
  FROM checks
) AS report
ORDER BY ord;
