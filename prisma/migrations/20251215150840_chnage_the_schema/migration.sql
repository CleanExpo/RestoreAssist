/*
  Warnings:

  - You are about to drop the column `biologicalMouldVisibleGrowth` on the `Report` table. All the data in the column will be lost.
  - Made the column `biologicalMouldDetected` on table `Report` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
-- First, add biologicalMouldDetected if it doesn't exist (migrate data from biologicalMouldVisibleGrowth)
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "biologicalMouldDetected" BOOLEAN DEFAULT false;

-- Migrate data from old column to new column if old column exists
UPDATE "Report" 
SET "biologicalMouldDetected" = COALESCE("biologicalMouldVisibleGrowth", false)
WHERE "biologicalMouldVisibleGrowth" IS NOT NULL;

-- Now drop the old column if it exists
ALTER TABLE "Report" DROP COLUMN IF EXISTS "biologicalMouldVisibleGrowth";

-- Change methamphetamineScreen to TEXT type
ALTER TABLE "Report" ALTER COLUMN "methamphetamineScreen" SET DATA TYPE TEXT USING "methamphetamineScreen"::TEXT;

-- Set biologicalMouldDetected to NOT NULL (with default for safety)
ALTER TABLE "Report" ALTER COLUMN "biologicalMouldDetected" SET DEFAULT false;
ALTER TABLE "Report" ALTER COLUMN "biologicalMouldDetected" SET NOT NULL;
