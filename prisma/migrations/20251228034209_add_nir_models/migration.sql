-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PROCESSING', 'CLASSIFIED', 'SCOPED', 'ESTIMATED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MoistureDepth" AS ENUM ('SURFACE', 'SUBSURFACE');

-- CreateEnum
CREATE TYPE "IICRCCategory" AS ENUM ('CATEGORY_1', 'CATEGORY_2', 'CATEGORY_3', 'CATEGORY_4');

-- CreateEnum
CREATE TYPE "IICRCClass" AS ENUM ('CLASS_1', 'CLASS_2', 'CLASS_3', 'CLASS_4');

-- CreateEnum
CREATE TYPE "WaterSource" AS ENUM ('CLEAN_WATER', 'GREY_WATER', 'BLACK_WATER', 'BRACKISH_WATER');

-- CreateEnum
CREATE TYPE "ScopeItemType" AS ENUM ('CARPET_REMOVAL', 'DRYWALL_REMOVAL', 'SANITIZATION', 'DEHUMIDIFICATION', 'AIR_MOVERS', 'WATER_EXTRACTION', 'ANTIMICROBIAL_TREATMENT', 'DRYING_OUT', 'CONTAINMENT', 'PPE_SETUP', 'MOLD_REMEDIATION', 'STRUCTURAL_REPAIR', 'ELECTRICAL_SAFETY', 'WASTE_DISPOSAL', 'MONITORING', 'VERIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'SUBMITTED', 'PROCESSED', 'CLASSIFIED', 'SCOPED', 'ESTIMATED', 'REPORT_GENERATED', 'REJECTED', 'APPROVED', 'PHOTO_UPLOADED', 'DATA_VALIDATED', 'DATA_REJECTED');

-- CreateEnum
CREATE TYPE "PhotoType" AS ENUM ('DAMAGE', 'EQUIPMENT_SETUP', 'BEFORE_CONDITION', 'AFTER_CONDITION', 'MOISTURE_READING', 'ENVIRONMENTAL', 'SAFETY_HAZARD', 'OTHER');

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "inspectionNumber" TEXT NOT NULL,
    "propertyAddress" TEXT NOT NULL,
    "propertyPostcode" TEXT NOT NULL,
    "propertyState" TEXT,
    "inspectionDate" TIMESTAMP(3) NOT NULL,
    "inspectionTime" TIMESTAMP(3),
    "technicianName" TEXT NOT NULL,
    "technicianId" TEXT,
    "userId" TEXT,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reportGenerated" BOOLEAN NOT NULL DEFAULT false,
    "reportGeneratedAt" TIMESTAMP(3),
    "reportFormats" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvironmentalData" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "ambientTemperature" DOUBLE PRECISION NOT NULL,
    "humidityLevel" DOUBLE PRECISION NOT NULL,
    "dewPoint" DOUBLE PRECISION NOT NULL,
    "airCirculation" BOOLEAN NOT NULL,
    "weatherConditions" TEXT,
    "indoorConditions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvironmentalData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoistureReading" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "surfaceType" TEXT NOT NULL,
    "moisturePercent" DOUBLE PRECISION NOT NULL,
    "depth" "MoistureDepth" NOT NULL,
    "notes" TEXT,
    "photoUrl" TEXT,
    "readingOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoistureReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffectedArea" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "roomZoneId" TEXT NOT NULL,
    "areaName" TEXT,
    "category" "IICRCCategory",
    "class" "IICRCClass",
    "affectedSquareFootage" DOUBLE PRECISION NOT NULL,
    "waterSource" "WaterSource" NOT NULL,
    "timeSinceLoss" DOUBLE PRECISION,
    "description" TEXT,
    "photos" TEXT,
    "areaOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffectedArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Classification" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "category" "IICRCCategory" NOT NULL,
    "class" "IICRCClass" NOT NULL,
    "justification" TEXT NOT NULL,
    "categoryReason" TEXT NOT NULL,
    "classReason" TEXT NOT NULL,
    "iicrcStandard" TEXT,
    "buildingCodeReference" TEXT,
    "confidenceScore" INTEGER DEFAULT 100,
    "classificationMethod" TEXT NOT NULL DEFAULT 'AUTOMATIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Classification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeItem" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "itemType" "ScopeItemType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "justification" TEXT NOT NULL,
    "standardReference" TEXT,
    "estimatedCost" DOUBLE PRECISION,
    "costRate" DOUBLE PRECISION,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScopeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEstimate" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "laborCost" DOUBLE PRECISION,
    "equipmentCost" DOUBLE PRECISION,
    "materialsCost" DOUBLE PRECISION,
    "disposalCost" DOUBLE PRECISION,
    "travelCost" DOUBLE PRECISION,
    "contingency" DOUBLE PRECISION,
    "contingencyPercent" DOUBLE PRECISION DEFAULT 12.5,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "gst" DOUBLE PRECISION,
    "totalIncGST" DOUBLE PRECISION NOT NULL,
    "costDatabaseVersion" TEXT,
    "estimationMethod" TEXT NOT NULL DEFAULT 'AUTOMATIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actionType" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "userEmail" TEXT,
    "deviceType" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "gpsLocation" TEXT,
    "changes" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildingCode" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "region" TEXT,
    "codeName" TEXT NOT NULL,
    "codeVersion" TEXT,
    "requirements" TEXT NOT NULL,
    "moistureThresholdDrywall" DOUBLE PRECISION,
    "moistureThresholdWood" DOUBLE PRECISION,
    "moistureThresholdCarpet" DOUBLE PRECISION,
    "requiredDryingTime" INTEGER,
    "requiresDehumidification" BOOLEAN NOT NULL DEFAULT false,
    "requiresMoldTesting" BOOLEAN NOT NULL DEFAULT false,
    "moldTestingThreshold" INTEGER,
    "requiresCertification" BOOLEAN NOT NULL DEFAULT false,
    "certificationType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildingCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostDatabase" (
    "id" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemType" "ScopeItemType" NOT NULL,
    "category" TEXT,
    "rate" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "minRate" DOUBLE PRECISION,
    "maxRate" DOUBLE PRECISION,
    "state" TEXT,
    "region" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "lastUpdated" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostDatabase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionPhoto" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "location" TEXT,
    "description" TEXT,
    "photoType" "PhotoType" NOT NULL,
    "photoTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_inspectionNumber_key" ON "Inspection"("inspectionNumber");

-- CreateIndex
CREATE INDEX "Inspection_userId_idx" ON "Inspection"("userId");

-- CreateIndex
CREATE INDEX "Inspection_status_idx" ON "Inspection"("status");

-- CreateIndex
CREATE INDEX "Inspection_inspectionDate_idx" ON "Inspection"("inspectionDate");

-- CreateIndex
CREATE INDEX "Inspection_propertyPostcode_idx" ON "Inspection"("propertyPostcode");

-- CreateIndex
CREATE UNIQUE INDEX "EnvironmentalData_inspectionId_key" ON "EnvironmentalData"("inspectionId");

-- CreateIndex
CREATE INDEX "MoistureReading_inspectionId_idx" ON "MoistureReading"("inspectionId");

-- CreateIndex
CREATE INDEX "MoistureReading_surfaceType_idx" ON "MoistureReading"("surfaceType");

-- CreateIndex
CREATE INDEX "AffectedArea_inspectionId_idx" ON "AffectedArea"("inspectionId");

-- CreateIndex
CREATE INDEX "AffectedArea_category_idx" ON "AffectedArea"("category");

-- CreateIndex
CREATE INDEX "AffectedArea_class_idx" ON "AffectedArea"("class");

-- CreateIndex
CREATE INDEX "Classification_inspectionId_idx" ON "Classification"("inspectionId");

-- CreateIndex
CREATE INDEX "Classification_category_idx" ON "Classification"("category");

-- CreateIndex
CREATE INDEX "Classification_class_idx" ON "Classification"("class");

-- CreateIndex
CREATE INDEX "ScopeItem_inspectionId_idx" ON "ScopeItem"("inspectionId");

-- CreateIndex
CREATE INDEX "ScopeItem_itemType_idx" ON "ScopeItem"("itemType");

-- CreateIndex
CREATE UNIQUE INDEX "CostEstimate_inspectionId_key" ON "CostEstimate"("inspectionId");

-- CreateIndex
CREATE INDEX "AuditLog_inspectionId_idx" ON "AuditLog"("inspectionId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "BuildingCode_state_idx" ON "BuildingCode"("state");

-- CreateIndex
CREATE INDEX "BuildingCode_isActive_idx" ON "BuildingCode"("isActive");

-- CreateIndex
CREATE INDEX "CostDatabase_itemType_idx" ON "CostDatabase"("itemType");

-- CreateIndex
CREATE INDEX "CostDatabase_state_idx" ON "CostDatabase"("state");

-- CreateIndex
CREATE INDEX "CostDatabase_isActive_idx" ON "CostDatabase"("isActive");

-- CreateIndex
CREATE INDEX "CostDatabase_validFrom_idx" ON "CostDatabase"("validFrom");

-- CreateIndex
CREATE INDEX "InspectionPhoto_inspectionId_idx" ON "InspectionPhoto"("inspectionId");

-- CreateIndex
CREATE INDEX "InspectionPhoto_photoType_idx" ON "InspectionPhoto"("photoType");

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentalData" ADD CONSTRAINT "EnvironmentalData_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoistureReading" ADD CONSTRAINT "MoistureReading_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectedArea" ADD CONSTRAINT "AffectedArea_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classification" ADD CONSTRAINT "Classification_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeItem" ADD CONSTRAINT "ScopeItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEstimate" ADD CONSTRAINT "CostEstimate_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionPhoto" ADD CONSTRAINT "InspectionPhoto_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
