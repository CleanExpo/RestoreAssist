-- Reverse of 20261123000000_ra_7694_room_observations.
--
-- Drops exactly what the forward migration adds, in reverse dependency order:
-- two foreign keys, two indexes, one table (its checks and row-level security
-- go with it) and three enums. Nothing that existed before is touched.
--
-- This DISCARDS data: every recorded room observation (odour, visible growth,
-- staining). Export them first if they must be kept.
--
-- Revert the application code BEFORE running this: code built from the new
-- schema reads this table whenever a report PDF is generated.
--
-- A statement that cannot get its lock within 5 seconds fails instead of making
-- every other query on that table wait behind it. Every drop is IF EXISTS, so
-- the file can be run again after a failure.

SET lock_timeout = '5s';

ALTER TABLE "RoomObservation" DROP CONSTRAINT IF EXISTS "RoomObservation_sketchRoomId_fkey";

ALTER TABLE "RoomObservation" DROP CONSTRAINT IF EXISTS "RoomObservation_inspectionId_fkey";

DROP INDEX IF EXISTS "RoomObservation_sketchRoomId_idx";

DROP INDEX IF EXISTS "RoomObservation_inspectionId_observedAt_idx";

DROP TABLE IF EXISTS "RoomObservation";

DROP TYPE IF EXISTS "RoomOdourPattern";

DROP TYPE IF EXISTS "RoomObservationBasis";

DROP TYPE IF EXISTS "RoomObservationKind";
