-- ================================================================
-- prod-drift-fix-SAFE.sql — additive-only, idempotent
-- Generated: 2026-04-29T02:51:26.727Z
-- Source: prod-drift-fix.sql (filtered by filter-drift-fix-additive-only.ts)
--
-- Statements kept: 231
-- Statements discarded: 179
--
-- Discarded log (review separately if anything unexpected):
--   L17 -- AlterEnum (full enum rotation — drops old type)
--   L26 -- AlterEnum (full enum rotation — drops old type)
--   L35 -- AlterEnum (full enum rotation — drops old type)
--   L44 -- AlterEnum (full enum rotation — drops old type)
--   L53 -- AlterEnum (full enum rotation — drops old type)
--   L62 -- AlterEnum (full enum rotation — drops old type)
--   L74 -- AlterEnum (full enum rotation — drops old type)
--   L95 -- AlterEnum (full enum rotation — drops old type)
--   L104 -- DropForeignKey (auth schema — Supabase managed)
--   L107 -- DropForeignKey (auth schema — Supabase managed)
--   L110 -- DropForeignKey (auth schema — Supabase managed)
--   L113 -- DropForeignKey (auth schema — Supabase managed)
--   L116 -- DropForeignKey (auth schema — Supabase managed)
--   L119 -- DropForeignKey (auth schema — Supabase managed)
--   L122 -- DropForeignKey (auth schema — Supabase managed)
--   L125 -- DropForeignKey (auth schema — Supabase managed)
--   L128 -- DropForeignKey (auth schema — Supabase managed)
--   L131 -- DropForeignKey (auth schema — Supabase managed)
--   L134 -- DropForeignKey (auth schema — Supabase managed)
--   L137 -- DropForeignKey (auth schema — Supabase managed)
--   L140 -- DropForeignKey (auth schema — Supabase managed)
--   L143 -- DropForeignKey (auth schema — Supabase managed)
--   L146 -- DropForeignKey (auth schema — Supabase managed)
--   L149 -- DropForeignKey (auth schema — Supabase managed)
--   L152 -- DropForeignKey (auth schema — Supabase managed)
--   L155 -- DropForeignKey (auth schema — Supabase managed)
--   L158 -- DropForeignKey
--   L161 -- DropForeignKey
--   L164 -- DropForeignKey
--   L167 -- DropForeignKey
--   L170 -- DropForeignKey
--   L173 -- DropForeignKey
--   L176 -- DropForeignKey
--   L179 -- DropForeignKey
--   L182 -- DropForeignKey
--   L185 -- DropForeignKey
--   L188 -- DropForeignKey
--   L191 -- DropForeignKey
--   L194 -- DropForeignKey
--   L197 -- DropForeignKey
--   L200 -- DropForeignKey
--   L203 -- DropForeignKey
--   L206 -- DropForeignKey
--   L209 -- DropForeignKey
--   L212 -- DropForeignKey
--   L215 -- DropForeignKey
--   L218 -- DropForeignKey
--   L221 -- DropForeignKey
--   L224 -- DropForeignKey
--   L227 -- DropForeignKey
--   L230 -- DropForeignKey
--   L233 -- DropForeignKey
--   L236 -- DropForeignKey
--   L239 -- DropForeignKey
--   L242 -- DropForeignKey
--   L245 -- DropForeignKey
--   L248 -- DropForeignKey
--   L251 -- DropForeignKey
--   L254 -- DropForeignKey
--   L257 -- DropForeignKey
--   L260 -- DropForeignKey
--   L263 -- DropIndex
--   L266 -- DropIndex
--   L269 -- DropIndex
--   L272 -- DropIndex
--   L275 -- DropIndex
--   L278 -- DropIndex
--   L281 -- DropIndex
--   L284 -- DropIndex
--   L287 -- DropIndex
--   L290 -- DropIndex
--   L293 -- DropIndex
--   L296 -- DropIndex
--   L299 -- DropIndex
--   L302 -- DropIndex
--   L305 -- DropIndex
--   L308 -- DropIndex
--   L311 -- DropIndex
--   L314 -- DropIndex
--   L317 -- DropIndex
--   L320 -- DropIndex
--   L323 -- DropIndex
--   L326 -- DropIndex
--   L329 -- DropIndex
--   L332 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L338 -- AlterTable (mixed: kept 2 ADD COLUMN, dropped DROP/ALTER COLUMN parts)
--   L344 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L347 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L350 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L362 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L365 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L369 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L373 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L376 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L381 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L394 -- AlterTable (mixed: kept 1 ADD COLUMN, dropped DROP/ALTER COLUMN parts)
--   L400 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L420 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L424 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L430 -- AlterTable (mixed: kept 4 ADD COLUMN, dropped DROP/ALTER COLUMN parts)
--   L451 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L457 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L460 -- AlterTable (mixed: kept 6 ADD COLUMN, dropped DROP/ALTER COLUMN parts)
--   L487 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L494 -- AlterTable (mixed: kept 5 ADD COLUMN, dropped DROP/ALTER COLUMN parts)
--   L502 -- AlterTable (mixed: kept 1 ADD COLUMN, dropped DROP/ALTER COLUMN parts)
--   L509 -- AlterTable (contains DROP/ALTER COLUMN — destructive, no ADD COLUMN to salvage)
--   L513 -- AlterTable (mixed: kept 1 ADD COLUMN, dropped DROP/ALTER COLUMN parts)
--   L524 -- AlterTable (mixed: kept 2 ADD COLUMN, dropped DROP/ALTER COLUMN parts)
--   L531 -- DropTable (auth schema — Supabase managed)
--   L534 -- DropTable (auth schema — Supabase managed)
--   L537 -- DropTable (auth schema — Supabase managed)
--   L540 -- DropTable (auth schema — Supabase managed)
--   L543 -- DropTable (auth schema — Supabase managed)
--   L546 -- DropTable (auth schema — Supabase managed)
--   L549 -- DropTable (auth schema — Supabase managed)
--   L552 -- DropTable (auth schema — Supabase managed)
--   L555 -- DropTable (auth schema — Supabase managed)
--   L558 -- DropTable (auth schema — Supabase managed)
--   L561 -- DropTable (auth schema — Supabase managed)
--   L564 -- DropTable (auth schema — Supabase managed)
--   L567 -- DropTable (auth schema — Supabase managed)
--   L570 -- DropTable (auth schema — Supabase managed)
--   L573 -- DropTable (auth schema — Supabase managed)
--   L576 -- DropTable (auth schema — Supabase managed)
--   L579 -- DropTable (auth schema — Supabase managed)
--   L582 -- DropTable (auth schema — Supabase managed)
--   L585 -- DropTable (auth schema — Supabase managed)
--   L588 -- DropTable (auth schema — Supabase managed)
--   L591 -- DropTable (auth schema — Supabase managed)
--   L594 -- DropTable (auth schema — Supabase managed)
--   L597 -- DropTable (auth schema — Supabase managed)
--   L600 -- DropTable
--   L603 -- DropTable
--   L606 -- DropTable
--   L609 -- DropTable
--   L612 -- DropTable
--   L615 -- DropTable
--   L618 -- DropTable
--   L621 -- DropTable
--   L624 -- DropTable
--   L627 -- DropTable
--   L630 -- DropTable
--   L633 -- DropTable
--   L636 -- DropTable
--   L639 -- DropTable
--   L642 -- DropTable
--   L645 -- DropTable
--   L648 -- DropTable
--   L651 -- DropTable
--   L654 -- DropTable
--   L657 -- DropTable
--   L660 -- DropEnum (auth schema — Supabase managed)
--   L663 -- DropEnum (auth schema — Supabase managed)
--   L666 -- DropEnum (auth schema — Supabase managed)
--   L669 -- DropEnum (auth schema — Supabase managed)
--   L672 -- DropEnum (auth schema — Supabase managed)
--   L675 -- DropEnum (auth schema — Supabase managed)
--   L678 -- DropEnum (auth schema — Supabase managed)
--   L681 -- DropEnum (auth schema — Supabase managed)
--   L684 -- DropEnum (auth schema — Supabase managed)
--   L687 -- DropEnum
--   L690 -- DropEnum
--   L693 -- DropEnum
--   L696 -- DropEnum
--   L699 -- DropEnum
--   L702 -- DropEnum
--   L705 -- DropEnum
--   L708 -- DropEnum
--   L711 -- DropEnum
--   L714 -- DropEnum
--   L717 -- DropEnum
--   L720 -- DropEnum
--   L723 -- DropEnum
--   L726 -- DropEnum
--   L729 -- DropEnum
--   L732 -- DropEnum
--   L735 -- DropEnum
--   L1918 -- RenameIndex (skipping rename — manual review needed)
-- ================================================================

