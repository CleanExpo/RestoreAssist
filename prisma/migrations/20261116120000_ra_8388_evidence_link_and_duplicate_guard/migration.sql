-- RA-8388 AMENDMENT 05: link a counted reading to the signed evidence record
-- it was written from, and stop one signed capture being stored twice.
--
-- WHY
--   Guided Capture now writes an EvidenceItem and, in the same transaction,
--   the MoistureReading or EnvironmentalData row the completion gate counts.
--   Nothing in the database joined the two, so another writer could rewrite a
--   reading a signature vouches for, a deleted evidence record left its
--   reading counted with nothing to cite, and a retry after the 60-second
--   idempotency lease could store one measurement twice.
--
-- WHAT IT ADDS
--   MoistureReading.evidenceItemId    nullable, unique, FK -> EvidenceItem(id)
--   EnvironmentalData.evidenceItemId  nullable, unique, FK -> EvidenceItem(id)
--   EvidenceItem.metadataSha256       nullable; set only for a signed
--                                     metadata submission
--   EvidenceItem_signed_capture_key   unique on (inspectionId, evidenceClass,
--                                     metadataSha256, capturedAt)
--
-- ON DELETE NO ACTION, DELIBERATELY NOT CASCADE AND NOT SET NULL
--   A MoistureReading is retained for audit under controlled invalidation
--   (invalidatedAt). CASCADE would hard-delete it when its evidence record
--   went. SET NULL would silently strip the link and leave a reading that
--   looks unsigned. NO ACTION makes Postgres refuse to remove an evidence
--   record that still backs a counted row. NO ACTION rather than RESTRICT
--   because both tables also cascade from Inspection: NO ACTION is checked
--   when the statement ends, so deleting a whole inspection still works.
--
-- CANNOT FAIL ON EXISTING ROWS
--   All three columns are new and NULL on every existing row. A foreign key
--   does not check NULL, and Postgres treats NULLs as distinct in a unique
--   index, so no existing row can violate anything created here. The capture
--   time is in the key because the digest does not contain it: two equal
--   readings taken at different moments must both be stored.
--
-- ADDITIVE
--   Every statement is ADD COLUMN, CREATE UNIQUE INDEX or ADD CONSTRAINT.
--   Nothing is dropped, renamed, retyped, made NOT NULL or rewritten. ADD
--   COLUMN without a default is metadata-only.
--
-- LOCKS, AND WHY THE FILE STARTS WITH A 5 SECOND LOCK TIMEOUT
--   `prisma migrate deploy` (7.10.1) sends this file one statement at a time
--   and each statement commits on its own. It is NOT one transaction. So each
--   lock lasts for its own statement:
--     ADD COLUMN           ACCESS EXCLUSIVE on its table: reads and writes
--                          wait. Brief, no scan.
--     CREATE UNIQUE INDEX  SHARE on its table: writes wait for one full scan.
--     ADD CONSTRAINT       SHARE ROW EXCLUSIVE on its table and on
--                          EvidenceItem: writes wait while every row is checked.
--   Applied by hand in ONE transaction instead (psql --single-transaction),
--   all three tables stay under ACCESS EXCLUSIVE until the commit, through
--   all three index scans and both foreign-key checks.
--   Either way, a statement that has to WAIT for its lock makes every later
--   query on that table queue behind it. lock_timeout stops that: a statement
--   that cannot get its lock within 5 seconds fails instead of stalling the
--   reading pages.
--   Plain SET, not SET LOCAL: with one transaction per statement, SET LOCAL
--   would end with its own statement and protect nothing. The setting lasts
--   for the rest of the migrate session (later migrations in the same deploy
--   also get 5 seconds) and ends when that session closes.
--
-- IF A STATEMENT TIMES OUT
--   Statements before it stay applied; the rest have not run. Prisma marks
--   the migration failed, refuses every later deploy (P3009), and
--   /api/health/migrations reports drift. To recover: run down.sql (every
--   drop there is IF EXISTS), then
--   `prisma migrate resolve --rolled-back
--   20261116120000_ra_8388_evidence_link_and_duplicate_guard`, then deploy
--   again. scripts/ci/ra-8388-migration-applied.sql says which state the
--   database is in. Proven in
--   scripts/ci/__tests__/ra-8388-migration-preconditions.test.ts.
--
-- REVERSIBLE
--   down.sql drops exactly these objects, in reverse order.
--
-- DEPLOY ORDER
--   Apply this BEFORE the code that reads these columns is deployed. Startup
--   does not apply migrations (scripts/start-production.sh). Not applied
--   anywhere; applying to production is the owner's step.

SET lock_timeout = '5s';

ALTER TABLE "MoistureReading" ADD COLUMN "evidenceItemId" TEXT;

ALTER TABLE "EnvironmentalData" ADD COLUMN "evidenceItemId" TEXT;

ALTER TABLE "EvidenceItem" ADD COLUMN "metadataSha256" TEXT;

CREATE UNIQUE INDEX "MoistureReading_evidenceItemId_key"
  ON "MoistureReading"("evidenceItemId");

CREATE UNIQUE INDEX "EnvironmentalData_evidenceItemId_key"
  ON "EnvironmentalData"("evidenceItemId");

CREATE UNIQUE INDEX "EvidenceItem_signed_capture_key"
  ON "EvidenceItem"("inspectionId", "evidenceClass", "metadataSha256", "capturedAt");

ALTER TABLE "MoistureReading"
  ADD CONSTRAINT "MoistureReading_evidenceItemId_fkey"
  FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "EnvironmentalData"
  ADD CONSTRAINT "EnvironmentalData_evidenceItemId_fkey"
  FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
