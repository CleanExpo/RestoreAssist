-- RA-120 (PR4): floorplan completeness — persist per-floor underlay opacity.
--
-- The opacity slider previously lived in React state only and reset to the
-- default (0.35) on every reload (data loss). This column lets the value
-- round-trip through save/load per floor.
--
-- Additive only — nullable column, no existing data altered. Safe to apply via
-- the normal migrate-deploy path.

-- AlterTable
ALTER TABLE "ClaimSketch" ADD COLUMN "backgroundImageOpacity" DOUBLE PRECISION;
