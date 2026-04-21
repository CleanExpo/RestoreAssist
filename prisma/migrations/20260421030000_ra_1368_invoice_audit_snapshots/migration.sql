-- RA-1368: Invoice audit-trail snapshots.
--
-- Adds immutable denormalised copies of Report / Estimate / Client fields onto
-- Invoice rows at creation time. If the source row is later deleted (admin
-- cleanup, compliance purge, sample-data wipe), the Invoice retains the
-- human-readable breadcrumb — ATO audits, insurer disputes, and customer
-- complaints can still answer "which job did we bill for?".
--
-- This migration ESTABLISHES THE COLUMNS AND BACKFILLS from current parent
-- rows. The code-path change to populate at creation time is tracked as a
-- follow-up ticket (the callsites are in
-- lib/invoices/create.ts and app/api/invoices/route.ts).

-- Step 1: add columns (nullable, no default — no table rewrite)
ALTER TABLE "Invoice" ADD COLUMN "reportTitleSnapshot"   VARCHAR(256);
ALTER TABLE "Invoice" ADD COLUMN "reportAddressSnapshot" VARCHAR(512);
ALTER TABLE "Invoice" ADD COLUMN "estimateRefSnapshot"   VARCHAR(128);
ALTER TABLE "Invoice" ADD COLUMN "clientNameSnapshot"    VARCHAR(256);

-- Step 2: backfill from live parent rows.
--   Report  → title + propertyAddress  (the human fields as of 2026-04-21)
--   Estimate → "Estimate-<id8>-v<version>" (Estimate has no dedicated number)
--   Client  → name
-- If a parent was already NULL at creation time, the snapshot stays NULL — we
-- don't fabricate a breadcrumb.

UPDATE "Invoice" i
SET "reportTitleSnapshot"   = r."title",
    "reportAddressSnapshot" = r."propertyAddress"
FROM "Report" r
WHERE i."reportId" = r."id"
  AND i."reportTitleSnapshot" IS NULL;

UPDATE "Invoice" i
SET "estimateRefSnapshot" = 'Estimate-' || substring(e."id" FROM 1 FOR 8) || '-v' || e."version"
FROM "Estimate" e
WHERE i."estimateId" = e."id"
  AND i."estimateRefSnapshot" IS NULL;

UPDATE "Invoice" i
SET "clientNameSnapshot" = c."name"
FROM "Client" c
WHERE i."clientId" = c."id"
  AND i."clientNameSnapshot" IS NULL;
