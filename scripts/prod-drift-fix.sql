-- CreateEnum
CREATE TYPE "AuthorisationSource" AS ENUM ('INSURER_EMAIL', 'CUSTOMER_SIGNATURE', 'INTERNAL_MANAGER', 'ADJUSTER_APPROVAL', 'CARRIER_EMAIL', 'CARRIER_PORTAL', 'DOCUSIGN', 'PHONE_THEN_EMAIL_FOLLOWUP', 'EMERGENCY_SELF');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstimateStatus" ADD VALUE 'SENT';
ALTER TYPE "EstimateStatus" ADD VALUE 'REJECTED';
ALTER TYPE "EstimateStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "EstimateStatus" ADD VALUE 'WITHDRAWN';

-- AlterEnum
BEGIN;
CREATE TYPE "FormAuditAction_new" AS ENUM ('CREATED', 'FIELD_UPDATED', 'SAVED', 'SUBMITTED', 'SIGNATURE_ADDED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED', 'STATUS_CHANGED', 'CANCELLED', 'REOPENED');
ALTER TABLE "FormAuditLog" ALTER COLUMN "action" TYPE "FormAuditAction_new" USING ("action"::text::"FormAuditAction_new");
ALTER TYPE "FormAuditAction" RENAME TO "FormAuditAction_old";
ALTER TYPE "FormAuditAction_new" RENAME TO "FormAuditAction";
DROP TYPE "public"."FormAuditAction_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "FormCategory_new" AS ENUM ('SAFETY', 'COMPLIANCE', 'CLIENT_INTAKE', 'JOB_DOCUMENTATION', 'INSURANCE', 'QUALITY_CONTROL', 'CUSTOM');
ALTER TABLE "FormTemplate" ALTER COLUMN "category" TYPE "FormCategory_new" USING ("category"::text::"FormCategory_new");
ALTER TYPE "FormCategory" RENAME TO "FormCategory_old";
ALTER TYPE "FormCategory_new" RENAME TO "FormCategory";
DROP TYPE "public"."FormCategory_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "FormSubmissionStatus_new" AS ENUM ('DRAFT', 'IN_PROGRESS', 'AWAITING_SIGNATURE', 'COMPLETED', 'CANCELLED', 'EXPIRED');
ALTER TABLE "FormSubmission" ALTER COLUMN "status" TYPE "FormSubmissionStatus_new" USING ("status"::text::"FormSubmissionStatus_new");
ALTER TYPE "FormSubmissionStatus" RENAME TO "FormSubmissionStatus_old";
ALTER TYPE "FormSubmissionStatus_new" RENAME TO "FormSubmissionStatus";
DROP TYPE "public"."FormSubmissionStatus_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "FormTemplateStatus_new" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED', 'DEPRECATED');
ALTER TABLE "FormTemplate" ALTER COLUMN "status" TYPE "FormTemplateStatus_new" USING ("status"::text::"FormTemplateStatus_new");
ALTER TYPE "FormTemplateStatus" RENAME TO "FormTemplateStatus_old";
ALTER TYPE "FormTemplateStatus_new" RENAME TO "FormTemplateStatus";
DROP TYPE "public"."FormTemplateStatus_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "FormType_new" AS ENUM ('WORK_ORDER', 'AUTHORITY_TO_COMMENCE', 'JSA', 'SDS', 'SWIMS', 'SITE_INDUCTION', 'CUSTOM');
ALTER TABLE "FormTemplate" ALTER COLUMN "formType" TYPE "FormType_new" USING ("formType"::text::"FormType_new");
ALTER TYPE "FormType" RENAME TO "FormType_old";
ALTER TYPE "FormType_new" RENAME TO "FormType";
DROP TYPE "public"."FormType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "InterviewStatus_new" AS ENUM ('STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED');
ALTER TABLE "InterviewSession" ALTER COLUMN "status" TYPE "InterviewStatus_new" USING ("status"::text::"InterviewStatus_new");
ALTER TYPE "InterviewStatus" RENAME TO "InterviewStatus_old";
ALTER TYPE "InterviewStatus_new" RENAME TO "InterviewStatus";
DROP TYPE "public"."InterviewStatus_old";
COMMIT;

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'EXTERNAL';

-- AlterEnum
BEGIN;
CREATE TYPE "QuestionType_new" AS ENUM ('YES_NO', 'MULTIPLE_CHOICE', 'TEXT', 'NUMERIC', 'MEASUREMENT', 'LOCATION', 'MULTISELECT', 'CHECKBOX');
ALTER TABLE "InterviewQuestion" ALTER COLUMN "type" TYPE "QuestionType_new" USING ("type"::text::"QuestionType_new");
ALTER TABLE "InterviewResponse" ALTER COLUMN "answerType" TYPE "QuestionType_new" USING ("answerType"::text::"QuestionType_new");
ALTER TYPE "QuestionType" RENAME TO "QuestionType_old";
ALTER TYPE "QuestionType_new" RENAME TO "QuestionType";
DROP TYPE "public"."QuestionType_old";
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SignatoryRole" ADD VALUE 'PROPERTY_OWNER';
ALTER TYPE "SignatoryRole" ADD VALUE 'CONTRACTOR';

