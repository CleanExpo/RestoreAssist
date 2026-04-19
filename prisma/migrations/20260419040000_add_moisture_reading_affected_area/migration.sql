-- RA-1196: affectedArea column for AI-grouped moisture readings.
-- Nullable text label; no FK (lightweight grouping, separate from AffectedArea model).
ALTER TABLE "MoistureReading" ADD COLUMN "affectedArea" TEXT;

CREATE INDEX "MoistureReading_inspectionId_affectedArea_idx"
  ON "MoistureReading"("inspectionId", "affectedArea");
