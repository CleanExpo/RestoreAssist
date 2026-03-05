/*
  Warnings:

  - A unique constraint covering the columns `[userId,provider]` on the table `Integration` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `provider` to the `Integration` table without a default value. This is not possible if the table is not empty.
  - Made the column `interviewTier` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('XERO', 'QUICKBOOKS', 'MYOB', 'SERVICEM8', 'ASCORA');

-- CreateEnum
CREATE TYPE "RegulatoryDocumentType" AS ENUM ('INSURANCE_POLICY', 'INSURANCE_REGULATION', 'BUILDING_CODE_NATIONAL', 'BUILDING_CODE_STATE', 'ELECTRICAL_STANDARD', 'PLUMBING_STANDARD', 'CONSUMER_LAW', 'INDUSTRY_BEST_PRACTICE', 'SAFETY_REGULATION');

-- CreateEnum
CREATE TYPE "UsageEventType" AS ENUM ('PROPERTY_LOOKUP', 'VOICE_TRANSCRIPTION', 'VOICE_AI_INTERACTION', 'LIDAR_SCAN', 'FLOOR_PLAN_GENERATION', 'AI_ASSISTANT_QUERY');

-- CreateEnum
CREATE TYPE "FormType" AS ENUM ('WORK_ORDER', 'AUTHORITY_TO_COMMENCE', 'JSA', 'SDS', 'SWIMS', 'SITE_INDUCTION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FormCategory" AS ENUM ('SAFETY', 'COMPLIANCE', 'CLIENT_INTAKE', 'JOB_DOCUMENTATION', 'INSURANCE', 'QUALITY_CONTROL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FormTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "FormSubmissionStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'AWAITING_SIGNATURE', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SignatureType" AS ENUM ('DIGITAL_CANVAS', 'ELECTRONIC_TYPED', 'ESIGNATURE_WORKFLOW', 'BIOMETRIC');

-- CreateEnum
CREATE TYPE "SignatoryRole" AS ENUM ('TECHNICIAN', 'SUPERVISOR', 'CLIENT', 'PROPERTY_OWNER', 'WITNESS', 'CONTRACTOR', 'OTHER');

-- CreateEnum
CREATE TYPE "FormAuditAction" AS ENUM ('CREATED', 'FIELD_UPDATED', 'SAVED', 'SUBMITTED', 'SIGNATURE_ADDED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED', 'STATUS_CHANGED', 'CANCELLED', 'REOPENED');

-- AlterEnum
ALTER TYPE "IntegrationStatus" ADD VALUE 'SYNCING';

-- AlterTable
ALTER TABLE "BuildingCode" ADD COLUMN     "regulatoryDocumentId" TEXT;

-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN     "propertyBathrooms" INTEGER,
ADD COLUMN     "propertyBedrooms" INTEGER,
ADD COLUMN     "propertyDataFetchedAt" TIMESTAMP(3),
ADD COLUMN     "propertyDataSource" TEXT,
ADD COLUMN     "propertyFloorArea" DOUBLE PRECISION,
ADD COLUMN     "propertyFloorType" TEXT,
ADD COLUMN     "propertyLandArea" DOUBLE PRECISION,
ADD COLUMN     "propertyRoofMaterial" TEXT,
ADD COLUMN     "propertyStories" INTEGER,
ADD COLUMN     "propertyWallConstruction" TEXT,
ADD COLUMN     "propertyWallMaterial" TEXT,
ADD COLUMN     "propertyYearBuilt" INTEGER,
ADD COLUMN     "totalUsageCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
-- First add provider as nullable
ALTER TABLE "Integration" ADD COLUMN     "accessToken" TEXT,
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "provider" "IntegrationProvider",
ADD COLUMN     "realmId" TEXT,
ADD COLUMN     "refreshToken" TEXT,
ADD COLUMN     "syncError" TEXT,
ADD COLUMN     "tenantId" TEXT,
ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3);

-- Update existing rows with a default provider based on name field
-- Try to infer from name, otherwise default to XERO
UPDATE "Integration" 
SET "provider" = CASE 
  WHEN LOWER("name") LIKE '%xero%' THEN 'XERO'::"IntegrationProvider"
  WHEN LOWER("name") LIKE '%quickbook%' OR LOWER("name") LIKE '%quick book%' THEN 'QUICKBOOKS'::"IntegrationProvider"
  WHEN LOWER("name") LIKE '%myob%' THEN 'MYOB'::"IntegrationProvider"
  WHEN LOWER("name") LIKE '%servicem8%' OR LOWER("name") LIKE '%service m8%' THEN 'SERVICEM8'::"IntegrationProvider"
  WHEN LOWER("name") LIKE '%ascora%' THEN 'ASCORA'::"IntegrationProvider"
  ELSE 'XERO'::"IntegrationProvider"
END
WHERE "provider" IS NULL;

-- Now make provider NOT NULL
ALTER TABLE "Integration" ALTER COLUMN "provider" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "autoAcceptSuggestionsAboveConfidence" DOUBLE PRECISION,
ADD COLUMN     "hasPremiumInspectionReports" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "monthlyUsageCap" DOUBLE PRECISION,
ADD COLUMN     "preferredQuestionStyle" TEXT;

-- Update existing NULL interviewTier values to a default value before making it NOT NULL
UPDATE "User" SET "interviewTier" = 'STANDARD'::"SubscriptionTierLevel" WHERE "interviewTier" IS NULL;

-- Now make interviewTier NOT NULL
ALTER TABLE "User" ALTER COLUMN "interviewTier" SET NOT NULL;

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalClient" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "rawData" JSONB NOT NULL,
    "contactId" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalJob" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT,
    "clientExternalId" TEXT,
    "address" TEXT,
    "description" TEXT,
    "rawData" JSONB NOT NULL,
    "claimId" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationSyncLog" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "recordsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryDocument" (
    "id" TEXT NOT NULL,
    "documentType" "RegulatoryDocumentType" NOT NULL,
    "category" TEXT NOT NULL,
    "jurisdiction" TEXT,
    "title" TEXT NOT NULL,
    "documentCode" TEXT,
    "version" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "googleDriveFileId" TEXT,
    "extractedText" TEXT,
    "publisher" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatorySection" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sectionNumber" TEXT NOT NULL,
    "sectionTitle" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "topics" TEXT[],
    "keywords" TEXT[],
    "applicableToWaterCategory" TEXT[],
    "applicableToWaterClass" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatorySection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fullReference" TEXT NOT NULL,
    "shortReference" TEXT NOT NULL,
    "citationText" TEXT NOT NULL,
    "contextKeywords" TEXT[],
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePolicyRequirement" (
    "id" TEXT NOT NULL,
    "insurerName" TEXT,
    "requirementType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "applicableStates" TEXT[],
    "standardReference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurancePolicyRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "scanId" TEXT,
    "voiceNoteId" TEXT,
    "eventType" "UsageEventType" NOT NULL,
    "eventData" TEXT NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "units" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "stripeMeterEventId" TEXT,
    "billingStatus" TEXT NOT NULL DEFAULT 'pending',
    "billedAt" TIMESTAMP(3),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledEmail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttempt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "deliveryType" TEXT NOT NULL,

    CONSTRAINT "EmailAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "formType" "FormType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "FormCategory" NOT NULL,
    "status" "FormTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isSystemTemplate" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "formSchema" TEXT NOT NULL,
    "requiresSignatures" BOOLEAN NOT NULL DEFAULT false,
    "signatureConfig" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT,
    "submissionNumber" TEXT NOT NULL,
    "status" "FormSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "formData" TEXT NOT NULL,
    "completenessScore" INTEGER DEFAULT 0,
    "validationErrors" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSignature" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "signatureFieldId" TEXT NOT NULL,
    "signatureType" "SignatureType" NOT NULL,
    "signatureData" TEXT,
    "signatureUrl" TEXT,
    "signatoryName" TEXT NOT NULL,
    "signatoryRole" "SignatoryRole" NOT NULL,
    "signatoryEmail" TEXT,
    "signatureRequestSent" BOOLEAN NOT NULL DEFAULT false,
    "signatureRequestSentAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "gpsLocation" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormAttachment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "publicId" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fieldId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormAuditLog" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "action" "FormAuditAction" NOT NULL,
    "fieldId" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changeNotes" TEXT,
    "changedBy" TEXT NOT NULL,
    "schemaSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LidarScan" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "rawDataUrl" TEXT NOT NULL,
    "fileFormat" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "pointCount" INTEGER,
    "roomName" TEXT,
    "scanDuration" INTEGER,
    "dimensions" TEXT,
    "processingStatus" TEXT NOT NULL DEFAULT 'pending',
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LidarScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorPlan" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "svgUrl" TEXT,
    "thumbnailUrl" TEXT,
    "svgData" TEXT,
    "canvasJSON" TEXT,
    "scale" DOUBLE PRECISION,
    "dimensions" TEXT,
    "annotations" TEXT,
    "generatedBy" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceNote" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "audioFormat" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "roomName" TEXT,
    "description" TEXT,
    "transcriptionStatus" TEXT NOT NULL DEFAULT 'pending',
    "transcribedAt" TIMESTAMP(3),
    "transcriptionError" TEXT,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceTranscript" (
    "id" TEXT NOT NULL,
    "voiceNoteId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "confidence" DOUBLE PRECISION,
    "words" JSONB,
    "speakers" JSONB,
    "extractedData" JSONB,
    "aiProcessed" BOOLEAN NOT NULL DEFAULT false,
    "aiProcessedAt" TIMESTAMP(3),
    "transcriptionService" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyLookup" (
    "id" TEXT NOT NULL,
    "propertyAddress" TEXT NOT NULL,
    "propertyPostcode" TEXT NOT NULL,
    "lookupDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "apiResponseStatus" INTEGER NOT NULL,
    "dataSource" TEXT NOT NULL DEFAULT 'corelogic',
    "lookupCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "propertyData" JSONB,
    "inspectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyLookup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");

-- CreateIndex
CREATE INDEX "ExternalClient_integrationId_idx" ON "ExternalClient"("integrationId");

-- CreateIndex
CREATE INDEX "ExternalClient_contactId_idx" ON "ExternalClient"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalClient_integrationId_externalId_key" ON "ExternalClient"("integrationId", "externalId");

-- CreateIndex
CREATE INDEX "ExternalJob_integrationId_idx" ON "ExternalJob"("integrationId");

-- CreateIndex
CREATE INDEX "ExternalJob_claimId_idx" ON "ExternalJob"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalJob_integrationId_externalId_key" ON "ExternalJob"("integrationId", "externalId");

-- CreateIndex
CREATE INDEX "IntegrationSyncLog_integrationId_idx" ON "IntegrationSyncLog"("integrationId");

-- CreateIndex
CREATE INDEX "IntegrationSyncLog_startedAt_idx" ON "IntegrationSyncLog"("startedAt");

-- CreateIndex
CREATE INDEX "RegulatoryDocument_documentType_jurisdiction_idx" ON "RegulatoryDocument"("documentType", "jurisdiction");

-- CreateIndex
CREATE INDEX "RegulatoryDocument_documentCode_idx" ON "RegulatoryDocument"("documentCode");

-- CreateIndex
CREATE INDEX "RegulatorySection_documentId_sectionNumber_idx" ON "RegulatorySection"("documentId", "sectionNumber");

-- CreateIndex
CREATE INDEX "RegulatorySection_topics_idx" ON "RegulatorySection"("topics");

-- CreateIndex
CREATE INDEX "Citation_shortReference_idx" ON "Citation"("shortReference");

-- CreateIndex
CREATE INDEX "InsurancePolicyRequirement_insurerName_idx" ON "InsurancePolicyRequirement"("insurerName");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_timestamp_idx" ON "UsageEvent"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "UsageEvent_inspectionId_idx" ON "UsageEvent"("inspectionId");

-- CreateIndex
CREATE INDEX "UsageEvent_scanId_idx" ON "UsageEvent"("scanId");

-- CreateIndex
CREATE INDEX "UsageEvent_voiceNoteId_idx" ON "UsageEvent"("voiceNoteId");

-- CreateIndex
CREATE INDEX "UsageEvent_billingStatus_idx" ON "UsageEvent"("billingStatus");

-- CreateIndex
CREATE INDEX "UsageEvent_eventType_idx" ON "UsageEvent"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "EmailConnection_userId_key" ON "EmailConnection"("userId");

-- CreateIndex
CREATE INDEX "EmailConnection_userId_idx" ON "EmailConnection"("userId");

-- CreateIndex
CREATE INDEX "EmailConnection_provider_idx" ON "EmailConnection"("provider");

-- CreateIndex
CREATE INDEX "ScheduledEmail_userId_idx" ON "ScheduledEmail"("userId");

-- CreateIndex
CREATE INDEX "ScheduledEmail_reportId_idx" ON "ScheduledEmail"("reportId");

-- CreateIndex
CREATE INDEX "ScheduledEmail_status_scheduledAt_idx" ON "ScheduledEmail"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledEmail_scheduledAt_idx" ON "ScheduledEmail"("scheduledAt");

-- CreateIndex
CREATE INDEX "EmailAudit_userId_idx" ON "EmailAudit"("userId");

-- CreateIndex
CREATE INDEX "EmailAudit_reportId_idx" ON "EmailAudit"("reportId");

-- CreateIndex
CREATE INDEX "EmailAudit_sentAt_idx" ON "EmailAudit"("sentAt");

-- CreateIndex
CREATE INDEX "FormTemplate_userId_idx" ON "FormTemplate"("userId");

-- CreateIndex
CREATE INDEX "FormTemplate_formType_idx" ON "FormTemplate"("formType");

-- CreateIndex
CREATE INDEX "FormTemplate_category_idx" ON "FormTemplate"("category");

-- CreateIndex
CREATE INDEX "FormTemplate_status_idx" ON "FormTemplate"("status");

-- CreateIndex
CREATE INDEX "FormTemplate_isSystemTemplate_idx" ON "FormTemplate"("isSystemTemplate");

-- CreateIndex
CREATE UNIQUE INDEX "FormSubmission_submissionNumber_key" ON "FormSubmission"("submissionNumber");

-- CreateIndex
CREATE INDEX "FormSubmission_templateId_idx" ON "FormSubmission"("templateId");

-- CreateIndex
CREATE INDEX "FormSubmission_userId_idx" ON "FormSubmission"("userId");

-- CreateIndex
CREATE INDEX "FormSubmission_reportId_idx" ON "FormSubmission"("reportId");

-- CreateIndex
CREATE INDEX "FormSubmission_status_idx" ON "FormSubmission"("status");

-- CreateIndex
CREATE INDEX "FormSubmission_submittedAt_idx" ON "FormSubmission"("submittedAt");

-- CreateIndex
CREATE INDEX "FormSignature_submissionId_idx" ON "FormSignature"("submissionId");

-- CreateIndex
CREATE INDEX "FormSignature_signatoryRole_idx" ON "FormSignature"("signatoryRole");

-- CreateIndex
CREATE INDEX "FormAttachment_submissionId_idx" ON "FormAttachment"("submissionId");

-- CreateIndex
CREATE INDEX "FormAuditLog_submissionId_idx" ON "FormAuditLog"("submissionId");

-- CreateIndex
CREATE INDEX "FormAuditLog_userId_idx" ON "FormAuditLog"("userId");

-- CreateIndex
CREATE INDEX "FormAuditLog_timestamp_idx" ON "FormAuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "FormTemplateVersion_templateId_idx" ON "FormTemplateVersion"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "FormTemplateVersion_templateId_version_key" ON "FormTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "LidarScan_inspectionId_idx" ON "LidarScan"("inspectionId");

-- CreateIndex
CREATE INDEX "LidarScan_processingStatus_idx" ON "LidarScan"("processingStatus");

-- CreateIndex
CREATE INDEX "LidarScan_uploadedBy_idx" ON "LidarScan"("uploadedBy");

-- CreateIndex
CREATE UNIQUE INDEX "FloorPlan_scanId_key" ON "FloorPlan"("scanId");

-- CreateIndex
CREATE INDEX "FloorPlan_scanId_idx" ON "FloorPlan"("scanId");

-- CreateIndex
CREATE INDEX "VoiceNote_inspectionId_idx" ON "VoiceNote"("inspectionId");

-- CreateIndex
CREATE INDEX "VoiceNote_transcriptionStatus_idx" ON "VoiceNote"("transcriptionStatus");

-- CreateIndex
CREATE INDEX "VoiceNote_recordedBy_idx" ON "VoiceNote"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceTranscript_voiceNoteId_key" ON "VoiceTranscript"("voiceNoteId");

-- CreateIndex
CREATE INDEX "VoiceTranscript_voiceNoteId_idx" ON "VoiceTranscript"("voiceNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyLookup_inspectionId_key" ON "PropertyLookup"("inspectionId");

-- CreateIndex
CREATE INDEX "PropertyLookup_expiresAt_idx" ON "PropertyLookup"("expiresAt");

-- CreateIndex
CREATE INDEX "PropertyLookup_inspectionId_idx" ON "PropertyLookup"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyLookup_propertyAddress_propertyPostcode_key" ON "PropertyLookup"("propertyAddress", "propertyPostcode");

-- CreateIndex
CREATE INDEX "BuildingCode_regulatoryDocumentId_idx" ON "BuildingCode"("regulatoryDocumentId");

-- CreateIndex
CREATE INDEX "Integration_userId_idx" ON "Integration"("userId");

-- CreateIndex
CREATE INDEX "Integration_provider_idx" ON "Integration"("provider");

-- CreateIndex
CREATE INDEX "Integration_status_idx" ON "Integration"("status");

-- Check for and handle duplicate userId+provider combinations before adding unique constraint
-- If duplicates exist, keep only the most recent one (by id or createdAt if available)
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  -- Count duplicates
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT "userId", "provider", COUNT(*) as cnt
    FROM "Integration"
    WHERE "provider" IS NOT NULL
    GROUP BY "userId", "provider"
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF duplicate_count > 0 THEN
    -- Delete duplicates, keeping the one with the latest id (assuming cuid() generates sequential IDs)
    DELETE FROM "Integration"
    WHERE id IN (
      SELECT id
      FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY "userId", "provider" ORDER BY id DESC) as rn
        FROM "Integration"
        WHERE "provider" IS NOT NULL
      ) ranked
      WHERE rn > 1
    );
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "Integration_userId_provider_key" ON "Integration"("userId", "provider");

-- AddForeignKey
ALTER TABLE "ExternalClient" ADD CONSTRAINT "ExternalClient_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalJob" ADD CONSTRAINT "ExternalJob_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationSyncLog" ADD CONSTRAINT "IntegrationSyncLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingCode" ADD CONSTRAINT "BuildingCode_regulatoryDocumentId_fkey" FOREIGN KEY ("regulatoryDocumentId") REFERENCES "RegulatoryDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatorySection" ADD CONSTRAINT "RegulatorySection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RegulatoryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RegulatoryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "LidarScan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_voiceNoteId_fkey" FOREIGN KEY ("voiceNoteId") REFERENCES "VoiceNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailConnection" ADD CONSTRAINT "EmailConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledEmail" ADD CONSTRAINT "ScheduledEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledEmail" ADD CONSTRAINT "ScheduledEmail_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAudit" ADD CONSTRAINT "EmailAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAudit" ADD CONSTRAINT "EmailAudit_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSignature" ADD CONSTRAINT "FormSignature_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAttachment" ADD CONSTRAINT "FormAttachment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAuditLog" ADD CONSTRAINT "FormAuditLog_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTemplateVersion" ADD CONSTRAINT "FormTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_formTemplateId_fkey" FOREIGN KEY ("formTemplateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LidarScan" ADD CONSTRAINT "LidarScan_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlan" ADD CONSTRAINT "FloorPlan_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "LidarScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceTranscript" ADD CONSTRAINT "VoiceTranscript_voiceNoteId_fkey" FOREIGN KEY ("voiceNoteId") REFERENCES "VoiceNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyLookup" ADD CONSTRAINT "PropertyLookup_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