-- AlterEnum
BEGIN;
CREATE TYPE "SignatureType_new" AS ENUM ('DIGITAL_CANVAS', 'ELECTRONIC_TYPED', 'ESIGNATURE_WORKFLOW', 'BIOMETRIC');
ALTER TABLE "FormSignature" ALTER COLUMN "signatureType" TYPE "SignatureType_new" USING ("signatureType"::text::"SignatureType_new");
ALTER TYPE "SignatureType" RENAME TO "SignatureType_old";
ALTER TYPE "SignatureType_new" RENAME TO "SignatureType";
DROP TYPE "public"."SignatureType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "auth"."identities" DROP CONSTRAINT "identities_user_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."mfa_amr_claims" DROP CONSTRAINT "mfa_amr_claims_session_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."mfa_challenges" DROP CONSTRAINT "mfa_challenges_auth_factor_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."mfa_factors" DROP CONSTRAINT "mfa_factors_user_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."oauth_authorizations" DROP CONSTRAINT "oauth_authorizations_client_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."oauth_authorizations" DROP CONSTRAINT "oauth_authorizations_user_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."oauth_consents" DROP CONSTRAINT "oauth_consents_client_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."oauth_consents" DROP CONSTRAINT "oauth_consents_user_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."one_time_tokens" DROP CONSTRAINT "one_time_tokens_user_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."refresh_tokens" DROP CONSTRAINT "refresh_tokens_session_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."saml_providers" DROP CONSTRAINT "saml_providers_sso_provider_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."saml_relay_states" DROP CONSTRAINT "saml_relay_states_flow_state_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."saml_relay_states" DROP CONSTRAINT "saml_relay_states_sso_provider_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."sessions" DROP CONSTRAINT "sessions_oauth_client_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."sso_domains" DROP CONSTRAINT "sso_domains_sso_provider_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."webauthn_challenges" DROP CONSTRAINT "webauthn_challenges_user_id_fkey";

-- DropForeignKey
ALTER TABLE "auth"."webauthn_credentials" DROP CONSTRAINT "webauthn_credentials_user_id_fkey";

-- DropForeignKey
ALTER TABLE "AffectedArea" DROP CONSTRAINT "AffectedArea_roomId_fkey";

-- DropForeignKey
ALTER TABLE "ClientInvite" DROP CONSTRAINT "ClientInvite_createdByUserId_fkey";

-- DropForeignKey
ALTER TABLE "ClientInvite" DROP CONSTRAINT "ClientInvite_inspectionId_fkey";

-- DropForeignKey
ALTER TABLE "CustodyEvent" DROP CONSTRAINT "CustodyEvent_evidenceItemId_fkey";

-- DropForeignKey
ALTER TABLE "EquipmentDeployment" DROP CONSTRAINT "EquipmentDeployment_reportId_fkey";

-- DropForeignKey
ALTER TABLE "EquipmentDeployment" DROP CONSTRAINT "EquipmentDeployment_userId_fkey";

-- DropForeignKey
ALTER TABLE "EvaluationRun" DROP CONSTRAINT "EvaluationRun_promptVariantId_fkey";

-- DropForeignKey
ALTER TABLE "InspectionPhoto" DROP CONSTRAINT "InspectionPhoto_roomId_fkey";

-- DropForeignKey
ALTER TABLE "MediaAsset" DROP CONSTRAINT "MediaAsset_evidenceId_fkey";

-- DropForeignKey
ALTER TABLE "MediaAssetTag" DROP CONSTRAINT "MediaAssetTag_evidenceId_fkey";

-- DropForeignKey
ALTER TABLE "MediaAssetTag" DROP CONSTRAINT "MediaAssetTag_inspectionId_fkey";

-- DropForeignKey
ALTER TABLE "MobileInspection" DROP CONSTRAINT "MobileInspection_nirInspectionId_fkey";

-- DropForeignKey
ALTER TABLE "MobileInspection" DROP CONSTRAINT "MobileInspection_reportId_fkey";

-- DropForeignKey
ALTER TABLE "MobileInspection" DROP CONSTRAINT "MobileInspection_userId_fkey";

-- DropForeignKey
ALTER TABLE "MoistureMeter" DROP CONSTRAINT "MoistureMeter_userId_fkey";

-- DropForeignKey
ALTER TABLE "MoistureReading" DROP CONSTRAINT "MoistureReading_meterId_fkey";

-- DropForeignKey
ALTER TABLE "MoistureReading" DROP CONSTRAINT "MoistureReading_roomId_fkey";

