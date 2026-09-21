-- Reverse of 20260921080000_ra_7611_sketch_room_ai_confirm.
--
-- Drops exactly the five nullable columns the forward migration adds.
-- Nothing that existed before this migration is touched. Existing
-- SketchRoom rows keep their identity, geometry and provenance.

ALTER TABLE "SketchRoom" DROP COLUMN IF EXISTS "originalGeometryJson";
ALTER TABLE "SketchRoom" DROP COLUMN IF EXISTS "originalAreaM2";
ALTER TABLE "SketchRoom" DROP COLUMN IF EXISTS "correctionHistory";
ALTER TABLE "SketchRoom" DROP COLUMN IF EXISTS "confirmedBy";
ALTER TABLE "SketchRoom" DROP COLUMN IF EXISTS "confirmedAt";
