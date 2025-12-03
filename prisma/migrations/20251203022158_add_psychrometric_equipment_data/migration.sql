-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "psychrometricAssessment" TEXT,
ADD COLUMN     "scopeAreas" TEXT,
ADD COLUMN     "equipmentSelection" TEXT,
ADD COLUMN     "equipmentCostTotal" DOUBLE PRECISION,
ADD COLUMN     "estimatedDryingDuration" INTEGER;