-- (filtered) -- CreateEnum L1
DO $$ BEGIN
  CREATE TYPE "AuthorisationSource" AS ENUM ('INSURER_EMAIL', 'CUSTOMER_SIGNATURE', 'INTERNAL_MANAGER', 'ADJUSTER_APPROVAL', 'CARRIER_EMAIL', 'CARRIER_PORTAL', 'DOCUSIGN', 'PHONE_THEN_EMAIL_FOLLOWUP', 'EMERGENCY_SELF');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- (filtered) -- AlterEnum L4
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'SENT'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EstimateStatus')
  ) THEN
    ALTER TYPE "EstimateStatus" ADD VALUE 'SENT';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'REJECTED'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EstimateStatus')
  ) THEN
    ALTER TYPE "EstimateStatus" ADD VALUE 'REJECTED';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'EXPIRED'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EstimateStatus')
  ) THEN
    ALTER TYPE "EstimateStatus" ADD VALUE 'EXPIRED';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'WITHDRAWN'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EstimateStatus')
  ) THEN
    ALTER TYPE "EstimateStatus" ADD VALUE 'WITHDRAWN';
  END IF;
END $$;

-- (filtered) -- AlterEnum L71
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'EXTERNAL'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PaymentMethod')
  ) THEN
    ALTER TYPE "PaymentMethod" ADD VALUE 'EXTERNAL';
  END IF;
END $$;

-- (filtered) -- AlterEnum L84
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'PROPERTY_OWNER'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SignatoryRole')
  ) THEN
    ALTER TYPE "SignatoryRole" ADD VALUE 'PROPERTY_OWNER';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'CONTRACTOR'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SignatoryRole')
  ) THEN
    ALTER TYPE "SignatoryRole" ADD VALUE 'CONTRACTOR';
  END IF;
END $$;

-- (filtered) -- AlterTable L335
ALTER TABLE "AppRelease" ADD COLUMN     "githubDeliveryId" TEXT;

-- (filtered, extracted ADD COLUMNs from mixed) -- AlterTable L338
ALTER TABLE "AscoraIntegration" ADD COLUMN IF NOT EXISTS "lastWebhookAt" TIMESTAMP(3);
ALTER TABLE "AscoraIntegration" ADD COLUMN IF NOT EXISTS "webhookSecret" TEXT;

-- (filtered) -- AlterTable L353
ALTER TABLE "ClaimProgress" ADD COLUMN     "managerReviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "managerReviewRequiredAt" TIMESTAMP(3),
ADD COLUMN     "managerReviewedAt" TIMESTAMP(3),
ADD COLUMN     "managerReviewedByUserId" TEXT;

-- (filtered) -- AlterTable L359
ALTER TABLE "Client" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false;

-- (filtered) -- AlterTable L391
ALTER TABLE "Estimate" ADD COLUMN     "metadata" TEXT;

-- (filtered, extracted ADD COLUMNs from mixed) -- AlterTable L394
ALTER TABLE "EstimateLineItem" ADD COLUMN IF NOT EXISTS "sourceCostItemId" TEXT;

-- (filtered, extracted ADD COLUMNs from mixed) -- AlterTable L430
ALTER TABLE "InspectionPhoto" ADD COLUMN IF NOT EXISTS "aiConfidence" DOUBLE PRECISION;
ALTER TABLE "InspectionPhoto" ADD COLUMN IF NOT EXISTS "aiLabels" JSONB;
ALTER TABLE "InspectionPhoto" ADD COLUMN IF NOT EXISTS "aiModel" TEXT;
ALTER TABLE "InspectionPhoto" ADD COLUMN IF NOT EXISTS "aiRunAt" TIMESTAMP(3);

-- (filtered) -- AlterTable L445
ALTER TABLE "Invoice" ADD COLUMN     "clientNameSnapshot" VARCHAR(256),
ADD COLUMN     "estimateRefSnapshot" VARCHAR(128),
ADD COLUMN     "reportAddressSnapshot" VARCHAR(512),
ADD COLUMN     "reportTitleSnapshot" VARCHAR(256);

-- (filtered, extracted ADD COLUMNs from mixed) -- AlterTable L460
ALTER TABLE "MoistureReading" ADD COLUMN IF NOT EXISTS "affectedArea" TEXT;
ALTER TABLE "MoistureReading" ADD COLUMN IF NOT EXISTS "deviceModel" TEXT;
ALTER TABLE "MoistureReading" ADD COLUMN IF NOT EXISTS "deviceVendor" TEXT;
ALTER TABLE "MoistureReading" ADD COLUMN IF NOT EXISTS "isBaseline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MoistureReading" ADD COLUMN IF NOT EXISTS "isMonitoringPoint" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MoistureReading" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'manual';

