-- Sketch V3 — Wall-Graph (Encircle-grade)
-- Topology: corners + walls + openings + derived rooms.
-- Source-of-truth for queries; ClaimSketch.sketchData JSON remains a fast-load cache.

-- CreateTable
CREATE TABLE "FloorPlanV3" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "floorIndex" INTEGER NOT NULL DEFAULT 0,
    "floorLabel" TEXT NOT NULL DEFAULT 'Ground Floor',
    "pxPerMetre" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "northRotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "origin" JSONB,
    "geoTransform" JSONB,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceFootprintId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorPlanV3_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorCornerV3" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,

    CONSTRAINT "FloorCornerV3_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorWallV3" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "fromCornerId" TEXT NOT NULL,
    "toCornerId" TEXT NOT NULL,
    "thicknessMm" INTEGER NOT NULL DEFAULT 110,
    "isExterior" BOOLEAN NOT NULL DEFAULT false,
    "height" DOUBLE PRECISION,
    "finishLeft" TEXT,
    "finishRight" TEXT,
    "metadata" JSONB,

    CONSTRAINT "FloorWallV3_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorOpeningV3" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "wallId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "positionM" DOUBLE PRECISION NOT NULL,
    "widthM" DOUBLE PRECISION NOT NULL,
    "heightM" DOUBLE PRECISION,
    "sillHeightM" DOUBLE PRECISION,
    "swingDir" TEXT,
    "metadata" JSONB,

    CONSTRAINT "FloorOpeningV3_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorRoomV3" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Room',
    "roomType" TEXT,
    "cornerCycle" JSONB NOT NULL,
    "centroidX" DOUBLE PRECISION NOT NULL,
    "centroidY" DOUBLE PRECISION NOT NULL,
    "areaM2" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "FloorRoomV3_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FloorPlanV3_inspectionId_idx" ON "FloorPlanV3"("inspectionId");

-- CreateIndex
CREATE INDEX "FloorPlanV3_inspectionId_floorIndex_idx" ON "FloorPlanV3"("inspectionId", "floorIndex");

-- CreateIndex
CREATE INDEX "FloorCornerV3_floorPlanId_idx" ON "FloorCornerV3"("floorPlanId");

-- CreateIndex
CREATE INDEX "FloorWallV3_floorPlanId_idx" ON "FloorWallV3"("floorPlanId");

-- CreateIndex
CREATE INDEX "FloorWallV3_fromCornerId_idx" ON "FloorWallV3"("fromCornerId");

-- CreateIndex
CREATE INDEX "FloorWallV3_toCornerId_idx" ON "FloorWallV3"("toCornerId");

-- CreateIndex
CREATE INDEX "FloorOpeningV3_wallId_idx" ON "FloorOpeningV3"("wallId");

-- CreateIndex
CREATE INDEX "FloorOpeningV3_floorPlanId_idx" ON "FloorOpeningV3"("floorPlanId");

-- CreateIndex
CREATE INDEX "FloorRoomV3_floorPlanId_idx" ON "FloorRoomV3"("floorPlanId");

-- AddForeignKey
ALTER TABLE "FloorPlanV3" ADD CONSTRAINT "FloorPlanV3_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorCornerV3" ADD CONSTRAINT "FloorCornerV3_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlanV3"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorWallV3" ADD CONSTRAINT "FloorWallV3_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlanV3"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorOpeningV3" ADD CONSTRAINT "FloorOpeningV3_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlanV3"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorOpeningV3" ADD CONSTRAINT "FloorOpeningV3_wallId_fkey" FOREIGN KEY ("wallId") REFERENCES "FloorWallV3"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorRoomV3" ADD CONSTRAINT "FloorRoomV3_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlanV3"("id") ON DELETE CASCADE ON UPDATE CASCADE;
