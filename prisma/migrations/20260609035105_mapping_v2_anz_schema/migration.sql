-- AlterTable
ALTER TABLE "ClaimSketch" ADD COLUMN     "captureAdapter" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'AU',
ADD COLUMN     "totalFloorAreaM2" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "SketchElement" (
    "id" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "geometryJson" JSONB NOT NULL,
    "dimensionsM" JSONB,
    "materialId" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'operator_measured',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SketchElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT[],
    "dryStandardMc" DOUBLE PRECISION NOT NULL,
    "isPotentialAcm" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hazard" (
    "id" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "elementId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'suspected',
    "whsPathwayNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hazard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceContext" (
    "id" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "pathway" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SketchMoistureReading" (
    "id" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "elementId" TEXT,
    "materialId" TEXT,
    "waterCategory" TEXT,
    "targetMc" DOUBLE PRECISION,
    "currentMc" DOUBLE PRECISION NOT NULL,
    "dryStandardMet" BOOLEAN NOT NULL DEFAULT false,
    "readingDatetime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SketchMoistureReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SketchElement_sketchId_idx" ON "SketchElement"("sketchId");

-- CreateIndex
CREATE INDEX "SketchElement_sketchId_provenance_idx" ON "SketchElement"("sketchId", "provenance");

-- CreateIndex
CREATE INDEX "SketchElement_materialId_idx" ON "SketchElement"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_slug_key" ON "Material"("slug");

-- CreateIndex
CREATE INDEX "Hazard_sketchId_idx" ON "Hazard"("sketchId");

-- CreateIndex
CREATE INDEX "Hazard_elementId_idx" ON "Hazard"("elementId");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceContext_sketchId_key" ON "InsuranceContext"("sketchId");

-- CreateIndex
CREATE INDEX "SketchMoistureReading_sketchId_idx" ON "SketchMoistureReading"("sketchId");

-- CreateIndex
CREATE INDEX "SketchMoistureReading_elementId_idx" ON "SketchMoistureReading"("elementId");

-- CreateIndex
CREATE INDEX "SketchMoistureReading_materialId_idx" ON "SketchMoistureReading"("materialId");

-- AddForeignKey
ALTER TABLE "SketchElement" ADD CONSTRAINT "SketchElement_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "ClaimSketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchElement" ADD CONSTRAINT "SketchElement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hazard" ADD CONSTRAINT "Hazard_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "ClaimSketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hazard" ADD CONSTRAINT "Hazard_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "SketchElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceContext" ADD CONSTRAINT "InsuranceContext_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "ClaimSketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchMoistureReading" ADD CONSTRAINT "SketchMoistureReading_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "ClaimSketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchMoistureReading" ADD CONSTRAINT "SketchMoistureReading_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "SketchElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchMoistureReading" ADD CONSTRAINT "SketchMoistureReading_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

