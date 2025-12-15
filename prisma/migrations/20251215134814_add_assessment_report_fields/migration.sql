-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "accessNotes" TEXT,
ADD COLUMN     "biologicalMouldVisibleGrowth" BOOLEAN,
ADD COLUMN     "buildingAge" INTEGER,
ADD COLUMN     "methamphetamineScreen" BOOLEAN,
ADD COLUMN     "methamphetamineTestCount" INTEGER,
ADD COLUMN     "phase1EndDate" TIMESTAMP(3),
ADD COLUMN     "phase1StartDate" TIMESTAMP(3),
ADD COLUMN     "phase2EndDate" TIMESTAMP(3),
ADD COLUMN     "phase2StartDate" TIMESTAMP(3),
ADD COLUMN     "phase3EndDate" TIMESTAMP(3),
ADD COLUMN     "phase3StartDate" TIMESTAMP(3),
ADD COLUMN     "structureType" TEXT;
