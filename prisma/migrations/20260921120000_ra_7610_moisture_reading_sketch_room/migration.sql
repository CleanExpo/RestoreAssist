-- RA-7610: link MoistureReading to a drawn SketchRoom, and keep typed
-- affected-area height.
--
-- WHAT IT ADDS
--   MoistureReading.sketchRoomId  nullable FK → SketchRoom, ON DELETE SET NULL
--                                 plus an index. Existing rows stay null; the
--                                 owner-run backfill (scripts/backfill-moisture-
--                                 reading-sketch-room.ts) is NOT in this file
--                                 and does not run on deploy.
--   AffectedArea.height           nullable metres. The draft-snapshot zod
--                                 schema used to strip a typed room height, so
--                                 it never landed. Nullable, no backfill.
--
-- ADDITIVE
--   Every statement is ALTER TABLE ... ADD COLUMN / CREATE INDEX /
--   ADD CONSTRAINT. Nothing is dropped, renamed, retyped, or made NOT NULL.
--
-- REVERSIBLE
--   down.sql drops exactly these objects, in reverse order.

ALTER TABLE "MoistureReading" ADD COLUMN "sketchRoomId" TEXT;

CREATE INDEX "MoistureReading_sketchRoomId_idx"
  ON "MoistureReading"("sketchRoomId");

ALTER TABLE "MoistureReading"
  ADD CONSTRAINT "MoistureReading_sketchRoomId_fkey"
  FOREIGN KEY ("sketchRoomId") REFERENCES "SketchRoom"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AffectedArea" ADD COLUMN "height" DOUBLE PRECISION;
