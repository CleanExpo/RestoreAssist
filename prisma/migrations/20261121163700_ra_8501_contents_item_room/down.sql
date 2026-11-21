-- Reverse of 20261121163700_ra_8501_contents_item_room.
--
-- Drops exactly what the forward migration adds, in reverse dependency order:
-- the foreign key, the index, then the column. Nothing that existed before
-- that migration is touched.
--
-- This DISCARDS data: the room each contents item was filed against. Export it
-- first if it must be kept.
--
-- Revert the application code BEFORE running this: code built from the new
-- schema names this column in its ContentsPackOutItem queries.
--
-- Every drop needs an ACCESS EXCLUSIVE lock on its table. A statement that
-- cannot get its lock within 5 seconds fails instead of making every other
-- query on that table wait behind it. Every drop is IF EXISTS, so the file can
-- be run again after a failure, and after a partly applied forward migration.

SET lock_timeout = '5s';

ALTER TABLE "ContentsPackOutItem" DROP CONSTRAINT IF EXISTS "ContentsPackOutItem_sketchRoomId_fkey";

DROP INDEX IF EXISTS "ContentsPackOutItem_sketchRoomId_idx";

ALTER TABLE "ContentsPackOutItem" DROP COLUMN IF EXISTS "sketchRoomId";
