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
--   COLUMN without a default is metadata-only. Each CREATE UNIQUE INDEX scans
--   its table once and holds a write lock on it for that scan.
--
-- REVERSIBLE
--   down.sql drops exactly these objects, in reverse order.
--
-- DEPLOY ORDER
--   Apply this BEFORE the code that reads these columns is deployed. Startup
--   does not apply migrations (scripts/start-production.sh). Not applied
--   anywhere; applying to production is the owner's step.

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
