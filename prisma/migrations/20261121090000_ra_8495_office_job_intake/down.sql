-- Reverse of 20261121090000_ra_8495_office_job_intake.
--
-- Drops exactly what the forward migration adds, in reverse dependency order:
-- two foreign keys, one unique index, one table (its row-level security goes
-- with it), eight Inspection columns, one Organization column and one enum.
-- Nothing that existed before that migration is touched.
--
-- This DISCARDS data: every issued job number, the per-organisation counters,
-- each organisation's prefix, and the office intake details (policy number,
-- client type, insured name, phone and email, office notes). Export them first
-- if they must be kept.
--
-- Revert the application code BEFORE running this: code built from the new
-- schema names these columns in its Inspection queries.
--
-- Every drop here needs an ACCESS EXCLUSIVE lock on its table. A statement
-- that cannot get its lock within 5 seconds fails instead of making every
-- other query on that table wait behind it. Every drop is IF EXISTS, so the
-- file can be run again after a failure, and after a partly applied forward
-- migration.

SET lock_timeout = '5s';

ALTER TABLE "Inspection" DROP CONSTRAINT IF EXISTS "Inspection_jobNumberOrganizationId_fkey";

ALTER TABLE "OrganizationJobSequence" DROP CONSTRAINT IF EXISTS "OrganizationJobSequence_organizationId_fkey";

DROP INDEX IF EXISTS "Inspection_jobNumberOrganizationId_jobNumber_key";

DROP TABLE IF EXISTS "OrganizationJobSequence";

ALTER TABLE "Inspection"
  DROP COLUMN IF EXISTS "officeNotes",
  DROP COLUMN IF EXISTS "insuredEmail",
  DROP COLUMN IF EXISTS "insuredPhone",
  DROP COLUMN IF EXISTS "insuredName",
  DROP COLUMN IF EXISTS "clientType",
  DROP COLUMN IF EXISTS "policyNumber",
  DROP COLUMN IF EXISTS "jobNumberOrganizationId",
  DROP COLUMN IF EXISTS "jobNumber";

ALTER TABLE "Organization" DROP COLUMN IF EXISTS "jobNumberPrefix";

DROP TYPE IF EXISTS "JobClientType";
