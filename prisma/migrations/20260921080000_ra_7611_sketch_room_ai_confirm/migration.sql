-- RA-7611: confirmation state for AI-suggested SketchRoom geometry.
--
-- WHAT IT ADDS
--   Five nullable columns on the existing SketchRoom table. Provenance stays
--   a string (no enum to alter); `ai_suggested` is a new legal value written
--   by the application, not a database enum.
--
--   confirmedAt / confirmedBy     set when a technician confirms the room
--   correctionHistory             JSON array of confirm / geometry / label
--                                 entries, matching the RoomPlan pattern
--   originalAreaM2                area as first suggested (pre-correction)
--   originalGeometryJson          geometry snapshot at suggestion time
--
-- ADDITIVE
--   Every statement is ALTER TABLE ... ADD COLUMN with a nullable type.
--   Nothing is dropped, renamed, retyped, or made NOT NULL. Existing rows
--   keep provenance = operator_measured (the column default) and null
--   confirmation fields.
--   `bash scripts/ci/migration-roundtrip.sh additive-only` checks that.
--
-- REVERSIBLE
--   down.sql drops exactly these five columns.

ALTER TABLE "SketchRoom" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "SketchRoom" ADD COLUMN "confirmedBy" TEXT;
ALTER TABLE "SketchRoom" ADD COLUMN "correctionHistory" JSONB;
ALTER TABLE "SketchRoom" ADD COLUMN "originalAreaM2" DOUBLE PRECISION;
ALTER TABLE "SketchRoom" ADD COLUMN "originalGeometryJson" JSONB;
