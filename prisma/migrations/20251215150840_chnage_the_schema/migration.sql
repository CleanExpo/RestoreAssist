/*
  Warnings:

  - You are about to drop the column `biologicalMouldVisibleGrowth` on the `Report` table. All the data in the column will be lost.
  - Made the column `biologicalMouldDetected` on table `Report` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Report" DROP COLUMN "biologicalMouldVisibleGrowth",
ALTER COLUMN "methamphetamineScreen" SET DATA TYPE TEXT,
ALTER COLUMN "biologicalMouldDetected" SET NOT NULL;