-- (filtered) -- AlterTable L484
ALTER TABLE "Organization" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'AU';

-- (filtered, extracted ADD COLUMNs from mixed) -- AlterTable L494
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "aiSynopsis" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "aiSynopsisAt" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "clientSummaryCache" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "clientSummaryCachedAt" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "isSample" BOOLEAN NOT NULL DEFAULT false;

-- (filtered, extracted ADD COLUMNs from mixed) -- AlterTable L502
ALTER TABLE "ScopeItem" ADD COLUMN IF NOT EXISTS "clauseRef" TEXT;

-- (filtered, extracted ADD COLUMNs from mixed) -- AlterTable L513
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "interviewTier" "SubscriptionTierLevel" NOT NULL DEFAULT 'STANDARD';

-- (filtered) -- AlterTable L521
ALTER TABLE "WebhookEvent" ADD COLUMN     "externalEventId" TEXT;

-- (filtered, extracted ADD COLUMNs from mixed) -- AlterTable L524
ALTER TABLE "XeroAccountCodeMapping" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "XeroAccountCodeMapping" ADD COLUMN IF NOT EXISTS "integrationId" TEXT NOT NULL;

-- (filtered) -- CreateTable L738
CREATE TABLE IF NOT EXISTS "WHSIncident" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT,
    "userId" TEXT NOT NULL,
    "incidentType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "injuredParty" TEXT,
    "injuryDescription" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WHSIncident_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L757
CREATE TABLE IF NOT EXISTS "WHSCorrectiveAction" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedTo" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WHSCorrectiveAction_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L772
CREATE TABLE IF NOT EXISTS "AdminImpersonation" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,

    CONSTRAINT "AdminImpersonation_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L789
