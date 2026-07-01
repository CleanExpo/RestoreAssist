-- RA-120 (PR4b): floorplan completeness — persist per-floor underlay transform.
--
-- The reposition/scale controls need the underlay's scale + x/y offset to
-- round-trip through save/load per floor. NULL columns mean the legacy
-- fit-to-width baseline (scale 1, no offset, aspect locked), so existing rows
-- render exactly as before.
--
-- Additive only — nullable columns, no existing data altered. Safe to apply via
-- the normal migrate-deploy path.

-- AlterTable
ALTER TABLE "ClaimSketch" ADD COLUMN "backgroundImageScale" DOUBLE PRECISION;
ALTER TABLE "ClaimSketch" ADD COLUMN "backgroundImageOffsetX" DOUBLE PRECISION;
ALTER TABLE "ClaimSketch" ADD COLUMN "backgroundImageOffsetY" DOUBLE PRECISION;
