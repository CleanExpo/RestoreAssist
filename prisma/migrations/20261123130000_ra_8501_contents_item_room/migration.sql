-- RA-8501 (DRC S8): file a contents item against the room it was found in.
-- Additive only: one nullable column, one index, one foreign key.
-- No backfill: existing items keep a NULL room.
--
-- SketchRoom is the one room identity (D-009). ON DELETE SET NULL matches the
-- other evidence links (MoistureReading, Hazard, EvidencePin); a sketch save
-- detaches a room that holds items rather than deleting it.

ALTER TABLE "ContentsPackOutItem" ADD COLUMN "sketchRoomId" TEXT;

CREATE INDEX "ContentsPackOutItem_sketchRoomId_idx" ON "ContentsPackOutItem"("sketchRoomId");

ALTER TABLE "ContentsPackOutItem" ADD CONSTRAINT "ContentsPackOutItem_sketchRoomId_fkey" FOREIGN KEY ("sketchRoomId") REFERENCES "SketchRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