CREATE TABLE IF NOT EXISTS "UsageEvent" (
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

-- (filtered) -- CreateTable L811
CREATE TABLE IF NOT EXISTS "EmailConnection" (
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

-- (filtered) -- CreateTable L826
CREATE TABLE IF NOT EXISTS "EmailAudit" (
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

-- (filtered) -- CreateTable L840
CREATE TABLE IF NOT EXISTS "FormTemplate" (
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
    "workspaceId" TEXT,

    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L863
CREATE TABLE IF NOT EXISTS "FormSubmission" (
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

-- (filtered) -- CreateTable L884
CREATE TABLE IF NOT EXISTS "FormSignature" (
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

-- (filtered) -- CreateTable L906
CREATE TABLE IF NOT EXISTS "FormAttachment" (
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

-- (filtered) -- CreateTable L923
CREATE TABLE IF NOT EXISTS "FormAuditLog" (
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

-- (filtered) -- CreateTable L939
CREATE TABLE IF NOT EXISTS "FormTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changeNotes" TEXT,
    "changedBy" TEXT NOT NULL,
    "schemaSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L952
CREATE TABLE IF NOT EXISTS "SubscriptionTier" (
    "id" TEXT NOT NULL,
    "tierName" "SubscriptionTierLevel" NOT NULL,
    "monthlyPrice" DOUBLE PRECISION NOT NULL,
    "features" TEXT,
    "standardsCoverage" TEXT[],
    "maxFormsPerMonth" INTEGER,
    "maxQuestionsPerInterview" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionTier_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L967
CREATE TABLE IF NOT EXISTS "InterviewQuestion" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "helperText" TEXT,
    "exampleAnswer" TEXT,
    "sequenceNumber" INTEGER,
    "standardsReference" TEXT[],
    "standardsJustification" TEXT NOT NULL,
    "targetFormFields" TEXT[],
    "fieldMappings" TEXT NOT NULL,
    "condition" TEXT,
    "skipLogic" TEXT,
    "conditionalShows" TEXT,
    "fieldGuidance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "minTierLevel" "SubscriptionTierLevel" NOT NULL DEFAULT 'STANDARD',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "averageTimeSeconds" INTEGER,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L993
CREATE TABLE IF NOT EXISTS "InterviewSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "formTemplateId" TEXT NOT NULL,
    "formSubmissionId" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'STARTED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),
    "totalQuestionsAsked" INTEGER NOT NULL DEFAULT 0,
    "totalAnswersGiven" INTEGER NOT NULL DEFAULT 0,
    "estimatedTimeMinutes" INTEGER NOT NULL DEFAULT 5,
    "actualTimeMinutes" INTEGER,
    "answers" TEXT,
    "autoPopulatedFields" TEXT,
    "standardsReferences" TEXT,
    "equipmentRecommendations" TEXT,
    "estimatedEquipmentCost" DOUBLE PRECISION,
    "userTierLevel" "SubscriptionTierLevel" NOT NULL,
    "technicianExperience" TEXT,
    "reportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1021
CREATE TABLE IF NOT EXISTS "InterviewResponse" (
    "id" TEXT NOT NULL,
    "interviewSessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "answerValue" TEXT,
    "answerType" "QuestionType" NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeSpentSeconds" INTEGER,
    "populatedFields" TEXT,
    "standardsReference" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewResponse_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1038
CREATE TABLE IF NOT EXISTS "InterviewStandardsMapping" (
    "id" TEXT NOT NULL,
    "interviewSessionId" TEXT NOT NULL,
    "standardCode" TEXT NOT NULL,
    "standardTitle" TEXT NOT NULL,
    "questionsUsing" TEXT[],
    "fieldsAffected" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewStandardsMapping_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1054
CREATE TABLE IF NOT EXISTS "LidarScan" (
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

-- (filtered) -- CreateTable L1076
CREATE TABLE IF NOT EXISTS "FloorPlan" (
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

-- (filtered) -- CreateTable L1095
CREATE TABLE IF NOT EXISTS "VoiceNote" (
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

-- (filtered) -- CreateTable L1116
CREATE TABLE IF NOT EXISTS "VoiceTranscript" (
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

-- (filtered) -- CreateTable L1135
CREATE TABLE IF NOT EXISTS "CancellationFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "subscriptionPlan" TEXT,
    "tenureDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancellationFeedback_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1148
CREATE TABLE IF NOT EXISTS "OAuthStateNonce" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthStateNonce_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1161
CREATE TABLE IF NOT EXISTS "ScopeTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "claimType" TEXT,
    "items" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScopeTemplate_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1175
CREATE TABLE IF NOT EXISTS "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "responseDraft" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1194
CREATE TABLE IF NOT EXISTS "BrandAmbassadorPost" (
    "id" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "draft" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandAmbassadorPost_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1207
CREATE TABLE IF NOT EXISTS "InvoiceSyncJob" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "InvoiceSyncJob_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1223
CREATE TABLE IF NOT EXISTS "LiveTeacherSession" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "modelUsedLocal" TEXT,
    "modelUsedCloud" TEXT,
    "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCostAudCents" INTEGER NOT NULL DEFAULT 0,
    "jurisdiction" TEXT NOT NULL,
    "deviceOs" TEXT NOT NULL,
    "hadLidar" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LiveTeacherSession_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1242
CREATE TABLE IF NOT EXISTS "TeacherUtterance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "clauseRefs" TEXT[],
    "confidence" DOUBLE PRECISION,
    "userOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "ranOnDevice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherUtterance_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1259
CREATE TABLE IF NOT EXISTS "TeacherToolCall" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "utteranceId" TEXT,
    "toolName" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherToolCall_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1274
CREATE TABLE IF NOT EXISTS "StandardsChunk" (
    "id" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "clause" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,

    CONSTRAINT "StandardsChunk_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1287
CREATE TABLE IF NOT EXISTS "MakeSafeAction" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "applicable" BOOLEAN NOT NULL DEFAULT true,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MakeSafeAction_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1303
CREATE TABLE IF NOT EXISTS "ScopeVariation" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "authorisationSource" "AuthorisationSource" NOT NULL,
    "authorisationRef" TEXT,
    "costDeltaCents" INTEGER NOT NULL,
    "costDeltaPercent" DOUBLE PRECISION,
    "approvedByUserId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "autoApprovalRule" TEXT,
    "notes" TEXT,
    "autoDecision" TEXT,
    "autoDecisionReason" TEXT,
    "autoDecisionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScopeVariation_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1326
CREATE TABLE IF NOT EXISTS "SwmsDraft" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SwmsDraft_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1339
CREATE TABLE IF NOT EXISTS "Authorisation" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT,
    "userId" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "subjectContractorId" TEXT,
    "subjectCompanyName" TEXT NOT NULL,
    "subjectAbn" TEXT,
    "subjectLicenceNumber" TEXT,
    "subjectLicenceState" TEXT,
    "subjectLicenceClass" TEXT,
    "publicLiabilityInsurer" TEXT,
    "publicLiabilityPolicyNumber" TEXT,
    "publicLiabilityCoverAmount" DECIMAL(12,2),
    "workCoverPolicyNumber" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedMethod" TEXT NOT NULL,
    "verifiedDocumentId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Authorisation_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1367
CREATE TABLE IF NOT EXISTS "DeviceSigningKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicKeyId" TEXT NOT NULL,
    "publicKeyPem" TEXT NOT NULL,
    "deviceUuid" TEXT,
    "devicePlatform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceSigningKey_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateTable L1382
CREATE TABLE IF NOT EXISTS "ActivationEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "properties" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationEvent_pkey" PRIMARY KEY ("id")
);

-- (filtered) -- CreateIndex L1393
CREATE INDEX IF NOT EXISTS "WHSIncident_inspectionId_idx" ON "WHSIncident"("inspectionId");

-- (filtered) -- CreateIndex L1396
CREATE INDEX IF NOT EXISTS "WHSIncident_userId_createdAt_idx" ON "WHSIncident"("userId", "createdAt");

-- (filtered) -- CreateIndex L1399
CREATE INDEX IF NOT EXISTS "WHSIncident_incidentType_severity_idx" ON "WHSIncident"("incidentType", "severity");

-- (filtered) -- CreateIndex L1402
CREATE INDEX IF NOT EXISTS "WHSIncident_status_idx" ON "WHSIncident"("status");

-- (filtered) -- CreateIndex L1405
CREATE INDEX IF NOT EXISTS "WHSCorrectiveAction_incidentId_idx" ON "WHSCorrectiveAction"("incidentId");

-- (filtered) -- CreateIndex L1408
CREATE INDEX IF NOT EXISTS "WHSCorrectiveAction_assignedTo_completed_idx" ON "WHSCorrectiveAction"("assignedTo", "completed");

-- (filtered) -- CreateIndex L1411
CREATE UNIQUE INDEX IF NOT EXISTS "AdminImpersonation_tokenId_key" ON "AdminImpersonation"("tokenId");

-- (filtered) -- CreateIndex L1414
CREATE INDEX IF NOT EXISTS "AdminImpersonation_adminUserId_startedAt_idx" ON "AdminImpersonation"("adminUserId", "startedAt");

-- (filtered) -- CreateIndex L1417
CREATE INDEX IF NOT EXISTS "AdminImpersonation_targetUserId_startedAt_idx" ON "AdminImpersonation"("targetUserId", "startedAt");

-- (filtered) -- CreateIndex L1420
CREATE INDEX IF NOT EXISTS "AdminImpersonation_expiresAt_idx" ON "AdminImpersonation"("expiresAt");

-- (filtered) -- CreateIndex L1423
CREATE INDEX IF NOT EXISTS "UsageEvent_userId_timestamp_idx" ON "UsageEvent"("userId", "timestamp");

-- (filtered) -- CreateIndex L1426
CREATE INDEX IF NOT EXISTS "UsageEvent_inspectionId_idx" ON "UsageEvent"("inspectionId");

-- (filtered) -- CreateIndex L1429
CREATE INDEX IF NOT EXISTS "UsageEvent_scanId_idx" ON "UsageEvent"("scanId");

-- (filtered) -- CreateIndex L1432
CREATE INDEX IF NOT EXISTS "UsageEvent_voiceNoteId_idx" ON "UsageEvent"("voiceNoteId");

-- (filtered) -- CreateIndex L1435
CREATE INDEX IF NOT EXISTS "UsageEvent_billingStatus_idx" ON "UsageEvent"("billingStatus");

-- (filtered) -- CreateIndex L1438
CREATE INDEX IF NOT EXISTS "UsageEvent_eventType_idx" ON "UsageEvent"("eventType");

-- (filtered) -- CreateIndex L1441
CREATE INDEX IF NOT EXISTS "UsageEvent_timestamp_idx" ON "UsageEvent"("timestamp");

-- (filtered) -- CreateIndex L1444
CREATE UNIQUE INDEX IF NOT EXISTS "EmailConnection_userId_key" ON "EmailConnection"("userId");

-- (filtered) -- CreateIndex L1447
CREATE INDEX IF NOT EXISTS "EmailConnection_userId_idx" ON "EmailConnection"("userId");

-- (filtered) -- CreateIndex L1450
CREATE INDEX IF NOT EXISTS "EmailConnection_provider_idx" ON "EmailConnection"("provider");

-- (filtered) -- CreateIndex L1453
CREATE INDEX IF NOT EXISTS "EmailAudit_userId_idx" ON "EmailAudit"("userId");

-- (filtered) -- CreateIndex L1456
CREATE INDEX IF NOT EXISTS "EmailAudit_reportId_idx" ON "EmailAudit"("reportId");

-- (filtered) -- CreateIndex L1459
CREATE INDEX IF NOT EXISTS "EmailAudit_sentAt_idx" ON "EmailAudit"("sentAt");

-- (filtered) -- CreateIndex L1462
CREATE INDEX IF NOT EXISTS "FormTemplate_userId_idx" ON "FormTemplate"("userId");

-- (filtered) -- CreateIndex L1465
CREATE INDEX IF NOT EXISTS "FormTemplate_formType_idx" ON "FormTemplate"("formType");

-- (filtered) -- CreateIndex L1468
CREATE INDEX IF NOT EXISTS "FormTemplate_category_idx" ON "FormTemplate"("category");

-- (filtered) -- CreateIndex L1471
CREATE INDEX IF NOT EXISTS "FormTemplate_status_idx" ON "FormTemplate"("status");

-- (filtered) -- CreateIndex L1474
CREATE INDEX IF NOT EXISTS "FormTemplate_isSystemTemplate_idx" ON "FormTemplate"("isSystemTemplate");

-- (filtered) -- CreateIndex L1477
CREATE INDEX IF NOT EXISTS "FormTemplate_workspaceId_idx" ON "FormTemplate"("workspaceId");

-- (filtered) -- CreateIndex L1480
CREATE UNIQUE INDEX IF NOT EXISTS "FormSubmission_submissionNumber_key" ON "FormSubmission"("submissionNumber");

-- (filtered) -- CreateIndex L1483
CREATE INDEX IF NOT EXISTS "FormSubmission_templateId_idx" ON "FormSubmission"("templateId");

-- (filtered) -- CreateIndex L1486
CREATE INDEX IF NOT EXISTS "FormSubmission_userId_idx" ON "FormSubmission"("userId");

-- (filtered) -- CreateIndex L1489
CREATE INDEX IF NOT EXISTS "FormSubmission_reportId_idx" ON "FormSubmission"("reportId");

-- (filtered) -- CreateIndex L1492
CREATE INDEX IF NOT EXISTS "FormSubmission_status_idx" ON "FormSubmission"("status");

-- (filtered) -- CreateIndex L1495
CREATE INDEX IF NOT EXISTS "FormSubmission_submittedAt_idx" ON "FormSubmission"("submittedAt");

-- (filtered) -- CreateIndex L1498
CREATE INDEX IF NOT EXISTS "FormSignature_submissionId_idx" ON "FormSignature"("submissionId");

-- (filtered) -- CreateIndex L1501
CREATE INDEX IF NOT EXISTS "FormSignature_signatoryRole_idx" ON "FormSignature"("signatoryRole");

-- (filtered) -- CreateIndex L1504
CREATE INDEX IF NOT EXISTS "FormAttachment_submissionId_idx" ON "FormAttachment"("submissionId");

-- (filtered) -- CreateIndex L1507
CREATE INDEX IF NOT EXISTS "FormAuditLog_submissionId_idx" ON "FormAuditLog"("submissionId");

-- (filtered) -- CreateIndex L1510
CREATE INDEX IF NOT EXISTS "FormAuditLog_userId_idx" ON "FormAuditLog"("userId");

-- (filtered) -- CreateIndex L1513
CREATE INDEX IF NOT EXISTS "FormAuditLog_timestamp_idx" ON "FormAuditLog"("timestamp");

-- (filtered) -- CreateIndex L1516
CREATE INDEX IF NOT EXISTS "FormTemplateVersion_templateId_idx" ON "FormTemplateVersion"("templateId");

-- (filtered) -- CreateIndex L1519
CREATE UNIQUE INDEX IF NOT EXISTS "FormTemplateVersion_templateId_version_key" ON "FormTemplateVersion"("templateId", "version");

-- (filtered) -- CreateIndex L1522
CREATE INDEX IF NOT EXISTS "SubscriptionTier_tierName_idx" ON "SubscriptionTier"("tierName");

-- (filtered) -- CreateIndex L1525
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionTier_tierName_key" ON "SubscriptionTier"("tierName");

-- (filtered) -- CreateIndex L1528
CREATE INDEX IF NOT EXISTS "InterviewQuestion_sequenceNumber_idx" ON "InterviewQuestion"("sequenceNumber");

-- (filtered) -- CreateIndex L1531
CREATE INDEX IF NOT EXISTS "InterviewQuestion_minTierLevel_idx" ON "InterviewQuestion"("minTierLevel");

-- (filtered) -- CreateIndex L1534
CREATE INDEX IF NOT EXISTS "InterviewQuestion_isActive_idx" ON "InterviewQuestion"("isActive");

-- (filtered) -- CreateIndex L1537
CREATE INDEX IF NOT EXISTS "InterviewSession_userId_idx" ON "InterviewSession"("userId");

-- (filtered) -- CreateIndex L1540
CREATE INDEX IF NOT EXISTS "InterviewSession_status_idx" ON "InterviewSession"("status");

-- (filtered) -- CreateIndex L1543
CREATE INDEX IF NOT EXISTS "InterviewSession_createdAt_idx" ON "InterviewSession"("createdAt");

-- (filtered) -- CreateIndex L1546
CREATE INDEX IF NOT EXISTS "InterviewSession_formTemplateId_idx" ON "InterviewSession"("formTemplateId");

-- (filtered) -- CreateIndex L1549
CREATE INDEX IF NOT EXISTS "InterviewSession_reportId_idx" ON "InterviewSession"("reportId");

-- (filtered) -- CreateIndex L1552
CREATE INDEX IF NOT EXISTS "InterviewResponse_interviewSessionId_idx" ON "InterviewResponse"("interviewSessionId");

-- (filtered) -- CreateIndex L1555
CREATE INDEX IF NOT EXISTS "InterviewResponse_questionId_idx" ON "InterviewResponse"("questionId");

-- (filtered) -- CreateIndex L1558
CREATE INDEX IF NOT EXISTS "InterviewStandardsMapping_interviewSessionId_idx" ON "InterviewStandardsMapping"("interviewSessionId");

-- (filtered) -- CreateIndex L1561
CREATE INDEX IF NOT EXISTS "InterviewStandardsMapping_standardCode_idx" ON "InterviewStandardsMapping"("standardCode");

-- (filtered) -- CreateIndex L1564
CREATE INDEX IF NOT EXISTS "LidarScan_inspectionId_idx" ON "LidarScan"("inspectionId");

-- (filtered) -- CreateIndex L1567
CREATE INDEX IF NOT EXISTS "LidarScan_processingStatus_idx" ON "LidarScan"("processingStatus");

-- (filtered) -- CreateIndex L1570
CREATE INDEX IF NOT EXISTS "LidarScan_uploadedBy_idx" ON "LidarScan"("uploadedBy");

-- (filtered) -- CreateIndex L1573
CREATE UNIQUE INDEX IF NOT EXISTS "FloorPlan_scanId_key" ON "FloorPlan"("scanId");

-- (filtered) -- CreateIndex L1576
CREATE INDEX IF NOT EXISTS "FloorPlan_scanId_idx" ON "FloorPlan"("scanId");

-- (filtered) -- CreateIndex L1579
CREATE INDEX IF NOT EXISTS "VoiceNote_inspectionId_idx" ON "VoiceNote"("inspectionId");

-- (filtered) -- CreateIndex L1582
CREATE INDEX IF NOT EXISTS "VoiceNote_transcriptionStatus_idx" ON "VoiceNote"("transcriptionStatus");

-- (filtered) -- CreateIndex L1585
CREATE INDEX IF NOT EXISTS "VoiceNote_recordedBy_idx" ON "VoiceNote"("recordedBy");

-- (filtered) -- CreateIndex L1588
CREATE UNIQUE INDEX IF NOT EXISTS "VoiceTranscript_voiceNoteId_key" ON "VoiceTranscript"("voiceNoteId");

-- (filtered) -- CreateIndex L1591
CREATE INDEX IF NOT EXISTS "VoiceTranscript_voiceNoteId_idx" ON "VoiceTranscript"("voiceNoteId");

-- (filtered) -- CreateIndex L1594
CREATE INDEX IF NOT EXISTS "CancellationFeedback_userId_idx" ON "CancellationFeedback"("userId");

-- (filtered) -- CreateIndex L1597
CREATE INDEX IF NOT EXISTS "CancellationFeedback_reason_idx" ON "CancellationFeedback"("reason");

-- (filtered) -- CreateIndex L1600
CREATE INDEX IF NOT EXISTS "CancellationFeedback_createdAt_idx" ON "CancellationFeedback"("createdAt");

-- (filtered) -- CreateIndex L1603
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthStateNonce_nonce_key" ON "OAuthStateNonce"("nonce");

-- (filtered) -- CreateIndex L1606
CREATE INDEX IF NOT EXISTS "OAuthStateNonce_expiresAt_idx" ON "OAuthStateNonce"("expiresAt");

-- (filtered) -- CreateIndex L1609
CREATE INDEX IF NOT EXISTS "OAuthStateNonce_userId_provider_idx" ON "OAuthStateNonce"("userId", "provider");

-- (filtered) -- CreateIndex L1612
CREATE INDEX IF NOT EXISTS "ScopeTemplate_userId_idx" ON "ScopeTemplate"("userId");

-- (filtered) -- CreateIndex L1615
CREATE INDEX IF NOT EXISTS "ScopeTemplate_claimType_idx" ON "ScopeTemplate"("claimType");

-- (filtered) -- CreateIndex L1618
CREATE INDEX IF NOT EXISTS "SupportTicket_status_idx" ON "SupportTicket"("status");

-- (filtered) -- CreateIndex L1621
CREATE INDEX IF NOT EXISTS "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- (filtered) -- CreateIndex L1624
CREATE INDEX IF NOT EXISTS "SupportTicket_email_idx" ON "SupportTicket"("email");

-- (filtered) -- CreateIndex L1627
CREATE INDEX IF NOT EXISTS "BrandAmbassadorPost_projectKey_idx" ON "BrandAmbassadorPost"("projectKey");

-- (filtered) -- CreateIndex L1630
CREATE INDEX IF NOT EXISTS "BrandAmbassadorPost_year_isoWeek_idx" ON "BrandAmbassadorPost"("year", "isoWeek");

-- (filtered) -- CreateIndex L1633
CREATE UNIQUE INDEX IF NOT EXISTS "BrandAmbassadorPost_projectKey_isoWeek_year_key" ON "BrandAmbassadorPost"("projectKey", "isoWeek", "year");

-- (filtered) -- CreateIndex L1636
CREATE INDEX IF NOT EXISTS "InvoiceSyncJob_status_priority_createdAt_idx" ON "InvoiceSyncJob"("status", "priority", "createdAt");

-- (filtered) -- CreateIndex L1639
CREATE INDEX IF NOT EXISTS "InvoiceSyncJob_invoiceId_idx" ON "InvoiceSyncJob"("invoiceId");

-- (filtered) -- CreateIndex L1642
CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceSyncJob_invoiceId_provider_key" ON "InvoiceSyncJob"("invoiceId", "provider");

-- (filtered) -- CreateIndex L1645
CREATE INDEX IF NOT EXISTS "LiveTeacherSession_inspectionId_idx" ON "LiveTeacherSession"("inspectionId");

-- (filtered) -- CreateIndex L1648
CREATE INDEX IF NOT EXISTS "LiveTeacherSession_userId_startedAt_idx" ON "LiveTeacherSession"("userId", "startedAt");

-- (filtered) -- CreateIndex L1651
CREATE INDEX IF NOT EXISTS "TeacherUtterance_sessionId_turnIndex_idx" ON "TeacherUtterance"("sessionId", "turnIndex");

-- (filtered) -- CreateIndex L1654
CREATE INDEX IF NOT EXISTS "TeacherToolCall_sessionId_idx" ON "TeacherToolCall"("sessionId");

-- (filtered) -- CreateIndex L1657
CREATE INDEX IF NOT EXISTS "TeacherToolCall_toolName_idx" ON "TeacherToolCall"("toolName");

-- (filtered) -- CreateIndex L1660
CREATE INDEX IF NOT EXISTS "StandardsChunk_standard_jurisdiction_idx" ON "StandardsChunk"("standard", "jurisdiction");

-- (filtered) -- CreateIndex L1663
CREATE UNIQUE INDEX IF NOT EXISTS "StandardsChunk_standard_edition_clause_key" ON "StandardsChunk"("standard", "edition", "clause");

-- (filtered) -- CreateIndex L1666
CREATE INDEX IF NOT EXISTS "MakeSafeAction_inspectionId_idx" ON "MakeSafeAction"("inspectionId");

-- (filtered) -- CreateIndex L1669
CREATE UNIQUE INDEX IF NOT EXISTS "MakeSafeAction_inspectionId_action_key" ON "MakeSafeAction"("inspectionId", "action");

-- (filtered) -- CreateIndex L1672
CREATE INDEX IF NOT EXISTS "ScopeVariation_inspectionId_createdAt_idx" ON "ScopeVariation"("inspectionId", "createdAt");

-- (filtered) -- CreateIndex L1675
CREATE INDEX IF NOT EXISTS "ScopeVariation_status_idx" ON "ScopeVariation"("status");

-- (filtered) -- CreateIndex L1678
CREATE UNIQUE INDEX IF NOT EXISTS "SwmsDraft_inspectionId_key" ON "SwmsDraft"("inspectionId");

-- (filtered) -- CreateIndex L1681
CREATE INDEX IF NOT EXISTS "SwmsDraft_inspectionId_idx" ON "SwmsDraft"("inspectionId");

-- (filtered) -- CreateIndex L1684
CREATE INDEX IF NOT EXISTS "Authorisation_inspectionId_idx" ON "Authorisation"("inspectionId");

-- (filtered) -- CreateIndex L1687
CREATE INDEX IF NOT EXISTS "Authorisation_userId_idx" ON "Authorisation"("userId");

-- (filtered) -- CreateIndex L1690
CREATE INDEX IF NOT EXISTS "Authorisation_subjectContractorId_idx" ON "Authorisation"("subjectContractorId");

-- (filtered) -- CreateIndex L1693
CREATE INDEX IF NOT EXISTS "Authorisation_status_idx" ON "Authorisation"("status");

-- (filtered) -- CreateIndex L1696
CREATE INDEX IF NOT EXISTS "Authorisation_expiresAt_idx" ON "Authorisation"("expiresAt");

-- (filtered) -- CreateIndex L1699
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceSigningKey_publicKeyId_key" ON "DeviceSigningKey"("publicKeyId");

-- (filtered) -- CreateIndex L1702
CREATE INDEX IF NOT EXISTS "DeviceSigningKey_userId_idx" ON "DeviceSigningKey"("userId");

-- (filtered) -- CreateIndex L1705
CREATE INDEX IF NOT EXISTS "DeviceSigningKey_publicKeyId_idx" ON "DeviceSigningKey"("publicKeyId");

-- (filtered) -- CreateIndex L1708
CREATE INDEX IF NOT EXISTS "DeviceSigningKey_revokedAt_idx" ON "DeviceSigningKey"("revokedAt");

-- (filtered) -- CreateIndex L1711
CREATE INDEX IF NOT EXISTS "ActivationEvent_userId_eventName_idx" ON "ActivationEvent"("userId", "eventName");

-- (filtered) -- CreateIndex L1714
CREATE INDEX IF NOT EXISTS "ActivationEvent_createdAt_idx" ON "ActivationEvent"("createdAt");

-- (filtered) -- CreateIndex L1717
CREATE UNIQUE INDEX IF NOT EXISTS "AppRelease_githubDeliveryId_key" ON "AppRelease"("githubDeliveryId");

-- (filtered) -- CreateIndex L1720
CREATE INDEX IF NOT EXISTS "AuditLog_inspectionId_timestamp_idx" ON "AuditLog"("inspectionId", "timestamp");

-- (filtered) -- CreateIndex L1723
CREATE INDEX IF NOT EXISTS "CostLibrary_userId_idx" ON "CostLibrary"("userId");

-- (filtered) -- CreateIndex L1726
CREATE INDEX IF NOT EXISTS "EnvironmentalData_inspectionId_idx" ON "EnvironmentalData"("inspectionId");

-- (filtered) -- CreateIndex L1729
CREATE INDEX IF NOT EXISTS "EnvironmentalData_inspectionId_recordedAt_idx" ON "EnvironmentalData"("inspectionId", "recordedAt");

-- (filtered) -- CreateIndex L1732
CREATE INDEX IF NOT EXISTS "EstimateLineItem_sourceCostItemId_idx" ON "EstimateLineItem"("sourceCostItemId");

-- (filtered) -- CreateIndex L1735
CREATE INDEX IF NOT EXISTS "HistoricalJob_source_idx" ON "HistoricalJob"("source");

-- (filtered) -- CreateIndex L1738
CREATE INDEX IF NOT EXISTS "HistoricalJob_state_idx" ON "HistoricalJob"("state");

-- (filtered) -- CreateIndex L1741
CREATE UNIQUE INDEX IF NOT EXISTS "HistoricalJob_source_externalId_key" ON "HistoricalJob"("source", "externalId");

-- (filtered) -- CreateIndex L1744
CREATE INDEX IF NOT EXISTS "Inspection_userId_createdAt_idx" ON "Inspection"("userId", "createdAt");

-- (filtered) -- CreateIndex L1747
CREATE INDEX IF NOT EXISTS "InspectionPhoto_inspectionId_timestamp_idx" ON "InspectionPhoto"("inspectionId", "timestamp");

-- (filtered) -- CreateIndex L1750
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_externalSyncProvider_externalInvoiceId_key" ON "Invoice"("externalSyncProvider", "externalInvoiceId");

-- (filtered) -- CreateIndex L1753
CREATE INDEX IF NOT EXISTS "MediaAssetTag_inspectionId_idx" ON "MediaAssetTag"("inspectionId");

-- (filtered) -- CreateIndex L1756
CREATE INDEX IF NOT EXISTS "MoistureReading_inspectionId_recordedAt_idx" ON "MoistureReading"("inspectionId", "recordedAt");

-- (filtered) -- CreateIndex L1759
CREATE INDEX IF NOT EXISTS "MoistureReading_inspectionId_isBaseline_idx" ON "MoistureReading"("inspectionId", "isBaseline");

-- (filtered) -- CreateIndex L1762
CREATE INDEX IF NOT EXISTS "MoistureReading_inspectionId_isMonitoringPoint_idx" ON "MoistureReading"("inspectionId", "isMonitoringPoint");

-- (filtered) -- CreateIndex L1765
CREATE INDEX IF NOT EXISTS "MoistureReading_inspectionId_affectedArea_idx" ON "MoistureReading"("inspectionId", "affectedArea");

-- (filtered) -- CreateIndex L1768
CREATE INDEX IF NOT EXISTS "PropertyLookup_inspectionId_idx" ON "PropertyLookup"("inspectionId");

-- (filtered) -- CreateIndex L1771
CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_provider_externalEventId_key" ON "WebhookEvent"("provider", "externalEventId");

-- (filtered) -- CreateIndex L1774
CREATE INDEX IF NOT EXISTS "XeroAccountCodeMapping_integrationId_idx" ON "XeroAccountCodeMapping"("integrationId");

-- (filtered) -- CreateIndex L1777
CREATE UNIQUE INDEX IF NOT EXISTS "XeroAccountCodeMapping_integrationId_category_key" ON "XeroAccountCodeMapping"("integrationId", "category");

-- (filtered) -- AddForeignKey L1780
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_subscriptionTierId_fkey'
  ) THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_subscriptionTierId_fkey" FOREIGN KEY ("subscriptionTierId") REFERENCES "SubscriptionTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1783
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'XeroAccountCodeMapping_integrationId_fkey'
  ) THEN
    ALTER TABLE "XeroAccountCodeMapping" ADD CONSTRAINT "XeroAccountCodeMapping_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1786
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EstimateLineItem_sourceCostItemId_fkey'
  ) THEN
    ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_sourceCostItemId_fkey" FOREIGN KEY ("sourceCostItemId") REFERENCES "CostItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1789
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WHSIncident_inspectionId_fkey'
  ) THEN
    ALTER TABLE "WHSIncident" ADD CONSTRAINT "WHSIncident_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1792
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WHSCorrectiveAction_incidentId_fkey'
  ) THEN
    ALTER TABLE "WHSCorrectiveAction" ADD CONSTRAINT "WHSCorrectiveAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "WHSIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1795
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AdminImpersonation_adminUserId_fkey'
  ) THEN
    ALTER TABLE "AdminImpersonation" ADD CONSTRAINT "AdminImpersonation_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1798
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AdminImpersonation_targetUserId_fkey'
  ) THEN
    ALTER TABLE "AdminImpersonation" ADD CONSTRAINT "AdminImpersonation_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1801
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UsageEvent_userId_fkey'
  ) THEN
    ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1804
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UsageEvent_inspectionId_fkey'
  ) THEN
    ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1807
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UsageEvent_scanId_fkey'
  ) THEN
    ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "LidarScan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1810
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UsageEvent_voiceNoteId_fkey'
  ) THEN
    ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_voiceNoteId_fkey" FOREIGN KEY ("voiceNoteId") REFERENCES "VoiceNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1813
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmailConnection_userId_fkey'
  ) THEN
    ALTER TABLE "EmailConnection" ADD CONSTRAINT "EmailConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1816
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmailAudit_userId_fkey'
  ) THEN
    ALTER TABLE "EmailAudit" ADD CONSTRAINT "EmailAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1819
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmailAudit_reportId_fkey'
  ) THEN
    ALTER TABLE "EmailAudit" ADD CONSTRAINT "EmailAudit_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1822
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FormTemplate_userId_fkey'
  ) THEN
    ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1825
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FormTemplate_workspaceId_fkey'
  ) THEN
    ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1828
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FormSubmission_templateId_fkey'
  ) THEN
    ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1831
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FormSubmission_userId_fkey'
  ) THEN
    ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1834
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FormSubmission_reportId_fkey'
  ) THEN
    ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1837
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FormSignature_submissionId_fkey'
  ) THEN
    ALTER TABLE "FormSignature" ADD CONSTRAINT "FormSignature_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1840
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FormAttachment_submissionId_fkey'
  ) THEN
    ALTER TABLE "FormAttachment" ADD CONSTRAINT "FormAttachment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1843
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FormAuditLog_submissionId_fkey'
  ) THEN
    ALTER TABLE "FormAuditLog" ADD CONSTRAINT "FormAuditLog_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1846
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FormTemplateVersion_templateId_fkey'
  ) THEN
    ALTER TABLE "FormTemplateVersion" ADD CONSTRAINT "FormTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1849
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InterviewSession_reportId_fkey'
  ) THEN
    ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1852
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InterviewSession_userId_fkey'
  ) THEN
    ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1855
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InterviewSession_formTemplateId_fkey'
  ) THEN
    ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_formTemplateId_fkey" FOREIGN KEY ("formTemplateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1858
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InterviewResponse_interviewSessionId_fkey'
  ) THEN
    ALTER TABLE "InterviewResponse" ADD CONSTRAINT "InterviewResponse_interviewSessionId_fkey" FOREIGN KEY ("interviewSessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1861
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InterviewStandardsMapping_interviewSessionId_fkey'
  ) THEN
    ALTER TABLE "InterviewStandardsMapping" ADD CONSTRAINT "InterviewStandardsMapping_interviewSessionId_fkey" FOREIGN KEY ("interviewSessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1864
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LidarScan_inspectionId_fkey'
  ) THEN
    ALTER TABLE "LidarScan" ADD CONSTRAINT "LidarScan_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1867
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FloorPlan_scanId_fkey'
  ) THEN
    ALTER TABLE "FloorPlan" ADD CONSTRAINT "FloorPlan_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "LidarScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1870
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'VoiceNote_inspectionId_fkey'
  ) THEN
    ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1873
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'VoiceTranscript_voiceNoteId_fkey'
  ) THEN
    ALTER TABLE "VoiceTranscript" ADD CONSTRAINT "VoiceTranscript_voiceNoteId_fkey" FOREIGN KEY ("voiceNoteId") REFERENCES "VoiceNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1876
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PropertyLookup_inspectionId_fkey'
  ) THEN
    ALTER TABLE "PropertyLookup" ADD CONSTRAINT "PropertyLookup_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1879
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CancellationFeedback_userId_fkey'
  ) THEN
    ALTER TABLE "CancellationFeedback" ADD CONSTRAINT "CancellationFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1882
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ScopeTemplate_userId_fkey'
  ) THEN
    ALTER TABLE "ScopeTemplate" ADD CONSTRAINT "ScopeTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1885
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SupportTicket_userId_fkey'
  ) THEN
    ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1888
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HistoricalJob_tenantId_fkey'
  ) THEN
    ALTER TABLE "HistoricalJob" ADD CONSTRAINT "HistoricalJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1891
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LiveTeacherSession_inspectionId_fkey'
  ) THEN
    ALTER TABLE "LiveTeacherSession" ADD CONSTRAINT "LiveTeacherSession_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1894
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TeacherUtterance_sessionId_fkey'
  ) THEN
    ALTER TABLE "TeacherUtterance" ADD CONSTRAINT "TeacherUtterance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveTeacherSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1897
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TeacherToolCall_sessionId_fkey'
  ) THEN
    ALTER TABLE "TeacherToolCall" ADD CONSTRAINT "TeacherToolCall_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveTeacherSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1900
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MakeSafeAction_inspectionId_fkey'
  ) THEN
    ALTER TABLE "MakeSafeAction" ADD CONSTRAINT "MakeSafeAction_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1903
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ScopeVariation_inspectionId_fkey'
  ) THEN
    ALTER TABLE "ScopeVariation" ADD CONSTRAINT "ScopeVariation_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1906
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SwmsDraft_inspectionId_fkey'
  ) THEN
    ALTER TABLE "SwmsDraft" ADD CONSTRAINT "SwmsDraft_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1909
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Authorisation_inspectionId_fkey'
  ) THEN
    ALTER TABLE "Authorisation" ADD CONSTRAINT "Authorisation_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1912
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DeviceSigningKey_userId_fkey'
  ) THEN
    ALTER TABLE "DeviceSigningKey" ADD CONSTRAINT "DeviceSigningKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (filtered) -- AddForeignKey L1915
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ActivationEvent_userId_fkey'
  ) THEN
    ALTER TABLE "ActivationEvent" ADD CONSTRAINT "ActivationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