-- DropForeignKey
ALTER TABLE "PromptVariant" DROP CONSTRAINT "PromptVariant_parentVariantId_fkey";

-- DropForeignKey
ALTER TABLE "PushToken" DROP CONSTRAINT "PushToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "Room" DROP CONSTRAINT "Room_inspectionId_fkey";

-- DropForeignKey
ALTER TABLE "RoomAnnotation" DROP CONSTRAINT "RoomAnnotation_roomId_fkey";

-- DropForeignKey
ALTER TABLE "ScopeItem" DROP CONSTRAINT "ScopeItem_roomId_fkey";

-- DropForeignKey
ALTER TABLE "XeroAccountCodeMapping" DROP CONSTRAINT "XeroAccountCodeMapping_userId_fkey";

-- DropForeignKey
ALTER TABLE "customers" DROP CONSTRAINT "customers_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_order_id_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "profiles" DROP CONSTRAINT "profiles_id_fkey";

-- DropForeignKey
ALTER TABLE "quote_items" DROP CONSTRAINT "quote_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "quote_items" DROP CONSTRAINT "quote_items_quote_id_fkey";

-- DropForeignKey
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_organization_id_fkey";

-- DropIndex
DROP INDEX "AuditLog_inspectionId_timestamp_idx";

-- DropIndex
DROP INDEX "CostDatabase_itemType_region_idx";

-- DropIndex
DROP INDEX "EnvironmentalData_inspectionId_key";

-- DropIndex
DROP INDEX "EnvironmentalData_mobileLocalId_idx";

-- DropIndex
DROP INDEX "EvidenceItem_status_idx";

-- DropIndex
DROP INDEX "HistoricalJob_postcode_idx";

-- DropIndex
DROP INDEX "HistoricalJob_tenantId_claimType_idx";

-- DropIndex
DROP INDEX "HistoricalJob_tenantId_source_externalId_key";

-- DropIndex
DROP INDEX "idx_historical_job_embedding";

-- DropIndex
DROP INDEX "IicrcChunk_embedding_idx";

-- DropIndex
DROP INDEX "IicrcChunk_standard_idx";

-- DropIndex
DROP INDEX "Inspection_userId_createdAt_idx";

-- DropIndex
DROP INDEX "InspectionPhoto_inspectionId_timestamp_idx";

-- DropIndex
DROP INDEX "InspectionPhoto_labelledBy_idx";

-- DropIndex
DROP INDEX "InspectionPhoto_mobileLocalId_idx";

-- DropIndex
DROP INDEX "MediaAssetTag_category_value_idx";

-- DropIndex
DROP INDEX "MediaAssetTag_workspaceId_idx";

-- DropIndex
DROP INDEX "MoistureReading_inspectionId_recordedAt_idx";

-- DropIndex
DROP INDEX "MoistureReading_meterId_idx";

-- DropIndex
DROP INDEX "MoistureReading_mobileLocalId_idx";

-- DropIndex
DROP INDEX "User_hasPremiumInspectionReports_idx";

-- DropIndex
DROP INDEX "XeroAccountCodeMapping_userId_category_damageType_key";

-- DropIndex
DROP INDEX "XeroAccountCodeMapping_userId_idx";

-- AlterTable
ALTER TABLE "AffectedArea" DROP COLUMN "roomId";

-- AlterTable
ALTER TABLE "AppRelease" ADD COLUMN     "githubDeliveryId" TEXT;

-- AlterTable
ALTER TABLE "AscoraIntegration" ADD COLUMN     "lastWebhookAt" TIMESTAMP(3),
ADD COLUMN     "webhookSecret" TEXT,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AscoraJob" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AscoraLineItem" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AscoraNote" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ClaimProgress" ADD COLUMN     "managerReviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "managerReviewRequiredAt" TIMESTAMP(3),
ADD COLUMN     "managerReviewedAt" TIMESTAMP(3),
ADD COLUMN     "managerReviewedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CompanyPricingConfig" DROP COLUMN "electricityRatePer24h";

-- AlterTable
ALTER TABLE "DrNrpgIntegration" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DrNrpgJobSync" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DrNrpgWebhookLog" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DryingGoalRecord" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "iicrcReference" SET DEFAULT 'IICRC S500:2021 §11.4',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EnvironmentalData" DROP COLUMN "emc",
DROP COLUMN "gpp",
DROP COLUMN "grainsPerPound",
DROP COLUMN "location",
DROP COLUMN "metadata",
DROP COLUMN "mobileLocalId",
DROP COLUMN "timestamp",
DROP COLUMN "vaporPressure";

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "metadata" TEXT;

-- AlterTable
ALTER TABLE "EstimateLineItem" DROP COLUMN "isPassThrough",
DROP COLUMN "taxType",
DROP COLUMN "xeroAccountCode",
ADD COLUMN     "sourceCostItemId" TEXT;

