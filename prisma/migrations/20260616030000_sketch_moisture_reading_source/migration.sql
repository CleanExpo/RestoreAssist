-- RA-6763 pt2: provenance discriminator on SketchMoistureReading.
--
-- "manual" (default) = technician-entered via the moisture-readings route — the
-- validated S500 drying log. "pin" = derived from a sketch moisture overlay pin
-- on save. The pin-sync only ever deletes/recreates rows WHERE source = 'pin',
-- so it can never clobber the curated manual log.
--
-- Additive + backfilled: every existing row becomes 'manual', preserving the
-- current drying-log semantics. Safe to apply via the normal migrate-deploy path.

ALTER TABLE "SketchMoistureReading"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX "SketchMoistureReading_sketchId_source_idx"
  ON "SketchMoistureReading" ("sketchId", "source");
