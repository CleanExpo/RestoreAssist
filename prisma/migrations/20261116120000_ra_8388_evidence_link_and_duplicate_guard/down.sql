-- Reverse of 20261116120000_ra_8388_evidence_link_and_duplicate_guard.
--
-- Drops exactly the two foreign keys, three indexes and three columns the
-- forward migration adds, in reverse order. Nothing that existed before that
-- migration is touched. Every reading, ambient row and evidence record stays;
-- only the link between them and the stored digest are removed.
--
-- Revert the application code BEFORE running this: code built from the new
-- schema names these columns in every query on the three tables.

ALTER TABLE "EnvironmentalData" DROP CONSTRAINT IF EXISTS "EnvironmentalData_evidenceItemId_fkey";

ALTER TABLE "MoistureReading" DROP CONSTRAINT IF EXISTS "MoistureReading_evidenceItemId_fkey";

DROP INDEX IF EXISTS "EvidenceItem_signed_capture_key";

DROP INDEX IF EXISTS "EnvironmentalData_evidenceItemId_key";

DROP INDEX IF EXISTS "MoistureReading_evidenceItemId_key";

ALTER TABLE "EvidenceItem" DROP COLUMN IF EXISTS "metadataSha256";

ALTER TABLE "EnvironmentalData" DROP COLUMN IF EXISTS "evidenceItemId";

ALTER TABLE "MoistureReading" DROP COLUMN IF EXISTS "evidenceItemId";