-- AlterTable
ALTER TABLE "HistoricalJob" DROP COLUMN "claimNumber",
DROP COLUMN "classificationSource",
DROP COLUMN "customFields",
DROP COLUMN "durationDays",
DROP COLUMN "embeddedAt",
DROP COLUMN "embeddingModel",
DROP COLUMN "embeddingVector",
DROP COLUMN "equipmentCount",
DROP COLUMN "insurerName",
DROP COLUMN "itemCount",
DROP COLUMN "photoCount",
DROP COLUMN "rawJson",
DROP COLUMN "scopeOfWorks",
DROP COLUMN "totalLabourHours",
ALTER COLUMN "source" DROP DEFAULT,
ALTER COLUMN "waterCategory" SET DATA TYPE TEXT,
ALTER COLUMN "waterClass" SET DATA TYPE TEXT,
ALTER COLUMN "address" DROP NOT NULL;

-- AlterTable
ALTER TABLE "IicrcChunk" ALTER COLUMN "edition" DROP DEFAULT,
ALTER COLUMN "heading" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Inspection" DROP COLUMN "signatureUrl",
DROP COLUMN "signedAt",
DROP COLUMN "signedByName",
ALTER COLUMN "propertyDataFetchedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InspectionPhoto" DROP COLUMN "height",
DROP COLUMN "latitude",
DROP COLUMN "longitude",
DROP COLUMN "metadata",
DROP COLUMN "mobileLocalId",
DROP COLUMN "roomId",
DROP COLUMN "width",
ADD COLUMN     "aiConfidence" DOUBLE PRECISION,
ADD COLUMN     "aiLabels" JSONB,
ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "aiRunAt" TIMESTAMP(3),
ALTER COLUMN "affectedMaterial" DROP DEFAULT,
ALTER COLUMN "secondaryDamageIndicators" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "clientNameSnapshot" VARCHAR(256),
ADD COLUMN     "estimateRefSnapshot" VARCHAR(128),
ADD COLUMN     "reportAddressSnapshot" VARCHAR(512),
ADD COLUMN     "reportTitleSnapshot" VARCHAR(256);

-- AlterTable
ALTER TABLE "InvoiceLineItem" DROP COLUMN "code",
DROP COLUMN "isPassThrough",
DROP COLUMN "taxType",
DROP COLUMN "unit";

-- AlterTable
ALTER TABLE "MediaAssetTag" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MoistureReading" DROP COLUMN "ambientRH",
DROP COLUMN "ambientTempC",
DROP COLUMN "calibrationDate",
DROP COLUMN "emcTarget",
DROP COLUMN "latitude",
DROP COLUMN "longitude",
DROP COLUMN "materialType",
DROP COLUMN "metadata",
DROP COLUMN "meterId",
DROP COLUMN "meterSerial",
DROP COLUMN "meterType",
DROP COLUMN "mobileLocalId",
DROP COLUMN "recordedBy",
DROP COLUMN "roomId",
DROP COLUMN "timestamp",
ADD COLUMN     "affectedArea" TEXT,
ADD COLUMN     "deviceModel" TEXT,
ADD COLUMN     "deviceVendor" TEXT,
ADD COLUMN     "isBaseline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isMonitoringPoint" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT DEFAULT 'manual',
ALTER COLUMN "unit" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'AU';

-- AlterTable
ALTER TABLE "PropertyLookup" ALTER COLUMN "lookupDate" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Report" DROP COLUMN "businessProfileId",
ADD COLUMN     "aiSynopsis" TEXT,
ADD COLUMN     "aiSynopsisAt" TIMESTAMP(3),
ADD COLUMN     "clientSummaryCache" TEXT,
ADD COLUMN     "clientSummaryCachedAt" TIMESTAMP(3),
ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ScopeItem" DROP COLUMN "rateSource",
DROP COLUMN "roomId",
DROP COLUMN "suggestedRate",
DROP COLUMN "xeroAccountCode",
ADD COLUMN     "clauseRef" TEXT;

-- AlterTable
ALTER TABLE "ScopePricingDatabase" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "claimTypes" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "activeBusinessProfileId",
DROP COLUMN "experienceMode",
DROP COLUMN "inspectionLayout",
DROP COLUMN "interviewTier",
ADD COLUMN     "interviewTier" "SubscriptionTierLevel" NOT NULL DEFAULT 'STANDARD',
ALTER COLUMN "quickFillCreditsRemaining" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN     "externalEventId" TEXT;

-- AlterTable
ALTER TABLE "XeroAccountCodeMapping" DROP COLUMN "damageType",
DROP COLUMN "userId",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "integrationId" TEXT NOT NULL,
ALTER COLUMN "category" DROP NOT NULL;

-- DropTable
DROP TABLE "auth"."audit_log_entries";

-- DropTable
DROP TABLE "auth"."custom_oauth_providers";

