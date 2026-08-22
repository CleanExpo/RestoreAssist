-- CreateEnum
CREATE TYPE "ClaimAnalysisBatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ClaimAnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "MissingElementCategory" AS ENUM ('IICRC_COMPLIANCE', 'OH_S_POLICY', 'WORKING_AT_HEIGHTS', 'CONFINED_SPACES', 'PPE_REQUIREMENTS', 'BILLING_ITEM', 'DOCUMENTATION', 'SCOPE_OF_WORKS', 'JOB_COSTING', 'ENVIRONMENTAL_CONTROLS', 'WASTE_DISPOSAL', 'QUALITY_CONTROL', 'OTHER');

-- CreateEnum
CREATE TYPE "MissingElementSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "StandardTemplateType" AS ENUM ('INITIAL_INSPECTION_REPORT', 'SCOPE_OF_WORKS', 'JOB_COSTING', 'COMPLIANCE_CHECKLIST', 'BILLING_TEMPLATE');

-- CreateTable
CREATE TABLE "ClaimAnalysisBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "folderName" TEXT,
    "status" "ClaimAnalysisBatchStatus" NOT NULL DEFAULT 'PENDING',
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "processedFiles" INTEGER NOT NULL DEFAULT 0,
    "failedFiles" INTEGER NOT NULL DEFAULT 0,
    "averageCompletenessScore" DOUBLE PRECISION,
    "averageComplianceScore" DOUBLE PRECISION,
    "totalMissingElements" INTEGER NOT NULL DEFAULT 0,
    "estimatedRevenueRecovery" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimAnalysisBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimAnalysis" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "googleDriveFileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "fileUrl" TEXT,
    "claimNumber" TEXT,
    "propertyAddress" TEXT,
    "technicianName" TEXT,
    "inspectionDate" TIMESTAMP(3),
    "reportDate" TIMESTAMP(3),
    "clientName" TEXT,
    "insurerName" TEXT,
    "completenessScore" INTEGER,
    "complianceScore" INTEGER,
    "standardizationScore" INTEGER,
    "documentationScore" INTEGER,
    "billingAccuracyScore" INTEGER,
    "reportStructure" TEXT,
    "reportFlow" TEXT,
    "technicianPattern" TEXT,
    "missingIICRCElements" INTEGER NOT NULL DEFAULT 0,
    "missingOHSElements" INTEGER NOT NULL DEFAULT 0,
    "missingBillingItems" INTEGER NOT NULL DEFAULT 0,
    "missingDocumentation" INTEGER NOT NULL DEFAULT 0,
    "estimatedMissingRevenue" DOUBLE PRECISION,
    "estimatedTimeSavings" DOUBLE PRECISION,
    "fullAnalysisData" TEXT,
    "extractedText" TEXT,
    "status" "ClaimAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissingElement" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "category" "MissingElementCategory" NOT NULL,
    "elementType" TEXT NOT NULL,
    "elementName" TEXT NOT NULL,
    "description" TEXT,
    "severity" "MissingElementSeverity" NOT NULL DEFAULT 'MEDIUM',
    "standardReference" TEXT,
    "requirementText" TEXT,
    "isBillable" BOOLEAN NOT NULL DEFAULT false,
    "estimatedCost" DOUBLE PRECISION,
    "estimatedHours" DOUBLE PRECISION,
    "suggestedLineItem" TEXT,
    "context" TEXT,
    "suggestedValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissingElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandardTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "templateType" "StandardTemplateType" NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "structure" TEXT NOT NULL,
    "checklist" TEXT,
    "lineItems" TEXT,
    "generatedFromBatchId" TEXT,
    "basedOnAnalysisCount" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "StandardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClaimAnalysisBatch_userId_idx" ON "ClaimAnalysisBatch"("userId");

-- CreateIndex
CREATE INDEX "ClaimAnalysisBatch_status_idx" ON "ClaimAnalysisBatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimAnalysis_googleDriveFileId_key" ON "ClaimAnalysis"("googleDriveFileId");

-- CreateIndex
CREATE INDEX "ClaimAnalysis_batchId_idx" ON "ClaimAnalysis"("batchId");

-- CreateIndex
CREATE INDEX "ClaimAnalysis_technicianName_idx" ON "ClaimAnalysis"("technicianName");

-- CreateIndex
CREATE INDEX "ClaimAnalysis_status_idx" ON "ClaimAnalysis"("status");

-- CreateIndex
CREATE INDEX "ClaimAnalysis_completenessScore_idx" ON "ClaimAnalysis"("completenessScore");

-- CreateIndex
CREATE INDEX "MissingElement_analysisId_idx" ON "MissingElement"("analysisId");

-- CreateIndex
CREATE INDEX "MissingElement_category_idx" ON "MissingElement"("category");

-- CreateIndex
CREATE INDEX "MissingElement_severity_idx" ON "MissingElement"("severity");

-- CreateIndex
CREATE INDEX "MissingElement_isBillable_idx" ON "MissingElement"("isBillable");

-- CreateIndex
CREATE INDEX "StandardTemplate_templateType_idx" ON "StandardTemplate"("templateType");

-- CreateIndex
CREATE INDEX "StandardTemplate_isActive_idx" ON "StandardTemplate"("isActive");

-- CreateIndex
CREATE INDEX "StandardTemplate_isDefault_idx" ON "StandardTemplate"("isDefault");

-- AddForeignKey
ALTER TABLE "ClaimAnalysisBatch" ADD CONSTRAINT "ClaimAnalysisBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimAnalysis" ADD CONSTRAINT "ClaimAnalysis_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ClaimAnalysisBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissingElement" ADD CONSTRAINT "MissingElement_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ClaimAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandardTemplate" ADD CONSTRAINT "StandardTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
