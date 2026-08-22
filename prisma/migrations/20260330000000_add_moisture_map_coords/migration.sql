-- Migration: Add mapX/mapY floor plan placement coordinates to MoistureReading
-- Required by MoistureMappingCanvas component for drag-and-drop positioning

ALTER TABLE "MoistureReading"
  ADD COLUMN IF NOT EXISTS "mapX" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "mapY" DOUBLE PRECISION;
