-- Add missing fields for Assessment Report data architecture

-- Property Intelligence
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "buildingAge" INTEGER;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "structureType" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "accessNotes" TEXT;

-- Hazard Profile
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "methamphetamineScreen" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "methamphetamineTestCount" INTEGER;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "biologicalMouldDetected" BOOLEAN DEFAULT false;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "biologicalMouldCategory" TEXT;

-- Timeline Estimation Data
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "phase1StartDate" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "phase1EndDate" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "phase2StartDate" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "phase2EndDate" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "phase3StartDate" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "phase3EndDate" TIMESTAMP(3);

-- Insurer/Client Name (separate from clientName for clarity)
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "insurerName" TEXT;

