-- RA-446: Inspection photo label schema — IICRC S500:2025 compliance
-- Sprint M — 2026-04-07
-- Adds 13 required + 2 optional label fields to InspectionPhoto for
-- structured evidence documentation per S500:2025 §10–§16.

-- AlterTable: InspectionPhoto — add label schema fields
ALTER TABLE "InspectionPhoto"
  ADD COLUMN "damageCategory"            TEXT,
  ADD COLUMN "damageClass"               TEXT,
  ADD COLUMN "s500SectionRef"            TEXT,
  ADD COLUMN "roomType"                  TEXT,
  ADD COLUMN "moistureSource"            TEXT,
  ADD COLUMN "affectedMaterial"          TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "surfaceOrientation"        TEXT,
  ADD COLUMN "damageExtentEstimate"      TEXT,
  ADD COLUMN "equipmentVisible"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "secondaryDamageIndicators" TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "photoStage"                TEXT,
  ADD COLUMN "captureAngle"              TEXT,
  ADD COLUMN "labelledBy"                TEXT    NOT NULL DEFAULT 'HUMAN_TECH',
  ADD COLUMN "technicianNotes"           TEXT,
  ADD COLUMN "moistureReadingLink"       TEXT;

-- Index: support evidence screen filter queries (RA-448)
CREATE INDEX "InspectionPhoto_roomType_idx"       ON "InspectionPhoto"("roomType");
CREATE INDEX "InspectionPhoto_damageCategory_idx" ON "InspectionPhoto"("damageCategory");
CREATE INDEX "InspectionPhoto_photoStage_idx"     ON "InspectionPhoto"("photoStage");
CREATE INDEX "InspectionPhoto_labelledBy_idx"     ON "InspectionPhoto"("labelledBy");
