-- Reverse of 20261121150000_ra_8498_site_visit.
--
-- Drops exactly what the forward migration adds, in reverse dependency order:
-- four foreign keys, four indexes, one table (its row-level security goes with
-- it) and two enums. Nothing that existed before that migration is touched.
--
-- This DISCARDS data: every recorded site visit (arrival and departure times,
-- who was on site, the front-photo link, the equipment outcome and note, and
-- who submitted it). Export them first if they must be kept. The photos
-- themselves are InspectionPhoto rows and are not touched.
--
-- Revert the application code BEFORE running this: code built from the new
-- schema reads this table on every job submit.
--
-- Every drop here needs an ACCESS EXCLUSIVE lock on its table. A statement
-- that cannot get its lock within 5 seconds fails instead of making every
-- other query on that table wait behind it. Every drop is IF EXISTS, so the
-- file can be run again after a failure, and after a partly applied forward
-- migration.

SET lock_timeout = '5s';

ALTER TABLE "SiteVisit" DROP CONSTRAINT IF EXISTS "SiteVisit_submittedById_fkey";

ALTER TABLE "SiteVisit" DROP CONSTRAINT IF EXISTS "SiteVisit_frontPhotoId_fkey";

ALTER TABLE "SiteVisit" DROP CONSTRAINT IF EXISTS "SiteVisit_technicianId_fkey";

ALTER TABLE "SiteVisit" DROP CONSTRAINT IF EXISTS "SiteVisit_inspectionId_fkey";

DROP INDEX IF EXISTS "SiteVisit_inspectionId_visitNumber_key";

DROP INDEX IF EXISTS "SiteVisit_submittedById_idx";

DROP INDEX IF EXISTS "SiteVisit_technicianId_idx";

DROP INDEX IF EXISTS "SiteVisit_frontPhotoId_idx";

DROP TABLE IF EXISTS "SiteVisit";

DROP TYPE IF EXISTS "SiteVisitEquipmentOutcome";

DROP TYPE IF EXISTS "SiteVisitPresence";
