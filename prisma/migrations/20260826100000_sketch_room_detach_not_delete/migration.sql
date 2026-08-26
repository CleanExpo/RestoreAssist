-- Stop silently orphaning sketch evidence.
--
-- On every sketch save the room-graph sync hard-deleted any SketchRoom whose
-- fabricObjectId was absent from the incoming canvas. EvidencePin,
-- SketchMoistureReading and Hazard all reference SketchRoom with
-- ON DELETE SET NULL, so those deletes quietly cleared the room link on
-- evidence that had already been captured -- no error, no record of which
-- room the reading or photo came from.
--
-- This was not limited to genuinely deleted rooms. When a room object carries
-- no data.id, resolveFabricObjectId() derives the id from a hash of the
-- object's array index, position and size, so simply DRAGGING or RESIZING a
-- room produced a new id, marked the old row stale, and deleted it.
--
-- A room that still carries evidence is now retained and marked detached
-- instead. Nullable column, no backfill: every existing row reads as attached,
-- which is the pre-migration behaviour.
ALTER TABLE "SketchRoom"
  ADD COLUMN "detachedAt" TIMESTAMP(3);

CREATE INDEX "SketchRoom_sketchId_detachedAt_idx"
  ON "SketchRoom"("sketchId", "detachedAt");
