-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'APPROVED', 'LOCKED');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "claimReferenceNumber" TEXT,
ADD COLUMN     "clientContactDetails" TEXT,
ADD COLUMN     "completenessScore" INTEGER,
ADD COLUMN     "costEstimationData" TEXT,
ADD COLUMN     "costEstimationDocument" TEXT,
ADD COLUMN     "geographicIntelligence" TEXT,
ADD COLUMN     "incidentDate" TIMESTAMP(3),
ADD COLUMN     "lastEditedAt" TIMESTAMP(3),
ADD COLUMN     "lastEditedBy" TEXT,
ADD COLUMN     "propertyPostcode" TEXT,
ADD COLUMN     "reportDepthLevel" TEXT,
ADD COLUMN     "reportVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "scopeOfWorksData" TEXT,
ADD COLUMN     "scopeOfWorksDocument" TEXT,
ADD COLUMN     "technicianAttendanceDate" TIMESTAMP(3),
ADD COLUMN     "technicianFieldReport" TEXT,
ADD COLUMN     "technicianName" TEXT,
ADD COLUMN     "technicianReportAnalysis" TEXT,
ADD COLUMN     "tier1Responses" TEXT,
ADD COLUMN     "tier2Responses" TEXT,
ADD COLUMN     "tier3Responses" TEXT,
ADD COLUMN     "validationErrors" TEXT,
ADD COLUMN     "validationWarnings" TEXT,
ADD COLUMN     "versionHistory" TEXT;

-- CreateTable
CREATE TABLE "Scope" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "siteVariables" TEXT,
    "labourParameters" TEXT,
    "equipmentParameters" TEXT,
    "chemicalApplication" TEXT,
    "timeCalculations" TEXT,
    "labourCostTotal" DOUBLE PRECISION,
    "equipmentCostTotal" DOUBLE PRECISION,
    "chemicalCostTotal" DOUBLE PRECISION,
    "totalDuration" DOUBLE PRECISION,
    "complianceNotes" TEXT,
    "assumptions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Scope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "scopeId" TEXT,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "rateTables" TEXT,
    "commercialParams" TEXT,
    "labourSubtotal" DOUBLE PRECISION,
    "equipmentSubtotal" DOUBLE PRECISION,
    "chemicalsSubtotal" DOUBLE PRECISION,
    "subcontractorSubtotal" DOUBLE PRECISION,
    "travelSubtotal" DOUBLE PRECISION,
    "wasteSubtotal" DOUBLE PRECISION,
    "overheads" DOUBLE PRECISION,
    "profit" DOUBLE PRECISION,
    "contingency" DOUBLE PRECISION,
    "escalation" DOUBLE PRECISION,
    "subtotalExGST" DOUBLE PRECISION,
    "gst" DOUBLE PRECISION,
    "totalIncGST" DOUBLE PRECISION,
    "assumptions" TEXT,
    "inclusions" TEXT,
    "exclusions" TEXT,
    "allowances" TEXT,
    "complianceStatement" TEXT,
    "disclaimer" TEXT,
    "approverName" TEXT,
    "approverRole" TEXT,
    "approverSignature" TEXT,
    "approvedAt" TIMESTAMP(3),
    "estimatedDuration" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateLineItem" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "code" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "formula" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "isScopeLinked" BOOLEAN NOT NULL DEFAULT false,
    "isEstimatorAdded" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "modifiedBy" TEXT,
    "modifiedAt" TIMESTAMP(3),
    "changeReason" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateVersion" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changes" TEXT,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" TEXT,

    CONSTRAINT "EstimateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateVariation" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "variationNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT,
    "addedItems" TEXT,
    "removedItems" TEXT,
    "changedItems" TEXT,
    "previousTotal" DOUBLE PRECISION NOT NULL,
    "variationAmount" DOUBLE PRECISION NOT NULL,
    "newTotal" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "EstimateVariation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyPricingConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "masterQualifiedNormalHours" DOUBLE PRECISION NOT NULL,
    "masterQualifiedSaturday" DOUBLE PRECISION NOT NULL,
    "masterQualifiedSunday" DOUBLE PRECISION NOT NULL,
    "qualifiedTechnicianNormalHours" DOUBLE PRECISION NOT NULL,
    "qualifiedTechnicianSaturday" DOUBLE PRECISION NOT NULL,
    "qualifiedTechnicianSunday" DOUBLE PRECISION NOT NULL,
    "labourerNormalHours" DOUBLE PRECISION NOT NULL,
    "labourerSaturday" DOUBLE PRECISION NOT NULL,
    "labourerSunday" DOUBLE PRECISION NOT NULL,
    "airMoverAxialDailyRate" DOUBLE PRECISION NOT NULL,
    "airMoverCentrifugalDailyRate" DOUBLE PRECISION NOT NULL,
    "dehumidifierLGRDailyRate" DOUBLE PRECISION NOT NULL,
    "dehumidifierDesiccantDailyRate" DOUBLE PRECISION NOT NULL,
    "afdUnitLargeDailyRate" DOUBLE PRECISION NOT NULL,
    "extractionTruckMountedHourlyRate" DOUBLE PRECISION NOT NULL,
    "extractionElectricHourlyRate" DOUBLE PRECISION NOT NULL,
    "injectionDryingSystemDailyRate" DOUBLE PRECISION NOT NULL,
    "antimicrobialTreatmentRate" DOUBLE PRECISION NOT NULL,
    "mouldRemediationTreatmentRate" DOUBLE PRECISION NOT NULL,
    "biohazardTreatmentRate" DOUBLE PRECISION NOT NULL,
    "administrationFee" DOUBLE PRECISION NOT NULL,
    "callOutFee" DOUBLE PRECISION NOT NULL,
    "thermalCameraUseCostPerAssessment" DOUBLE PRECISION NOT NULL,
    "customFields" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Scope_reportId_key" ON "Scope"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_scopeId_key" ON "Estimate"("scopeId");

-- CreateIndex
CREATE INDEX "EstimateLineItem_estimateId_idx" ON "EstimateLineItem"("estimateId");

-- CreateIndex
CREATE INDEX "EstimateLineItem_category_idx" ON "EstimateLineItem"("category");

-- CreateIndex
CREATE INDEX "EstimateVersion_estimateId_idx" ON "EstimateVersion"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateVersion_estimateId_version_key" ON "EstimateVersion"("estimateId", "version");

-- CreateIndex
CREATE INDEX "EstimateVariation_estimateId_idx" ON "EstimateVariation"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateVariation_estimateId_variationNumber_key" ON "EstimateVariation"("estimateId", "variationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyPricingConfig_userId_key" ON "CompanyPricingConfig"("userId");

-- AddForeignKey
ALTER TABLE "Scope" ADD CONSTRAINT "Scope_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scope" ADD CONSTRAINT "Scope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateVersion" ADD CONSTRAINT "EstimateVersion_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateVariation" ADD CONSTRAINT "EstimateVariation_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPricingConfig" ADD CONSTRAINT "CompanyPricingConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
