-- RoomGraph V1 + Evidence pins on floor plan (SKETCH-002 / EVD photo-on-plan P0)

CREATE TABLE IF NOT EXISTS "SketchRoom" (
    "id" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "fabricObjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Room',
    "areaM2" DOUBLE PRECISION,
    "perimeterM" DOUBLE PRECISION,
    "heightM" DOUBLE PRECISION,
    "floorNumber" INTEGER NOT NULL DEFAULT 0,
    "materialSlug" TEXT,
    "waterCategory" TEXT,
    "dryingStatus" TEXT NOT NULL DEFAULT 'unknown',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "geometryJson" JSONB,
    "provenance" TEXT NOT NULL DEFAULT 'operator_measured',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SketchRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EvidencePin" (
    "id" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "sketchRoomId" TEXT,
    "inspectionPhotoId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'photo',
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "nx" DOUBLE PRECISION,
    "ny" DOUBLE PRECISION,
    "rotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fileUrl" TEXT,
    "thumbnailUrl" TEXT,
    "fileName" TEXT,
    "fileMimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "caption" TEXT,
    "capturedByUserId" TEXT,
    "captureSource" TEXT NOT NULL DEFAULT 'web',
    "offlineQueued" BOOLEAN NOT NULL DEFAULT false,
    "syncState" TEXT NOT NULL DEFAULT 'synced',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidencePin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SketchRoom_sketchId_fabricObjectId_key" ON "SketchRoom"("sketchId", "fabricObjectId");
CREATE INDEX IF NOT EXISTS "SketchRoom_sketchId_idx" ON "SketchRoom"("sketchId");
CREATE INDEX IF NOT EXISTS "SketchRoom_sketchId_floorNumber_idx" ON "SketchRoom"("sketchId", "floorNumber");

CREATE INDEX IF NOT EXISTS "EvidencePin_sketchId_idx" ON "EvidencePin"("sketchId");
CREATE INDEX IF NOT EXISTS "EvidencePin_sketchRoomId_idx" ON "EvidencePin"("sketchRoomId");
CREATE INDEX IF NOT EXISTS "EvidencePin_inspectionPhotoId_idx" ON "EvidencePin"("inspectionPhotoId");
CREATE INDEX IF NOT EXISTS "EvidencePin_sketchId_kind_idx" ON "EvidencePin"("sketchId", "kind");

ALTER TABLE "SketchRoom" ADD CONSTRAINT "SketchRoom_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "ClaimSketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidencePin" ADD CONSTRAINT "EvidencePin_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "ClaimSketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidencePin" ADD CONSTRAINT "EvidencePin_sketchRoomId_fkey" FOREIGN KEY ("sketchRoomId") REFERENCES "SketchRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