-- DropTable
DROP TABLE "auth"."flow_state";

-- DropTable
DROP TABLE "auth"."identities";

-- DropTable
DROP TABLE "auth"."instances";

-- DropTable
DROP TABLE "auth"."mfa_amr_claims";

-- DropTable
DROP TABLE "auth"."mfa_challenges";

-- DropTable
DROP TABLE "auth"."mfa_factors";

-- DropTable
DROP TABLE "auth"."oauth_authorizations";

-- DropTable
DROP TABLE "auth"."oauth_client_states";

-- DropTable
DROP TABLE "auth"."oauth_clients";

-- DropTable
DROP TABLE "auth"."oauth_consents";

-- DropTable
DROP TABLE "auth"."one_time_tokens";

-- DropTable
DROP TABLE "auth"."refresh_tokens";

-- DropTable
DROP TABLE "auth"."saml_providers";

-- DropTable
DROP TABLE "auth"."saml_relay_states";

-- DropTable
DROP TABLE "auth"."schema_migrations";

-- DropTable
DROP TABLE "auth"."sessions";

-- DropTable
DROP TABLE "auth"."sso_domains";

-- DropTable
DROP TABLE "auth"."sso_providers";

-- DropTable
DROP TABLE "auth"."users";

-- DropTable
DROP TABLE "auth"."webauthn_challenges";

-- DropTable
DROP TABLE "auth"."webauthn_credentials";

-- DropTable
DROP TABLE "BusinessProfile";

-- DropTable
DROP TABLE "ClientInvite";

-- DropTable
DROP TABLE "CustodyEvent";

-- DropTable
DROP TABLE "EquipmentDeployment";

-- DropTable
DROP TABLE "EvaluationRun";

-- DropTable
DROP TABLE "MobileInspection";

-- DropTable
DROP TABLE "MoistureMeter";

-- DropTable
DROP TABLE "PromptVariant";

-- DropTable
DROP TABLE "PushToken";

-- DropTable
DROP TABLE "Room";

-- DropTable
DROP TABLE "RoomAnnotation";

-- DropTable
DROP TABLE "customers";

-- DropTable
DROP TABLE "order_items";

-- DropTable
DROP TABLE "orders";

-- DropTable
DROP TABLE "organizations";

-- DropTable
DROP TABLE "products";

-- DropTable
DROP TABLE "profiles";

-- DropTable
DROP TABLE "quote_items";

-- DropTable
DROP TABLE "quotes";

-- DropTable
DROP TABLE "users";

-- DropEnum
DROP TYPE "auth"."aal_level";

-- DropEnum
DROP TYPE "auth"."code_challenge_method";

-- DropEnum
DROP TYPE "auth"."factor_status";

-- DropEnum
DROP TYPE "auth"."factor_type";

-- DropEnum
DROP TYPE "auth"."oauth_authorization_status";

-- DropEnum
DROP TYPE "auth"."oauth_client_type";

-- DropEnum
DROP TYPE "auth"."oauth_registration_type";

-- DropEnum
DROP TYPE "auth"."oauth_response_type";

-- DropEnum
DROP TYPE "auth"."one_time_token_type";

-- DropEnum
DROP TYPE "ActivityType";

-- DropEnum
DROP TYPE "AnnotationType";

-- DropEnum
DROP TYPE "CompanyLifecycleStage";

-- DropEnum
DROP TYPE "CompanySize";

-- DropEnum
DROP TYPE "CompanyStatus";

-- DropEnum
DROP TYPE "ContactLifecycleStage";

-- DropEnum
DROP TYPE "ContactMethod";

-- DropEnum
DROP TYPE "ContactStatus";

-- DropEnum
DROP TYPE "CrmTaskStatus";

-- DropEnum
DROP TYPE "CustodyAction";

-- DropEnum
DROP TYPE "EvidenceStatus";

-- DropEnum
DROP TYPE "ExperienceMode";

-- DropEnum
DROP TYPE "InspectionLayout";

-- DropEnum
DROP TYPE "MediaType";

-- DropEnum
DROP TYPE "OpportunityStage";

-- DropEnum
DROP TYPE "RoomType";

-- DropEnum
DROP TYPE "TaskPriority";

