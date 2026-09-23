-- Reverse of 20260921120000_ra_7610_moisture_reading_sketch_room.
--
-- Drops exactly the column, index and foreign key the forward migration
-- adds. Nothing that existed before this migration is touched. Existing
-- MoistureReading rows keep their free-text location; AffectedArea rows
-- keep every other column.

ALTER TABLE "MoistureReading" DROP CONSTRAINT IF EXISTS "MoistureReading_sketchRoomId_fkey";

DROP INDEX IF EXISTS "MoistureReading_sketchRoomId_idx";

ALTER TABLE "MoistureReading" DROP COLUMN IF EXISTS "sketchRoomId";

ALTER TABLE "AffectedArea" DROP COLUMN IF EXISTS "height";
