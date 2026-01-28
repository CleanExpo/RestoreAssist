-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN "floorPlanImageUrl" TEXT;

-- AlterTable
ALTER TABLE "MoistureReading" ADD COLUMN "mapX" DOUBLE PRECISION,
ADD COLUMN "mapY" DOUBLE PRECISION;
