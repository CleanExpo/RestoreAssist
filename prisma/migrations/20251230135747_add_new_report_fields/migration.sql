/*
  Warnings:

  - You are about to drop the column `areaName` on the `AffectedArea` table. All the data in the column will be lost.
  - You are about to drop the column `areaOrder` on the `AffectedArea` table. All the data in the column will be lost.
  - The `category` column on the `AffectedArea` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `class` column on the `AffectedArea` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `actionType` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `deviceType` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `userEmail` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `userName` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `certificationType` on the `BuildingCode` table. All the data in the column will be lost.
  - You are about to drop the column `codeName` on the `BuildingCode` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `BuildingCode` table. All the data in the column will be lost.
  - You are about to drop the column `moistureThresholdCarpet` on the `BuildingCode` table. All the data in the column will be lost.
  - You are about to drop the column `moistureThresholdDrywall` on the `BuildingCode` table. All the data in the column will be lost.
  - You are about to drop the column `moistureThresholdWood` on the `BuildingCode` table. All the data in the column will be lost.
  - You are about to drop the column `moldTestingThreshold` on the `BuildingCode` table. All the data in the column will be lost.
  - You are about to drop the column `region` on the `BuildingCode` table. All the data in the column will be lost.
  - You are about to drop the column `requiredDryingTime` on the `BuildingCode` table. All the data in the column will be lost.
  - You are about to drop the column `requiresCertification` on the `BuildingCode` table. All the data in the column will be lost.
  - You are about to drop the column `requiresDehumidification` on the `BuildingCode` table. All the data in the column will be lost.
  - You are about to drop the column `requiresMoldTesting` on the `BuildingCode` table. All the data in the column will be lost.
  - You are about to drop the column `buildingCodeReference` on the `Classification` table. All the data in the column will be lost.
  - You are about to drop the column `categoryReason` on the `Classification` table. All the data in the column will be lost.
  - You are about to drop the column `classReason` on the `Classification` table. All the data in the column will be lost.
  - You are about to drop the column `classificationMethod` on the `Classification` table. All the data in the column will be lost.
  - You are about to drop the column `confidenceScore` on the `Classification` table. All the data in the column will be lost.
  - You are about to drop the column `iicrcStandard` on the `Classification` table. All the data in the column will be lost.
  - You are about to drop the column `itemName` on the `CostDatabase` table. All the data in the column will be lost.
  - You are about to drop the column `rate` on the `CostDatabase` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `CostDatabase` table. All the data in the column will be lost.
  - You are about to drop the column `validFrom` on the `CostDatabase` table. All the data in the column will be lost.
  - You are about to drop the column `validTo` on the `CostDatabase` table. All the data in the column will be lost.
  - You are about to drop the column `contingencyPercent` on the `CostEstimate` table. All the data in the column will be lost.
  - You are about to drop the column `costDatabaseVersion` on the `CostEstimate` table. All the data in the column will be lost.
  - You are about to drop the column `disposalCost` on the `CostEstimate` table. All the data in the column will be lost.
  - You are about to drop the column `equipmentCost` on the `CostEstimate` table. All the data in the column will be lost.
  - You are about to drop the column `estimationMethod` on the `CostEstimate` table. All the data in the column will be lost.
  - You are about to drop the column `gst` on the `CostEstimate` table. All the data in the column will be lost.
  - You are about to drop the column `laborCost` on the `CostEstimate` table. All the data in the column will be lost.
  - You are about to drop the column `materialsCost` on the `CostEstimate` table. All the data in the column will be lost.
  - You are about to drop the column `totalIncGST` on the `CostEstimate` table. All the data in the column will be lost.
  - You are about to drop the column `travelCost` on the `CostEstimate` table. All the data in the column will be lost.
  - You are about to drop the column `indoorConditions` on the `EnvironmentalData` table. All the data in the column will be lost.
  - You are about to drop the column `completedAt` on the `Inspection` table. All the data in the column will be lost.
  - You are about to drop the column `inspectionTime` on the `Inspection` table. All the data in the column will be lost.
  - You are about to drop the column `propertyState` on the `Inspection` table. All the data in the column will be lost.
  - You are about to drop the column `reportFormats` on the `Inspection` table. All the data in the column will be lost.
  - You are about to drop the column `reportGenerated` on the `Inspection` table. All the data in the column will be lost.
  - You are about to drop the column `reportGeneratedAt` on the `Inspection` table. All the data in the column will be lost.
  - You are about to drop the column `displayOrder` on the `InspectionPhoto` table. All the data in the column will be lost.
  - You are about to drop the column `fileName` on the `InspectionPhoto` table. All the data in the column will be lost.
  - You are about to drop the column `photoTimestamp` on the `InspectionPhoto` table. All the data in the column will be lost.
  - You are about to drop the column `photoType` on the `InspectionPhoto` table. All the data in the column will be lost.
  - You are about to drop the column `photoUrl` on the `InspectionPhoto` table. All the data in the column will be lost.
  - You are about to drop the column `moisturePercent` on the `MoistureReading` table. All the data in the column will be lost.
  - You are about to drop the column `readingOrder` on the `MoistureReading` table. All the data in the column will be lost.
  - You are about to drop the column `costRate` on the `ScopeItem` table. All the data in the column will be lost.
  - You are about to drop the column `displayOrder` on the `ScopeItem` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedCost` on the `ScopeItem` table. All the data in the column will be lost.
  - You are about to drop the column `standardReference` on the `ScopeItem` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[reportId]` on the table `Inspection` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `waterSource` on the `AffectedArea` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `action` on the `AuditLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `userId` on table `AuditLog` required. This step will fail if there are existing NULL values in that column.
  - Made the column `codeVersion` on table `BuildingCode` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `standardReference` to the `Classification` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `category` on the `Classification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `class` on the `Classification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `averageRate` to the `CostDatabase` table without a default value. This is not possible if the table is not empty.
  - Added the required column `description` to the `CostDatabase` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `itemType` on the `CostDatabase` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `category` on table `CostDatabase` required. This step will fail if there are existing NULL values in that column.
  - Made the column `minRate` on table `CostDatabase` required. This step will fail if there are existing NULL values in that column.
  - Made the column `maxRate` on table `CostDatabase` required. This step will fail if there are existing NULL values in that column.
  - Made the column `lastUpdated` on table `CostDatabase` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `category` to the `CostEstimate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `description` to the `CostEstimate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantity` to the `CostEstimate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rate` to the `CostEstimate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `total` to the `CostEstimate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unit` to the `CostEstimate` table without a default value. This is not possible if the table is not empty.
  - Made the column `userId` on table `Inspection` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `url` to the `InspectionPhoto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `moistureLevel` to the `MoistureReading` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `depth` on the `MoistureReading` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `itemType` on the `ScopeItem` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "Inspection" DROP CONSTRAINT "Inspection_userId_fkey";

-- DropIndex
DROP INDEX "BuildingCode_isActive_idx";

-- DropIndex
DROP INDEX "CostDatabase_state_idx";

-- DropIndex
DROP INDEX "CostDatabase_validFrom_idx";

-- DropIndex
DROP INDEX "CostEstimate_inspectionId_key";

-- DropIndex
DROP INDEX "InspectionPhoto_photoType_idx";

-- AlterTable
ALTER TABLE "AffectedArea" DROP COLUMN "areaName",
DROP COLUMN "areaOrder",
DROP COLUMN "category",
ADD COLUMN     "category" TEXT,
DROP COLUMN "class",
ADD COLUMN     "class" TEXT,
DROP COLUMN "waterSource",
ADD COLUMN     "waterSource" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "actionType",
DROP COLUMN "description",
DROP COLUMN "deviceType",
DROP COLUMN "userEmail",
DROP COLUMN "userName",
ADD COLUMN     "device" TEXT,
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "entityType" TEXT,
DROP COLUMN "action",
ADD COLUMN     "action" TEXT NOT NULL,
ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "BuildingCode" DROP COLUMN "certificationType",
DROP COLUMN "codeName",
DROP COLUMN "isActive",
DROP COLUMN "moistureThresholdCarpet",
DROP COLUMN "moistureThresholdDrywall",
DROP COLUMN "moistureThresholdWood",
DROP COLUMN "moldTestingThreshold",
DROP COLUMN "region",
DROP COLUMN "requiredDryingTime",
DROP COLUMN "requiresCertification",
DROP COLUMN "requiresDehumidification",
DROP COLUMN "requiresMoldTesting",
ADD COLUMN     "certificationRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dehumidificationRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dryingTimeStandard" TEXT,
ADD COLUMN     "effectiveDate" TIMESTAMP(3),
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "moistureThreshold" DOUBLE PRECISION,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "postcode" TEXT,
ALTER COLUMN "codeVersion" SET NOT NULL,
ALTER COLUMN "requirements" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Classification" DROP COLUMN "buildingCodeReference",
DROP COLUMN "categoryReason",
DROP COLUMN "classReason",
DROP COLUMN "classificationMethod",
DROP COLUMN "confidenceScore",
DROP COLUMN "iicrcStandard",
ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "inputData" TEXT,
ADD COLUMN     "isFinal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "standardReference" TEXT NOT NULL,
DROP COLUMN "category",
ADD COLUMN     "category" TEXT NOT NULL,
DROP COLUMN "class",
ADD COLUMN     "class" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "CostDatabase" DROP COLUMN "itemName",
DROP COLUMN "rate",
DROP COLUMN "state",
DROP COLUMN "validFrom",
DROP COLUMN "validTo",
ADD COLUMN     "averageRate" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "updateFrequency" TEXT,
DROP COLUMN "itemType",
ADD COLUMN     "itemType" TEXT NOT NULL,
ALTER COLUMN "category" SET NOT NULL,
ALTER COLUMN "minRate" SET NOT NULL,
ALTER COLUMN "maxRate" SET NOT NULL,
ALTER COLUMN "lastUpdated" SET NOT NULL,
ALTER COLUMN "lastUpdated" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "CostEstimate" DROP COLUMN "contingencyPercent",
DROP COLUMN "costDatabaseVersion",
DROP COLUMN "disposalCost",
DROP COLUMN "equipmentCost",
DROP COLUMN "estimationMethod",
DROP COLUMN "gst",
DROP COLUMN "laborCost",
DROP COLUMN "materialsCost",
DROP COLUMN "totalIncGST",
DROP COLUMN "travelCost",
ADD COLUMN     "category" TEXT NOT NULL,
ADD COLUMN     "costDatabaseId" TEXT,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "isEstimated" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "quantity" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "rate" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "scopeItemId" TEXT,
ADD COLUMN     "total" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "unit" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "EnvironmentalData" DROP COLUMN "indoorConditions",
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "dewPoint" DROP NOT NULL,
ALTER COLUMN "airCirculation" SET DEFAULT false;

-- AlterTable
ALTER TABLE "Inspection" DROP COLUMN "completedAt",
DROP COLUMN "inspectionTime",
DROP COLUMN "propertyState",
DROP COLUMN "reportFormats",
DROP COLUMN "reportGenerated",
DROP COLUMN "reportGeneratedAt",
ADD COLUMN     "reportId" TEXT,
ALTER COLUMN "inspectionDate" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "technicianName" DROP NOT NULL,
ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "InspectionPhoto" DROP COLUMN "displayOrder",
DROP COLUMN "fileName",
DROP COLUMN "photoTimestamp",
DROP COLUMN "photoType",
DROP COLUMN "photoUrl",
ADD COLUMN     "gpsLatitude" DOUBLE PRECISION,
ADD COLUMN     "gpsLongitude" DOUBLE PRECISION,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "url" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "MoistureReading" DROP COLUMN "moisturePercent",
DROP COLUMN "readingOrder",
ADD COLUMN     "moistureLevel" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "depth",
ADD COLUMN     "depth" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "builderDeveloperAddress" TEXT,
ADD COLUMN     "builderDeveloperCompanyName" TEXT,
ADD COLUMN     "builderDeveloperContact" TEXT,
ADD COLUMN     "builderDeveloperPhone" TEXT,
ADD COLUMN     "buildingChangedSinceLastInspection" TEXT,
ADD COLUMN     "emergencyRepairPerformed" TEXT,
ADD COLUMN     "jobNumber" TEXT,
ADD COLUMN     "lastInspectionDate" TIMESTAMP(3),
ADD COLUMN     "ownerManagementContactName" TEXT,
ADD COLUMN     "ownerManagementEmail" TEXT,
ADD COLUMN     "ownerManagementPhone" TEXT,
ADD COLUMN     "previousLeakage" TEXT,
ADD COLUMN     "propertyId" TEXT,
ADD COLUMN     "reportInstructions" TEXT,
ADD COLUMN     "structureChangesSinceLastInspection" TEXT;

-- AlterTable
ALTER TABLE "ScopeItem" DROP COLUMN "costRate",
DROP COLUMN "displayOrder",
DROP COLUMN "estimatedCost",
DROP COLUMN "standardReference",
ADD COLUMN     "areaId" TEXT,
ADD COLUMN     "autoDetermined" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "specification" TEXT,
DROP COLUMN "itemType",
ADD COLUMN     "itemType" TEXT NOT NULL,
ALTER COLUMN "justification" DROP NOT NULL;

-- DropEnum
DROP TYPE "AuditAction";

-- DropEnum
DROP TYPE "IICRCCategory";

-- DropEnum
DROP TYPE "IICRCClass";

-- DropEnum
DROP TYPE "MoistureDepth";

-- DropEnum
DROP TYPE "PhotoType";

-- DropEnum
DROP TYPE "ScopeItemType";

-- DropEnum
DROP TYPE "WaterSource";

-- CreateIndex
CREATE INDEX "AffectedArea_category_idx" ON "AffectedArea"("category");

-- CreateIndex
CREATE INDEX "AffectedArea_class_idx" ON "AffectedArea"("class");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "BuildingCode_postcode_idx" ON "BuildingCode"("postcode");

-- CreateIndex
CREATE INDEX "Classification_category_idx" ON "Classification"("category");

-- CreateIndex
CREATE INDEX "Classification_class_idx" ON "Classification"("class");

-- CreateIndex
CREATE INDEX "CostDatabase_itemType_idx" ON "CostDatabase"("itemType");

-- CreateIndex
CREATE INDEX "CostDatabase_category_idx" ON "CostDatabase"("category");

-- CreateIndex
CREATE INDEX "CostDatabase_region_idx" ON "CostDatabase"("region");

-- CreateIndex
CREATE INDEX "CostEstimate_inspectionId_idx" ON "CostEstimate"("inspectionId");

-- CreateIndex
CREATE INDEX "CostEstimate_category_idx" ON "CostEstimate"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_reportId_key" ON "Inspection"("reportId");

-- CreateIndex
CREATE INDEX "InspectionPhoto_timestamp_idx" ON "InspectionPhoto"("timestamp");

-- CreateIndex
CREATE INDEX "ScopeItem_itemType_idx" ON "ScopeItem"("itemType");

-- CreateIndex
CREATE INDEX "ScopeItem_autoDetermined_idx" ON "ScopeItem"("autoDetermined");

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
