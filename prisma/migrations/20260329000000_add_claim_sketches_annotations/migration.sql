-- Migration: Add ClaimSketch and SketchAnnotation models (RA-89)
-- V2: Sketch & Property Data Foundation

-- CreateTable: ClaimSketch
CREATE TABLE "ClaimSketch" (
    "id"                 TEXT NOT NULL,
    "inspectionId"       TEXT NOT NULL,
    "floorNumber"        INTEGER NOT NULL DEFAULT 0,
    "floorLabel"         TEXT NOT NULL DEFAULT 'Ground Floor',
    "sketchType"         TEXT NOT NULL DEFAULT 'structural',
    "sketchData"         JSONB,
    "backgroundImageUrl" TEXT,
    "moisturePoints"     JSONB,
    "equipmentPoints"    JSONB,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimSketch_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SketchAnnotation
CREATE TABLE "SketchAnnotation" (
    "id"        TEXT NOT NULL,
    "sketchId"  TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "data"      JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SketchAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClaimSketch_inspectionId_idx" ON "ClaimSketch"("inspectionId");
CREATE INDEX "ClaimSketch_inspectionId_floorNumber_idx" ON "ClaimSketch"("inspectionId", "floorNumber");
CREATE INDEX "SketchAnnotation_sketchId_idx" ON "SketchAnnotation"("sketchId");

-- AddForeignKey: ClaimSketch → Inspection
ALTER TABLE "ClaimSketch"
    ADD CONSTRAINT "ClaimSketch_inspectionId_fkey"
    FOREIGN KEY ("inspectionId")
    REFERENCES "Inspection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SketchAnnotation → ClaimSketch
ALTER TABLE "SketchAnnotation"
    ADD CONSTRAINT "SketchAnnotation_sketchId_fkey"
    FOREIGN KEY ("sketchId")
    REFERENCES "ClaimSketch"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