-- CreateTable
CREATE TABLE "WHSIncident" (
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

-- CreateTable
CREATE TABLE "WHSCorrectiveAction" (
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

-- CreateTable
CREATE TABLE "AdminImpersonation" (
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
    "workspaceId" TEXT,

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
CREATE TABLE "SubscriptionTier" (
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

-- CreateTable
CREATE TABLE "InterviewQuestion" (
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

-- CreateTable
CREATE TABLE "InterviewSession" (
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

-- CreateTable
CREATE TABLE "InterviewResponse" (
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

-- CreateTable
CREATE TABLE "InterviewStandardsMapping" (
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
CREATE TABLE "CancellationFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "subscriptionPlan" TEXT,
    "tenureDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancellationFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthStateNonce" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthStateNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeTemplate" (
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

-- CreateTable
CREATE TABLE "SupportTicket" (
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

-- CreateTable
CREATE TABLE "BrandAmbassadorPost" (
    "id" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "draft" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandAmbassadorPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSyncJob" (
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

-- CreateTable
CREATE TABLE "LiveTeacherSession" (
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

-- CreateTable
CREATE TABLE "TeacherUtterance" (
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

-- CreateTable
CREATE TABLE "TeacherToolCall" (
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

-- CreateTable
CREATE TABLE "StandardsChunk" (
    "id" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "clause" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,

    CONSTRAINT "StandardsChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MakeSafeAction" (
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

-- CreateTable
CREATE TABLE "ScopeVariation" (
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

-- CreateTable
CREATE TABLE "SwmsDraft" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SwmsDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Authorisation" (
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

-- CreateTable
CREATE TABLE "DeviceSigningKey" (
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

-- CreateTable
CREATE TABLE "ActivationEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "properties" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WHSIncident_inspectionId_idx" ON "WHSIncident"("inspectionId");

-- CreateIndex
CREATE INDEX "WHSIncident_userId_createdAt_idx" ON "WHSIncident"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WHSIncident_incidentType_severity_idx" ON "WHSIncident"("incidentType", "severity");

-- CreateIndex
CREATE INDEX "WHSIncident_status_idx" ON "WHSIncident"("status");

-- CreateIndex
CREATE INDEX "WHSCorrectiveAction_incidentId_idx" ON "WHSCorrectiveAction"("incidentId");

-- CreateIndex
CREATE INDEX "WHSCorrectiveAction_assignedTo_completed_idx" ON "WHSCorrectiveAction"("assignedTo", "completed");

-- CreateIndex
CREATE UNIQUE INDEX "AdminImpersonation_tokenId_key" ON "AdminImpersonation"("tokenId");

-- CreateIndex
CREATE INDEX "AdminImpersonation_adminUserId_startedAt_idx" ON "AdminImpersonation"("adminUserId", "startedAt");

-- CreateIndex
CREATE INDEX "AdminImpersonation_targetUserId_startedAt_idx" ON "AdminImpersonation"("targetUserId", "startedAt");

-- CreateIndex
CREATE INDEX "AdminImpersonation_expiresAt_idx" ON "AdminImpersonation"("expiresAt");

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
CREATE INDEX "UsageEvent_timestamp_idx" ON "UsageEvent"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "EmailConnection_userId_key" ON "EmailConnection"("userId");

-- CreateIndex
CREATE INDEX "EmailConnection_userId_idx" ON "EmailConnection"("userId");

-- CreateIndex
CREATE INDEX "EmailConnection_provider_idx" ON "EmailConnection"("provider");

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
CREATE INDEX "FormTemplate_workspaceId_idx" ON "FormTemplate"("workspaceId");

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
CREATE INDEX "SubscriptionTier_tierName_idx" ON "SubscriptionTier"("tierName");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionTier_tierName_key" ON "SubscriptionTier"("tierName");

-- CreateIndex
CREATE INDEX "InterviewQuestion_sequenceNumber_idx" ON "InterviewQuestion"("sequenceNumber");

-- CreateIndex
CREATE INDEX "InterviewQuestion_minTierLevel_idx" ON "InterviewQuestion"("minTierLevel");

-- CreateIndex
CREATE INDEX "InterviewQuestion_isActive_idx" ON "InterviewQuestion"("isActive");

-- CreateIndex
CREATE INDEX "InterviewSession_userId_idx" ON "InterviewSession"("userId");

-- CreateIndex
CREATE INDEX "InterviewSession_status_idx" ON "InterviewSession"("status");

-- CreateIndex
CREATE INDEX "InterviewSession_createdAt_idx" ON "InterviewSession"("createdAt");

-- CreateIndex
CREATE INDEX "InterviewSession_formTemplateId_idx" ON "InterviewSession"("formTemplateId");

-- CreateIndex
CREATE INDEX "InterviewSession_reportId_idx" ON "InterviewSession"("reportId");

-- CreateIndex
CREATE INDEX "InterviewResponse_interviewSessionId_idx" ON "InterviewResponse"("interviewSessionId");

-- CreateIndex
CREATE INDEX "InterviewResponse_questionId_idx" ON "InterviewResponse"("questionId");

-- CreateIndex
CREATE INDEX "InterviewStandardsMapping_interviewSessionId_idx" ON "InterviewStandardsMapping"("interviewSessionId");

-- CreateIndex
CREATE INDEX "InterviewStandardsMapping_standardCode_idx" ON "InterviewStandardsMapping"("standardCode");

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
CREATE INDEX "CancellationFeedback_userId_idx" ON "CancellationFeedback"("userId");

-- CreateIndex
CREATE INDEX "CancellationFeedback_reason_idx" ON "CancellationFeedback"("reason");

-- CreateIndex
CREATE INDEX "CancellationFeedback_createdAt_idx" ON "CancellationFeedback"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthStateNonce_nonce_key" ON "OAuthStateNonce"("nonce");

-- CreateIndex
CREATE INDEX "OAuthStateNonce_expiresAt_idx" ON "OAuthStateNonce"("expiresAt");

-- CreateIndex
CREATE INDEX "OAuthStateNonce_userId_provider_idx" ON "OAuthStateNonce"("userId", "provider");

-- CreateIndex
CREATE INDEX "ScopeTemplate_userId_idx" ON "ScopeTemplate"("userId");

-- CreateIndex
CREATE INDEX "ScopeTemplate_claimType_idx" ON "ScopeTemplate"("claimType");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "SupportTicket_email_idx" ON "SupportTicket"("email");

-- CreateIndex
CREATE INDEX "BrandAmbassadorPost_projectKey_idx" ON "BrandAmbassadorPost"("projectKey");

-- CreateIndex
CREATE INDEX "BrandAmbassadorPost_year_isoWeek_idx" ON "BrandAmbassadorPost"("year", "isoWeek");

-- CreateIndex
CREATE UNIQUE INDEX "BrandAmbassadorPost_projectKey_isoWeek_year_key" ON "BrandAmbassadorPost"("projectKey", "isoWeek", "year");

-- CreateIndex
CREATE INDEX "InvoiceSyncJob_status_priority_createdAt_idx" ON "InvoiceSyncJob"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceSyncJob_invoiceId_idx" ON "InvoiceSyncJob"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSyncJob_invoiceId_provider_key" ON "InvoiceSyncJob"("invoiceId", "provider");

-- CreateIndex
CREATE INDEX "LiveTeacherSession_inspectionId_idx" ON "LiveTeacherSession"("inspectionId");

-- CreateIndex
CREATE INDEX "LiveTeacherSession_userId_startedAt_idx" ON "LiveTeacherSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "TeacherUtterance_sessionId_turnIndex_idx" ON "TeacherUtterance"("sessionId", "turnIndex");

-- CreateIndex
CREATE INDEX "TeacherToolCall_sessionId_idx" ON "TeacherToolCall"("sessionId");

-- CreateIndex
CREATE INDEX "TeacherToolCall_toolName_idx" ON "TeacherToolCall"("toolName");

-- CreateIndex
CREATE INDEX "StandardsChunk_standard_jurisdiction_idx" ON "StandardsChunk"("standard", "jurisdiction");

-- CreateIndex
CREATE UNIQUE INDEX "StandardsChunk_standard_edition_clause_key" ON "StandardsChunk"("standard", "edition", "clause");

-- CreateIndex
CREATE INDEX "MakeSafeAction_inspectionId_idx" ON "MakeSafeAction"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "MakeSafeAction_inspectionId_action_key" ON "MakeSafeAction"("inspectionId", "action");

-- CreateIndex
CREATE INDEX "ScopeVariation_inspectionId_createdAt_idx" ON "ScopeVariation"("inspectionId", "createdAt");

-- CreateIndex
CREATE INDEX "ScopeVariation_status_idx" ON "ScopeVariation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SwmsDraft_inspectionId_key" ON "SwmsDraft"("inspectionId");

-- CreateIndex
CREATE INDEX "SwmsDraft_inspectionId_idx" ON "SwmsDraft"("inspectionId");

-- CreateIndex
CREATE INDEX "Authorisation_inspectionId_idx" ON "Authorisation"("inspectionId");

-- CreateIndex
CREATE INDEX "Authorisation_userId_idx" ON "Authorisation"("userId");

-- CreateIndex
CREATE INDEX "Authorisation_subjectContractorId_idx" ON "Authorisation"("subjectContractorId");

-- CreateIndex
CREATE INDEX "Authorisation_status_idx" ON "Authorisation"("status");

-- CreateIndex
CREATE INDEX "Authorisation_expiresAt_idx" ON "Authorisation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSigningKey_publicKeyId_key" ON "DeviceSigningKey"("publicKeyId");

-- CreateIndex
CREATE INDEX "DeviceSigningKey_userId_idx" ON "DeviceSigningKey"("userId");

-- CreateIndex
CREATE INDEX "DeviceSigningKey_publicKeyId_idx" ON "DeviceSigningKey"("publicKeyId");

-- CreateIndex
CREATE INDEX "DeviceSigningKey_revokedAt_idx" ON "DeviceSigningKey"("revokedAt");

-- CreateIndex
CREATE INDEX "ActivationEvent_userId_eventName_idx" ON "ActivationEvent"("userId", "eventName");

-- CreateIndex
CREATE INDEX "ActivationEvent_createdAt_idx" ON "ActivationEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppRelease_githubDeliveryId_key" ON "AppRelease"("githubDeliveryId");

-- CreateIndex
CREATE INDEX "AuditLog_inspectionId_timestamp_idx" ON "AuditLog"("inspectionId", "timestamp");

-- CreateIndex
CREATE INDEX "CostLibrary_userId_idx" ON "CostLibrary"("userId");

-- CreateIndex
CREATE INDEX "EnvironmentalData_inspectionId_idx" ON "EnvironmentalData"("inspectionId");

-- CreateIndex
CREATE INDEX "EnvironmentalData_inspectionId_recordedAt_idx" ON "EnvironmentalData"("inspectionId", "recordedAt");

-- CreateIndex
CREATE INDEX "EstimateLineItem_sourceCostItemId_idx" ON "EstimateLineItem"("sourceCostItemId");

-- CreateIndex
CREATE INDEX "HistoricalJob_source_idx" ON "HistoricalJob"("source");

-- CreateIndex
CREATE INDEX "HistoricalJob_state_idx" ON "HistoricalJob"("state");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalJob_source_externalId_key" ON "HistoricalJob"("source", "externalId");

-- CreateIndex
CREATE INDEX "Inspection_userId_createdAt_idx" ON "Inspection"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InspectionPhoto_inspectionId_timestamp_idx" ON "InspectionPhoto"("inspectionId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_externalSyncProvider_externalInvoiceId_key" ON "Invoice"("externalSyncProvider", "externalInvoiceId");

-- CreateIndex
CREATE INDEX "MediaAssetTag_inspectionId_idx" ON "MediaAssetTag"("inspectionId");

-- CreateIndex
CREATE INDEX "MoistureReading_inspectionId_recordedAt_idx" ON "MoistureReading"("inspectionId", "recordedAt");

-- CreateIndex
CREATE INDEX "MoistureReading_inspectionId_isBaseline_idx" ON "MoistureReading"("inspectionId", "isBaseline");

-- CreateIndex
CREATE INDEX "MoistureReading_inspectionId_isMonitoringPoint_idx" ON "MoistureReading"("inspectionId", "isMonitoringPoint");

-- CreateIndex
CREATE INDEX "MoistureReading_inspectionId_affectedArea_idx" ON "MoistureReading"("inspectionId", "affectedArea");

-- CreateIndex
CREATE INDEX "PropertyLookup_inspectionId_idx" ON "PropertyLookup"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_externalEventId_key" ON "WebhookEvent"("provider", "externalEventId");

-- CreateIndex
CREATE INDEX "XeroAccountCodeMapping_integrationId_idx" ON "XeroAccountCodeMapping"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "XeroAccountCodeMapping_integrationId_category_key" ON "XeroAccountCodeMapping"("integrationId", "category");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_subscriptionTierId_fkey" FOREIGN KEY ("subscriptionTierId") REFERENCES "SubscriptionTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XeroAccountCodeMapping" ADD CONSTRAINT "XeroAccountCodeMapping_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_sourceCostItemId_fkey" FOREIGN KEY ("sourceCostItemId") REFERENCES "CostItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WHSIncident" ADD CONSTRAINT "WHSIncident_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WHSCorrectiveAction" ADD CONSTRAINT "WHSCorrectiveAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "WHSIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminImpersonation" ADD CONSTRAINT "AdminImpersonation_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminImpersonation" ADD CONSTRAINT "AdminImpersonation_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "EmailAudit" ADD CONSTRAINT "EmailAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAudit" ADD CONSTRAINT "EmailAudit_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_formTemplateId_fkey" FOREIGN KEY ("formTemplateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewResponse" ADD CONSTRAINT "InterviewResponse_interviewSessionId_fkey" FOREIGN KEY ("interviewSessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewStandardsMapping" ADD CONSTRAINT "InterviewStandardsMapping_interviewSessionId_fkey" FOREIGN KEY ("interviewSessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "CancellationFeedback" ADD CONSTRAINT "CancellationFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeTemplate" ADD CONSTRAINT "ScopeTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalJob" ADD CONSTRAINT "HistoricalJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveTeacherSession" ADD CONSTRAINT "LiveTeacherSession_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherUtterance" ADD CONSTRAINT "TeacherUtterance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveTeacherSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherToolCall" ADD CONSTRAINT "TeacherToolCall_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveTeacherSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakeSafeAction" ADD CONSTRAINT "MakeSafeAction_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeVariation" ADD CONSTRAINT "ScopeVariation_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwmsDraft" ADD CONSTRAINT "SwmsDraft_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authorisation" ADD CONSTRAINT "Authorisation_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSigningKey" ADD CONSTRAINT "DeviceSigningKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationEvent" ADD CONSTRAINT "ActivationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "address_postcode_unique" RENAME TO "PropertyLookup_propertyAddress_propertyPostcode_key";

