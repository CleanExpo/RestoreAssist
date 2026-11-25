-- Reverse of 20261123120000_staff_training_register.
--
-- Drops exactly what the forward migration adds, in reverse dependency order:
-- two foreign keys, two indexes and one table (its checks and row-level
-- security go with it). Nothing that existed before is touched.
--
-- This DISCARDS data: every staff training record. Export them first if they
-- must be kept.
--
-- Revert the application code BEFORE running this: code built from the new
-- schema reads this table on the team training page.
--
-- A statement that cannot get its lock within 5 seconds fails instead of making
-- every other query on that table wait behind it. Every drop is IF EXISTS, so
-- the file can be run again after a failure.

SET lock_timeout = '5s';

ALTER TABLE "StaffTrainingRecord" DROP CONSTRAINT IF EXISTS "StaffTrainingRecord_staffUserId_fkey";

ALTER TABLE "StaffTrainingRecord" DROP CONSTRAINT IF EXISTS "StaffTrainingRecord_organizationId_fkey";

DROP INDEX IF EXISTS "StaffTrainingRecord_staffUserId_idx";

DROP INDEX IF EXISTS "StaffTrainingRecord_organizationId_staffUserId_idx";

DROP TABLE IF EXISTS "StaffTrainingRecord";
