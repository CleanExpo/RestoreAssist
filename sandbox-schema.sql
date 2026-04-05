-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'MANAGER');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PROSPECT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('SCOPE_OF_WORK', 'COST_ESTIMATE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "CertificationType" AS ENUM ('IICRC_WRT', 'IICRC_AMRT', 'IICRC_FSRT', 'IICRC_CCT', 'TRADE_PLUMBING', 'TRADE_ELECTRICAL', 'TRADE_BUILDING', 'TRADE_CARPENTRY', 'INSURANCE_PUBLIC_LIABILITY', 'INSURANCE_PROFESSIONAL_INDEMNITY', 'INSURANCE_WORKERS_COMP', 'BUSINESS_ABN_REGISTRATION', 'BUSINESS_GST_REGISTRATION', 'OTHER');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'RENEWAL_NEEDED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'DISPUTED', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "ReviewDisputeStatus" AS ENUM ('NONE', 'PENDING_REVIEW', 'UNDER_INVESTIGATION', 'RESOLVED_KEPT', 'RESOLVED_AMENDED', 'RESOLVED_REMOVED');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR', 'SYNCING');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('XERO', 'QUICKBOOKS', 'MYOB', 'SERVICEM8', 'ASCORA');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'CANCELED', 'EXPIRED', 'PAST_DUE');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'APPROVED', 'LOCKED');

-- CreateEnum
CREATE TYPE "AddonPurchaseStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

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

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PROCESSING', 'CLASSIFIED', 'SCOPED', 'ESTIMATED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RegulatoryDocumentType" AS ENUM ('INSURANCE_POLICY', 'INSURANCE_REGULATION', 'BUILDING_CODE_NATIONAL', 'BUILDING_CODE_STATE', 'ELECTRICAL_STANDARD', 'PLUMBING_STANDARD', 'CONSUMER_LAW', 'INDUSTRY_BEST_PRACTICE', 'SAFETY_REGULATION');

-- CreateEnum
CREATE TYPE "UsageEventType" AS ENUM ('PROPERTY_LOOKUP', 'VOICE_TRANSCRIPTION', 'VOICE_AI_INTERACTION', 'LIDAR_SCAN', 'FLOOR_PLAN_GENERATION', 'AI_ASSISTANT_QUERY');

-- CreateEnum
CREATE TYPE "AuthorityFormStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURES', 'PARTIALLY_SIGNED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuthoritySignatoryRole" AS ENUM ('CLIENT', 'INSURER', 'CONTRACTOR', 'ADMIN', 'TECHNICIAN', 'MANAGER', 'PROPERTY_OWNER');

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

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('YES_NO', 'MULTIPLE_CHOICE', 'TEXT', 'NUMERIC', 'MEASUREMENT', 'LOCATION', 'MULTISELECT', 'CHECKBOX');

-- CreateEnum
CREATE TYPE "SubscriptionTierLevel" AS ENUM ('STANDARD', 'PREMIUM', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'PARTIALLY_FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'READY', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'WRITTEN_OFF', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE', 'BANK_TRANSFER', 'CASH', 'CHEQUE', 'CREDIT_CARD', 'PAYPAL', 'EXTERNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'APPLIED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CreditNoteReason" AS ENUM ('CUSTOMER_REFUND', 'PRICING_ERROR', 'DUPLICATE_INVOICE', 'SERVICE_ISSUE', 'GOODWILL', 'OTHER');

-- CreateEnum
CREATE TYPE "RecurringFrequency" AS ENUM ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY');

-- CreateEnum
CREATE TYPE "RecurringInvoiceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceEmailType" AS ENUM ('SENT', 'REMINDER', 'THANK_YOU', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('BEFORE_DUE', 'ON_DUE_DATE', 'OVERDUE_1', 'OVERDUE_2', 'OVERDUE_3');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExternalSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT,
    "managedById" TEXT,
    "subscriptionStatus" "SubscriptionStatus",
    "subscriptionPlan" TEXT,
    "subscriptionId" TEXT,
    "stripeCustomerId" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "subscriptionEndsAt" TIMESTAMP(3),
    "creditsRemaining" INTEGER,
    "totalCreditsUsed" INTEGER,
    "lastBillingDate" TIMESTAMP(3),
    "nextBillingDate" TIMESTAMP(3),
    "addonReports" INTEGER DEFAULT 0,
    "monthlyReportsUsed" INTEGER DEFAULT 0,
    "monthlyResetDate" TIMESTAMP(3),
    "signupBonusApplied" BOOLEAN DEFAULT false,
    "lifetimeAccess" BOOLEAN DEFAULT false,
    "mustChangePassword" BOOLEAN DEFAULT false,
    "hasPremiumInspectionReports" BOOLEAN NOT NULL DEFAULT false,
    "quickFillCreditsRemaining" INTEGER DEFAULT 1,
    "totalQuickFillUsed" INTEGER DEFAULT 0,
    "deepseekApiKey" TEXT,
    "firstRunChecklistDismissedAt" TIMESTAMP(3),
    "businessName" TEXT,
    "businessAddress" TEXT,
    "businessLogo" TEXT,
    "businessABN" TEXT,
    "businessPhone" TEXT,
    "businessEmail" TEXT,
    "monthlyUsageCap" DOUBLE PRECISION,
    "interviewTier" "SubscriptionTierLevel" NOT NULL DEFAULT 'STANDARD',
    "preferredQuestionStyle" TEXT,
    "autoAcceptSuggestionsAboveConfidence" DOUBLE PRECISION,
    "subscriptionTierId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER,
    "whatDoing" TEXT,
    "whatHappened" TEXT,
    "page" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestorationDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "title" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestorationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "company" TEXT,
    "contactPerson" TEXT,
    "notes" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "search_vector" tsvector,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "clientId" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportApproval" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "approvalType" "ApprovalType" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "clientComments" TEXT,
    "amount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicDescription" TEXT,
    "yearsInBusiness" INTEGER,
    "teamSize" INTEGER,
    "insuranceCertificate" TEXT,
    "isPubliclyVisible" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "specializations" TEXT[],
    "servicesOffered" TEXT,
    "averageRating" DOUBLE PRECISION DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "responseRatePercent" DOUBLE PRECISION,
    "averageResponseHours" DOUBLE PRECISION,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "searchKeywords" TEXT[],
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorCertification" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "certificationType" "CertificationType" NOT NULL,
    "certificationName" TEXT NOT NULL,
    "issuingBody" TEXT NOT NULL,
    "certificationNumber" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "verificationNotes" TEXT,
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorServiceArea" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "suburb" TEXT,
    "state" TEXT NOT NULL,
    "radius" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorReview" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "reportId" TEXT,
    "overallRating" INTEGER NOT NULL,
    "qualityRating" INTEGER,
    "timelinessRating" INTEGER,
    "communicationRating" INTEGER,
    "valueRating" INTEGER,
    "reviewTitle" TEXT,
    "reviewText" TEXT NOT NULL,
    "contractorResponse" TEXT,
    "respondedAt" TIMESTAMP(3),
    "disputeStatus" "ReviewDisputeStatus" NOT NULL DEFAULT 'NONE',
    "disputeReason" TEXT,
    "disputeSubmittedAt" TIMESTAMP(3),
    "disputeResolvedAt" TIMESTAMP(3),
    "disputeResolution" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "isVerifiedJob" BOOLEAN NOT NULL DEFAULT false,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "clientName" TEXT NOT NULL,
    "propertyAddress" TEXT NOT NULL,
    "hazardType" TEXT NOT NULL,
    "insuranceType" TEXT NOT NULL,
    "totalCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "assignedManagerId" TEXT,
    "assignedAdminId" TEXT,
    "clientContactDetails" TEXT,
    "propertyPostcode" TEXT,
    "claimReferenceNumber" TEXT,
    "incidentDate" TIMESTAMP(3),
    "technicianAttendanceDate" TIMESTAMP(3),
    "technicianName" TEXT,
    "technicianFieldReport" TEXT,
    "propertyId" TEXT,
    "jobNumber" TEXT,
    "reportInstructions" TEXT,
    "builderDeveloperCompanyName" TEXT,
    "builderDeveloperContact" TEXT,
    "builderDeveloperAddress" TEXT,
    "builderDeveloperPhone" TEXT,
    "ownerManagementContactName" TEXT,
    "ownerManagementPhone" TEXT,
    "ownerManagementEmail" TEXT,
    "lastInspectionDate" TIMESTAMP(3),
    "buildingChangedSinceLastInspection" TEXT,
    "structureChangesSinceLastInspection" TEXT,
    "previousLeakage" TEXT,
    "emergencyRepairPerformed" TEXT,
    "reportDepthLevel" TEXT,
    "reportVersion" INTEGER NOT NULL DEFAULT 1,
    "technicianReportAnalysis" TEXT,
    "tier1Responses" TEXT,
    "tier2Responses" TEXT,
    "tier3Responses" TEXT,
    "scopeOfWorksDocument" TEXT,
    "scopeOfWorksData" TEXT,
    "costEstimationDocument" TEXT,
    "costEstimationData" TEXT,
    "versionHistory" TEXT,
    "lastEditedBy" TEXT,
    "lastEditedAt" TIMESTAMP(3),
    "completenessScore" INTEGER,
    "geographicIntelligence" TEXT,
    "validationWarnings" TEXT,
    "validationErrors" TEXT,
    "reportNumber" TEXT,
    "inspectionDate" TIMESTAMP(3),
    "waterCategory" TEXT,
    "waterClass" TEXT,
    "sourceOfWater" TEXT,
    "affectedArea" DOUBLE PRECISION,
    "safetyHazards" TEXT,
    "equipmentUsed" TEXT,
    "dryingPlan" TEXT,
    "completionDate" TIMESTAMP(3),
    "buildingAge" INTEGER,
    "structureType" TEXT,
    "accessNotes" TEXT,
    "methamphetamineScreen" TEXT,
    "methamphetamineTestCount" INTEGER,
    "biologicalMouldDetected" BOOLEAN NOT NULL DEFAULT false,
    "biologicalMouldCategory" TEXT,
    "phase1StartDate" TIMESTAMP(3),
    "phase1EndDate" TIMESTAMP(3),
    "phase2StartDate" TIMESTAMP(3),
    "phase2EndDate" TIMESTAMP(3),
    "phase3StartDate" TIMESTAMP(3),
    "phase3EndDate" TIMESTAMP(3),
    "insurerName" TEXT,
    "structuralDamage" TEXT,
    "contentsDamage" TEXT,
    "hvacAffected" BOOLEAN NOT NULL DEFAULT false,
    "electricalHazards" TEXT,
    "microbialGrowth" TEXT,
    "dehumidificationCapacity" DOUBLE PRECISION,
    "airmoversCount" INTEGER,
    "targetHumidity" DOUBLE PRECISION,
    "targetTemperature" DOUBLE PRECISION,
    "estimatedDryingTime" INTEGER,
    "psychrometricReadings" TEXT,
    "moistureReadings" TEXT,
    "equipmentPlacement" TEXT,
    "psychrometricAssessment" TEXT,
    "scopeAreas" TEXT,
    "equipmentSelection" TEXT,
    "equipmentCostTotal" DOUBLE PRECISION,
    "estimatedDryingDuration" INTEGER,
    "safetyPlan" TEXT,
    "containmentSetup" TEXT,
    "decontaminationProcedures" TEXT,
    "postRemediationVerification" TEXT,
    "propertyCover" TEXT,
    "contentsCover" TEXT,
    "liabilityCover" TEXT,
    "businessInterruption" TEXT,
    "additionalCover" TEXT,
    "detailedReport" TEXT,
    "excelReportUrl" TEXT,
    "inspectionPdfUrl" TEXT,
    "search_vector" tsvector,
    "includeRegulatoryCitations" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "managedById" TEXT,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "apiKey" TEXT,
    "config" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "tenantId" TEXT,
    "realmId" TEXT,
    "companyId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostLibrary" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CostLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostItem" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "libraryId" TEXT NOT NULL,

    CONSTRAINT "CostItem_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "integrationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "AddonPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addonKey" TEXT NOT NULL,
    "addonName" TEXT NOT NULL,
    "reportLimit" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "status" "AddonPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddonPurchase_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "reportId" TEXT,
    "inspectionNumber" TEXT NOT NULL,
    "propertyAddress" TEXT NOT NULL,
    "propertyPostcode" TEXT NOT NULL,
    "inspectionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "technicianName" TEXT,
    "technicianId" TEXT,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "totalUsageCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "propertyYearBuilt" INTEGER,
    "propertyWallMaterial" TEXT,
    "propertyWallConstruction" TEXT,
    "propertyRoofMaterial" TEXT,
    "propertyFloorType" TEXT,
    "propertyFloorArea" DOUBLE PRECISION,
    "propertyBedrooms" INTEGER,
    "propertyBathrooms" INTEGER,
    "propertyLandArea" DOUBLE PRECISION,
    "propertyStories" INTEGER,
    "propertyDataSource" TEXT,
    "propertyDataFetchedAt" TIMESTAMP(3),
    "floorPlanImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "search_vector" tsvector,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvironmentalData" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "ambientTemperature" DOUBLE PRECISION NOT NULL,
    "humidityLevel" DOUBLE PRECISION NOT NULL,
    "dewPoint" DOUBLE PRECISION,
    "airCirculation" BOOLEAN NOT NULL DEFAULT false,
    "weatherConditions" TEXT,
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "moistureLevel" DOUBLE PRECISION NOT NULL,
    "depth" TEXT NOT NULL,
    "notes" TEXT,
    "photoUrl" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoistureReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffectedArea" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "roomZoneId" TEXT NOT NULL,
    "affectedSquareFootage" DOUBLE PRECISION NOT NULL,
    "waterSource" TEXT NOT NULL,
    "timeSinceLoss" DOUBLE PRECISION,
    "category" TEXT,
    "class" TEXT,
    "description" TEXT,
    "photos" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffectedArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeItem" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "areaId" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "specification" TEXT,
    "autoDetermined" BOOLEAN NOT NULL DEFAULT false,
    "justification" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScopeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEstimate" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "scopeItemId" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "costDatabaseId" TEXT,
    "isEstimated" BOOLEAN NOT NULL DEFAULT true,
    "contingency" DOUBLE PRECISION,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Classification" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "class" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "standardReference" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "inputData" TEXT,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Classification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "userId" TEXT NOT NULL,
    "device" TEXT,
    "gpsLocation" TEXT,
    "changes" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildingCode" (
    "id" TEXT NOT NULL,
    "regulatoryDocumentId" TEXT,
    "state" TEXT NOT NULL,
    "postcode" TEXT,
    "codeVersion" TEXT NOT NULL,
    "moistureThreshold" DOUBLE PRECISION,
    "dryingTimeStandard" TEXT,
    "dehumidificationRequired" BOOLEAN NOT NULL DEFAULT false,
    "certificationRequired" BOOLEAN NOT NULL DEFAULT false,
    "requirements" TEXT,
    "notes" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildingCode_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "CostDatabase" (
    "id" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "minRate" DOUBLE PRECISION NOT NULL,
    "maxRate" DOUBLE PRECISION NOT NULL,
    "averageRate" DOUBLE PRECISION NOT NULL,
    "region" TEXT,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "updateFrequency" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostDatabase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionPhoto" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "location" TEXT,
    "description" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "gpsLatitude" DOUBLE PRECISION,
    "gpsLongitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
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
    "subject" TEXT,
    "htmlBody" TEXT,
    "textBody" TEXT,
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
CREATE TABLE "AuthorityFormTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "formContent" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorityFormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorityFormInstance" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyLogo" TEXT,
    "companyABN" TEXT,
    "companyPhone" TEXT,
    "companyEmail" TEXT,
    "companyWebsite" TEXT,
    "companyAddress" TEXT,
    "clientName" TEXT NOT NULL,
    "clientAddress" TEXT NOT NULL,
    "incidentBrief" TEXT,
    "incidentDate" TIMESTAMP(3),
    "authorityDescription" TEXT NOT NULL,
    "status" "AuthorityFormStatus" NOT NULL DEFAULT 'DRAFT',
    "pdfUrl" TEXT,
    "draftPdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AuthorityFormInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorityFormSignature" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "signatoryName" TEXT NOT NULL,
    "signatoryRole" "AuthoritySignatoryRole" NOT NULL,
    "signatoryEmail" TEXT,
    "signatoryPhone" TEXT,
    "signatureData" TEXT,
    "signatureUrl" TEXT,
    "signatureRequestSent" BOOLEAN NOT NULL DEFAULT false,
    "signatureRequestSentAt" TIMESTAMP(3),
    "signatureRequestToken" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorityFormSignature_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" TEXT NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "userId" TEXT,
    "email" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDefinition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "capabilities" TEXT NOT NULL,
    "inputSchema" TEXT NOT NULL,
    "outputSchema" TEXT NOT NULL,
    "defaultProvider" TEXT NOT NULL DEFAULT 'anthropic',
    "defaultModel" TEXT,
    "maxTokens" INTEGER NOT NULL DEFAULT 8000,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "timeoutMs" INTEGER NOT NULL DEFAULT 120000,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "dependsOn" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentWorkflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT NOT NULL,
    "reportId" TEXT,
    "inspectionId" TEXT,
    "taskGraph" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "failedTasks" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "config" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL DEFAULT 0,
    "parallelGroup" INTEGER NOT NULL DEFAULT 0,
    "dependsOnTaskIds" TEXT[],
    "input" TEXT NOT NULL,
    "output" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "tokensUsed" INTEGER,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTaskLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTaskLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronJobRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "metadata" TEXT,

    CONSTRAINT "CronJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'RA',
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "sentDate" TIMESTAMP(3),
    "viewedDate" TIMESTAMP(3),
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    "customerABN" TEXT,
    "subtotalExGST" INTEGER NOT NULL,
    "gstAmount" INTEGER NOT NULL,
    "totalIncGST" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "amountDue" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "exchangeRate" DOUBLE PRECISION DEFAULT 1.0,
    "discountAmount" INTEGER DEFAULT 0,
    "discountPercentage" DOUBLE PRECISION,
    "shippingAmount" INTEGER DEFAULT 0,
    "adjustmentAmount" INTEGER DEFAULT 0,
    "adjustmentNote" TEXT,
    "notes" TEXT,
    "terms" TEXT,
    "footer" TEXT,
    "reportId" TEXT,
    "estimateId" TEXT,
    "clientId" TEXT,
    "userId" TEXT NOT NULL,
    "originalInvoiceId" TEXT,
    "recurringInvoiceId" TEXT,
    "templateId" TEXT,
    "externalInvoiceId" TEXT,
    "externalSyncProvider" TEXT,
    "externalSyncStatus" "ExternalSyncStatus",
    "externalSyncedAt" TIMESTAMP(3),
    "externalSyncError" TEXT,
    "pdfUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "publicToken" TEXT,
    "publicViewCount" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "poNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "gstAmount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "discountAmount" INTEGER DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "invoiceId" TEXT NOT NULL,
    "estimateLineItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "notes" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "externalPaymentId" TEXT,
    "externalProvider" "IntegrationProvider",
    "webhookEventId" TEXT,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciledAt" TIMESTAMP(3),
    "reconciledBy" TEXT,
    "invoiceId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePaymentAllocation" (
    "id" TEXT NOT NULL,
    "allocatedAmount" INTEGER NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "creditDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedDate" TIMESTAMP(3),
    "subtotalExGST" INTEGER NOT NULL,
    "gstAmount" INTEGER NOT NULL,
    "totalIncGST" INTEGER NOT NULL,
    "reason" "CreditNoteReason" NOT NULL,
    "reasonNotes" TEXT,
    "refundMethod" "PaymentMethod",
    "refundReference" TEXT,
    "refundedAt" TIMESTAMP(3),
    "invoiceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNoteLineItem" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "gstAmount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "creditNoteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNoteLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "primaryColor" TEXT DEFAULT '#0EA5E9',
    "secondaryColor" TEXT DEFAULT '#1E293B',
    "accentColor" TEXT DEFAULT '#10B981',
    "logoUrl" TEXT,
    "logoPosition" TEXT DEFAULT 'left',
    "fontFamily" TEXT DEFAULT 'Inter',
    "fontSize" TEXT DEFAULT 'medium',
    "headerFont" TEXT DEFAULT 'bold',
    "pageSize" TEXT DEFAULT 'A4',
    "marginTop" INTEGER DEFAULT 50,
    "marginBottom" INTEGER DEFAULT 50,
    "marginLeft" INTEGER DEFAULT 40,
    "marginRight" INTEGER DEFAULT 40,
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showCompanyName" BOOLEAN NOT NULL DEFAULT true,
    "showCompanyAddress" BOOLEAN NOT NULL DEFAULT true,
    "showCompanyPhone" BOOLEAN NOT NULL DEFAULT true,
    "showCompanyEmail" BOOLEAN NOT NULL DEFAULT true,
    "showCompanyABN" BOOLEAN NOT NULL DEFAULT true,
    "headerText" TEXT,
    "footerText" TEXT,
    "showInvoiceNumber" BOOLEAN NOT NULL DEFAULT true,
    "showInvoiceDate" BOOLEAN NOT NULL DEFAULT true,
    "showDueDate" BOOLEAN NOT NULL DEFAULT true,
    "showPaymentTerms" BOOLEAN NOT NULL DEFAULT true,
    "showLineItemImages" BOOLEAN NOT NULL DEFAULT false,
    "showItemCategory" BOOLEAN NOT NULL DEFAULT true,
    "showItemDescription" BOOLEAN NOT NULL DEFAULT true,
    "showQuantity" BOOLEAN NOT NULL DEFAULT true,
    "showUnitPrice" BOOLEAN NOT NULL DEFAULT true,
    "showGST" BOOLEAN NOT NULL DEFAULT true,
    "showSubtotal" BOOLEAN NOT NULL DEFAULT true,
    "showDiscount" BOOLEAN NOT NULL DEFAULT true,
    "showShipping" BOOLEAN NOT NULL DEFAULT true,
    "showGSTBreakdown" BOOLEAN NOT NULL DEFAULT true,
    "paymentInstructions" TEXT,
    "bankAccountName" TEXT,
    "bankAccountBSB" TEXT,
    "bankAccountNumber" TEXT,
    "paymentQRCode" TEXT,
    "customCSS" TEXT,
    "customHTML" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "InvoiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringInvoice" (
    "id" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "description" TEXT,
    "frequency" "RecurringFrequency" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextInvoiceDate" TIMESTAMP(3) NOT NULL,
    "lastInvoiceDate" TIMESTAMP(3),
    "status" "RecurringInvoiceStatus" NOT NULL DEFAULT 'ACTIVE',
    "pausedAt" TIMESTAMP(3),
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    "subtotalExGST" INTEGER NOT NULL,
    "gstAmount" INTEGER NOT NULL,
    "totalIncGST" INTEGER NOT NULL,
    "lineItemsTemplate" JSONB NOT NULL,
    "dueInDays" INTEGER NOT NULL DEFAULT 30,
    "terms" TEXT,
    "notes" TEXT,
    "clientId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "userId" TEXT,
    "invoiceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceEmail" (
    "id" TEXT NOT NULL,
    "emailType" "InvoiceEmailType" NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "resendEmailId" TEXT,
    "invoiceId" TEXT NOT NULL,

    CONSTRAINT "InvoiceEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReminder" (
    "id" TEXT NOT NULL,
    "reminderType" "ReminderType" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "invoiceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotObservation" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "observationType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'nir',
    "inspectionId" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "context" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotObservation_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "ContentJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "hook" TEXT,
    "agitation" TEXT,
    "solution" TEXT,
    "cta" TEXT,
    "voiceoverText" TEXT,
    "caption" TEXT,
    "hashtags" TEXT,
    "audioUrl" TEXT,
    "videoUrl" TEXT,
    "heygenRenderJobId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPost" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalPostId" TEXT,
    "postUrl" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAnalytics" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTopic" (
    "id" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentTopic_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_subscriptionId_key" ON "User"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "RestorationDocument_userId_idx" ON "RestorationDocument"("userId");

-- CreateIndex
CREATE INDEX "RestorationDocument_reportId_idx" ON "RestorationDocument"("reportId");

-- CreateIndex
CREATE INDEX "RestorationDocument_userId_documentType_idx" ON "RestorationDocument"("userId", "documentType");

-- CreateIndex
CREATE INDEX "RestorationDocument_createdAt_idx" ON "RestorationDocument"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");

-- CreateIndex
CREATE INDEX "Client_search_vector_idx" ON "Client" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "Client_userId_name_idx" ON "Client"("userId", "name");

-- CreateIndex
CREATE INDEX "Client_userId_email_idx" ON "Client"("userId", "email");

-- CreateIndex
CREATE INDEX "Client_userId_createdAt_idx" ON "Client"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientUser_email_key" ON "ClientUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ClientUser_clientId_key" ON "ClientUser"("clientId");

-- CreateIndex
CREATE INDEX "ClientUser_email_idx" ON "ClientUser"("email");

-- CreateIndex
CREATE INDEX "ClientUser_clientId_idx" ON "ClientUser"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalInvitation_token_key" ON "PortalInvitation"("token");

-- CreateIndex
CREATE INDEX "PortalInvitation_token_idx" ON "PortalInvitation"("token");

-- CreateIndex
CREATE INDEX "PortalInvitation_email_idx" ON "PortalInvitation"("email");

-- CreateIndex
CREATE INDEX "PortalInvitation_clientId_idx" ON "PortalInvitation"("clientId");

-- CreateIndex
CREATE INDEX "PortalInvitation_userId_idx" ON "PortalInvitation"("userId");

-- CreateIndex
CREATE INDEX "PortalInvitation_status_expiresAt_idx" ON "PortalInvitation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ReportApproval_reportId_approvalType_idx" ON "ReportApproval"("reportId", "approvalType");

-- CreateIndex
CREATE INDEX "ReportApproval_status_idx" ON "ReportApproval"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorProfile_userId_key" ON "ContractorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorProfile_slug_key" ON "ContractorProfile"("slug");

-- CreateIndex
CREATE INDEX "ContractorProfile_isPubliclyVisible_isVerified_idx" ON "ContractorProfile"("isPubliclyVisible", "isVerified");

-- CreateIndex
CREATE INDEX "ContractorProfile_averageRating_idx" ON "ContractorProfile"("averageRating");

-- CreateIndex
CREATE INDEX "ContractorProfile_slug_idx" ON "ContractorProfile"("slug");

-- CreateIndex
CREATE INDEX "ContractorCertification_profileId_verificationStatus_idx" ON "ContractorCertification"("profileId", "verificationStatus");

-- CreateIndex
CREATE INDEX "ContractorCertification_expiryDate_idx" ON "ContractorCertification"("expiryDate");

-- CreateIndex
CREATE INDEX "ContractorCertification_certificationType_idx" ON "ContractorCertification"("certificationType");

-- CreateIndex
CREATE INDEX "ContractorServiceArea_postcode_isActive_idx" ON "ContractorServiceArea"("postcode", "isActive");

-- CreateIndex
CREATE INDEX "ContractorServiceArea_state_isActive_idx" ON "ContractorServiceArea"("state", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorServiceArea_profileId_postcode_key" ON "ContractorServiceArea"("profileId", "postcode");

-- CreateIndex
CREATE INDEX "ContractorReview_profileId_status_idx" ON "ContractorReview"("profileId", "status");

-- CreateIndex
CREATE INDEX "ContractorReview_clientUserId_idx" ON "ContractorReview"("clientUserId");

-- CreateIndex
CREATE INDEX "ContractorReview_reportId_idx" ON "ContractorReview"("reportId");

-- CreateIndex
CREATE INDEX "ContractorReview_createdAt_idx" ON "ContractorReview"("createdAt");

-- CreateIndex
CREATE INDEX "ContractorReview_overallRating_idx" ON "ContractorReview"("overallRating");

-- CreateIndex
CREATE INDEX "Report_search_vector_idx" ON "Report" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "Report_userId_createdAt_idx" ON "Report"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_userId_hazardType_idx" ON "Report"("userId", "hazardType");

-- CreateIndex
CREATE INDEX "Report_userId_status_idx" ON "Report"("userId", "status");

-- CreateIndex
CREATE INDEX "Report_clientId_createdAt_idx" ON "Report"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_includeRegulatoryCitations_idx" ON "Report"("includeRegulatoryCitations");

-- CreateIndex
CREATE UNIQUE INDEX "UserInvite_token_key" ON "UserInvite"("token");

-- CreateIndex
CREATE INDEX "UserInvite_email_idx" ON "UserInvite"("email");

-- CreateIndex
CREATE INDEX "UserInvite_organizationId_idx" ON "UserInvite"("organizationId");

-- CreateIndex
CREATE INDEX "UserInvite_createdById_idx" ON "UserInvite"("createdById");

-- CreateIndex
CREATE INDEX "Integration_userId_idx" ON "Integration"("userId");

-- CreateIndex
CREATE INDEX "Integration_provider_idx" ON "Integration"("provider");

-- CreateIndex
CREATE INDEX "Integration_status_idx" ON "Integration"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_userId_provider_key" ON "Integration"("userId", "provider");

-- CreateIndex
CREATE INDEX "ExternalClient_integrationId_idx" ON "ExternalClient"("integrationId");

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
CREATE INDEX "WebhookEvent_provider_eventType_idx" ON "WebhookEvent"("provider", "eventType");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_createdAt_idx" ON "WebhookEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_integrationId_status_idx" ON "WebhookEvent"("integrationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Scope_reportId_key" ON "Scope"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_scopeId_key" ON "Estimate"("scopeId");

-- CreateIndex
CREATE INDEX "Estimate_reportId_createdAt_idx" ON "Estimate"("reportId", "createdAt");

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

-- CreateIndex
CREATE UNIQUE INDEX "AddonPurchase_stripeSessionId_key" ON "AddonPurchase"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "AddonPurchase_stripePaymentIntentId_key" ON "AddonPurchase"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "AddonPurchase_userId_idx" ON "AddonPurchase"("userId");

-- CreateIndex
CREATE INDEX "AddonPurchase_status_idx" ON "AddonPurchase"("status");

-- CreateIndex
CREATE INDEX "AddonPurchase_purchasedAt_idx" ON "AddonPurchase"("purchasedAt");

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

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_reportId_key" ON "Inspection"("reportId");

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
CREATE INDEX "Inspection_search_vector_idx" ON "Inspection" USING GIN ("search_vector");

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
CREATE INDEX "ScopeItem_inspectionId_idx" ON "ScopeItem"("inspectionId");

-- CreateIndex
CREATE INDEX "ScopeItem_itemType_idx" ON "ScopeItem"("itemType");

-- CreateIndex
CREATE INDEX "ScopeItem_autoDetermined_idx" ON "ScopeItem"("autoDetermined");

-- CreateIndex
CREATE INDEX "CostEstimate_inspectionId_idx" ON "CostEstimate"("inspectionId");

-- CreateIndex
CREATE INDEX "CostEstimate_category_idx" ON "CostEstimate"("category");

-- CreateIndex
CREATE INDEX "Classification_inspectionId_idx" ON "Classification"("inspectionId");

-- CreateIndex
CREATE INDEX "Classification_category_idx" ON "Classification"("category");

-- CreateIndex
CREATE INDEX "Classification_class_idx" ON "Classification"("class");

-- CreateIndex
CREATE INDEX "AuditLog_inspectionId_idx" ON "AuditLog"("inspectionId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "BuildingCode_state_idx" ON "BuildingCode"("state");

-- CreateIndex
CREATE INDEX "BuildingCode_postcode_idx" ON "BuildingCode"("postcode");

-- CreateIndex
CREATE INDEX "BuildingCode_regulatoryDocumentId_idx" ON "BuildingCode"("regulatoryDocumentId");

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
CREATE INDEX "CostDatabase_itemType_idx" ON "CostDatabase"("itemType");

-- CreateIndex
CREATE INDEX "CostDatabase_category_idx" ON "CostDatabase"("category");

-- CreateIndex
CREATE INDEX "CostDatabase_region_idx" ON "CostDatabase"("region");

-- CreateIndex
CREATE INDEX "CostDatabase_isActive_idx" ON "CostDatabase"("isActive");

-- CreateIndex
CREATE INDEX "InspectionPhoto_inspectionId_idx" ON "InspectionPhoto"("inspectionId");

-- CreateIndex
CREATE INDEX "InspectionPhoto_timestamp_idx" ON "InspectionPhoto"("timestamp");

-- CreateIndex
CREATE INDEX "ChatMessage_userId_createdAt_idx" ON "ChatMessage"("userId", "createdAt");

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
CREATE UNIQUE INDEX "AuthorityFormTemplate_code_key" ON "AuthorityFormTemplate"("code");

-- CreateIndex
CREATE INDEX "AuthorityFormTemplate_code_idx" ON "AuthorityFormTemplate"("code");

-- CreateIndex
CREATE INDEX "AuthorityFormTemplate_isActive_idx" ON "AuthorityFormTemplate"("isActive");

-- CreateIndex
CREATE INDEX "AuthorityFormInstance_reportId_idx" ON "AuthorityFormInstance"("reportId");

-- CreateIndex
CREATE INDEX "AuthorityFormInstance_templateId_idx" ON "AuthorityFormInstance"("templateId");

-- CreateIndex
CREATE INDEX "AuthorityFormInstance_status_idx" ON "AuthorityFormInstance"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorityFormSignature_signatureRequestToken_key" ON "AuthorityFormSignature"("signatureRequestToken");

-- CreateIndex
CREATE INDEX "AuthorityFormSignature_instanceId_idx" ON "AuthorityFormSignature"("instanceId");

-- CreateIndex
CREATE INDEX "AuthorityFormSignature_signatoryRole_idx" ON "AuthorityFormSignature"("signatoryRole");

-- CreateIndex
CREATE INDEX "AuthorityFormSignature_signatureRequestToken_idx" ON "AuthorityFormSignature"("signatureRequestToken");

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
CREATE UNIQUE INDEX "PropertyLookup_inspectionId_key" ON "PropertyLookup"("inspectionId");

-- CreateIndex
CREATE INDEX "PropertyLookup_expiresAt_idx" ON "PropertyLookup"("expiresAt");

-- CreateIndex
CREATE INDEX "PropertyLookup_inspectionId_idx" ON "PropertyLookup"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyLookup_propertyAddress_propertyPostcode_key" ON "PropertyLookup"("propertyAddress", "propertyPostcode");

-- CreateIndex
CREATE UNIQUE INDEX "StripeWebhookEvent_stripeEventId_key" ON "StripeWebhookEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_stripeEventId_idx" ON "StripeWebhookEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_eventType_idx" ON "StripeWebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_status_idx" ON "StripeWebhookEvent"("status");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_receivedAt_idx" ON "StripeWebhookEvent"("receivedAt");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_userId_idx" ON "StripeWebhookEvent"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_eventType_idx" ON "SecurityEvent"("eventType");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_idx" ON "SecurityEvent"("userId");

-- CreateIndex
CREATE INDEX "SecurityEvent_email_idx" ON "SecurityEvent"("email");

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_severity_idx" ON "SecurityEvent"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDefinition_slug_key" ON "AgentDefinition"("slug");

-- CreateIndex
CREATE INDEX "AgentDefinition_slug_idx" ON "AgentDefinition"("slug");

-- CreateIndex
CREATE INDEX "AgentDefinition_isActive_idx" ON "AgentDefinition"("isActive");

-- CreateIndex
CREATE INDEX "AgentWorkflow_userId_idx" ON "AgentWorkflow"("userId");

-- CreateIndex
CREATE INDEX "AgentWorkflow_reportId_idx" ON "AgentWorkflow"("reportId");

-- CreateIndex
CREATE INDEX "AgentWorkflow_status_idx" ON "AgentWorkflow"("status");

-- CreateIndex
CREATE INDEX "AgentWorkflow_createdAt_idx" ON "AgentWorkflow"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTask_idempotencyKey_key" ON "AgentTask"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentTask_workflowId_idx" ON "AgentTask"("workflowId");

-- CreateIndex
CREATE INDEX "AgentTask_agentSlug_idx" ON "AgentTask"("agentSlug");

-- CreateIndex
CREATE INDEX "AgentTask_status_idx" ON "AgentTask"("status");

-- CreateIndex
CREATE INDEX "AgentTask_workflowId_status_idx" ON "AgentTask"("workflowId", "status");

-- CreateIndex
CREATE INDEX "AgentTask_workflowId_parallelGroup_sequenceOrder_idx" ON "AgentTask"("workflowId", "parallelGroup", "sequenceOrder");

-- CreateIndex
CREATE INDEX "AgentTaskLog_taskId_idx" ON "AgentTaskLog"("taskId");

-- CreateIndex
CREATE INDEX "AgentTaskLog_taskId_timestamp_idx" ON "AgentTaskLog"("taskId", "timestamp");

-- CreateIndex
CREATE INDEX "CronJobRun_jobName_startedAt_idx" ON "CronJobRun"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "CronJobRun_status_idx" ON "CronJobRun"("status");

-- CreateIndex
CREATE INDEX "InvoiceSequence_userId_year_idx" ON "InvoiceSequence"("userId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSequence_userId_year_key" ON "InvoiceSequence"("userId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_publicToken_key" ON "Invoice"("publicToken");

-- CreateIndex
CREATE INDEX "Invoice_userId_invoiceNumber_idx" ON "Invoice"("userId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_userId_status_idx" ON "Invoice"("userId", "status");

-- CreateIndex
CREATE INDEX "Invoice_userId_invoiceDate_idx" ON "Invoice"("userId", "invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_userId_dueDate_idx" ON "Invoice"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- CreateIndex
CREATE INDEX "Invoice_reportId_idx" ON "Invoice"("reportId");

-- CreateIndex
CREATE INDEX "Invoice_estimateId_idx" ON "Invoice"("estimateId");

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_externalInvoiceId_idx" ON "Invoice"("externalInvoiceId");

-- CreateIndex
CREATE INDEX "Invoice_publicToken_idx" ON "Invoice"("publicToken");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_sortOrder_idx" ON "InvoiceLineItem"("invoiceId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePayment_stripePaymentIntentId_key" ON "InvoicePayment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "InvoicePayment_userId_paymentDate_idx" ON "InvoicePayment"("userId", "paymentDate");

-- CreateIndex
CREATE INDEX "InvoicePayment_invoiceId_paymentDate_idx" ON "InvoicePayment"("invoiceId", "paymentDate");

-- CreateIndex
CREATE INDEX "InvoicePayment_stripePaymentIntentId_idx" ON "InvoicePayment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "InvoicePayment_paymentMethod_idx" ON "InvoicePayment"("paymentMethod");

-- CreateIndex
CREATE INDEX "InvoicePayment_externalPaymentId_idx" ON "InvoicePayment"("externalPaymentId");

-- CreateIndex
CREATE INDEX "InvoicePaymentAllocation_paymentId_idx" ON "InvoicePaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "InvoicePaymentAllocation_invoiceId_idx" ON "InvoicePaymentAllocation"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePaymentAllocation_paymentId_invoiceId_key" ON "InvoicePaymentAllocation"("paymentId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_creditNoteNumber_key" ON "CreditNote"("creditNoteNumber");

-- CreateIndex
CREATE INDEX "CreditNote_userId_creditNoteNumber_idx" ON "CreditNote"("userId", "creditNoteNumber");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "CreditNote_status_idx" ON "CreditNote"("status");

-- CreateIndex
CREATE INDEX "CreditNoteLineItem_creditNoteId_sortOrder_idx" ON "CreditNoteLineItem"("creditNoteId", "sortOrder");

-- CreateIndex
CREATE INDEX "InvoiceTemplate_userId_isDefault_idx" ON "InvoiceTemplate"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "InvoiceTemplate_userId_createdAt_idx" ON "InvoiceTemplate"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RecurringInvoice_userId_status_idx" ON "RecurringInvoice"("userId", "status");

-- CreateIndex
CREATE INDEX "RecurringInvoice_status_nextInvoiceDate_idx" ON "RecurringInvoice"("status", "nextInvoiceDate");

-- CreateIndex
CREATE INDEX "RecurringInvoice_clientId_idx" ON "RecurringInvoice"("clientId");

-- CreateIndex
CREATE INDEX "InvoiceAuditLog_invoiceId_createdAt_idx" ON "InvoiceAuditLog"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceAuditLog_userId_idx" ON "InvoiceAuditLog"("userId");

-- CreateIndex
CREATE INDEX "InvoiceEmail_invoiceId_sentAt_idx" ON "InvoiceEmail"("invoiceId", "sentAt");

-- CreateIndex
CREATE INDEX "InvoiceEmail_resendEmailId_idx" ON "InvoiceEmail"("resendEmailId");

-- CreateIndex
CREATE INDEX "PaymentReminder_status_scheduledFor_idx" ON "PaymentReminder"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "PaymentReminder_invoiceId_idx" ON "PaymentReminder"("invoiceId");

-- CreateIndex
CREATE INDEX "PilotObservation_claimId_idx" ON "PilotObservation"("claimId");

-- CreateIndex
CREATE INDEX "PilotObservation_observationType_idx" ON "PilotObservation"("observationType");

-- CreateIndex
CREATE INDEX "PilotObservation_group_idx" ON "PilotObservation"("group");

-- CreateIndex
CREATE INDEX "PilotObservation_inspectionId_idx" ON "PilotObservation"("inspectionId");

-- CreateIndex
CREATE INDEX "PilotObservation_createdAt_idx" ON "PilotObservation"("createdAt");

-- CreateIndex
CREATE INDEX "ScopeTemplate_userId_idx" ON "ScopeTemplate"("userId");

-- CreateIndex
CREATE INDEX "ScopeTemplate_claimType_idx" ON "ScopeTemplate"("claimType");

-- CreateIndex
CREATE INDEX "ContentJob_userId_idx" ON "ContentJob"("userId");

-- CreateIndex
CREATE INDEX "ContentJob_status_idx" ON "ContentJob"("status");

-- CreateIndex
CREATE INDEX "ContentJob_platform_idx" ON "ContentJob"("platform");

-- CreateIndex
CREATE INDEX "ContentJob_createdAt_idx" ON "ContentJob"("createdAt");

-- CreateIndex
CREATE INDEX "ContentPost_jobId_idx" ON "ContentPost"("jobId");

-- CreateIndex
CREATE INDEX "ContentPost_platform_idx" ON "ContentPost"("platform");

-- CreateIndex
CREATE INDEX "ContentPost_status_idx" ON "ContentPost"("status");

-- CreateIndex
CREATE INDEX "ContentPost_scheduledAt_idx" ON "ContentPost"("scheduledAt");

-- CreateIndex
CREATE INDEX "ContentAnalytics_postId_idx" ON "ContentAnalytics"("postId");

-- CreateIndex
CREATE INDEX "ContentAnalytics_recordedAt_idx" ON "ContentAnalytics"("recordedAt");

-- CreateIndex
CREATE INDEX "ContentTopic_enabled_lastUsedAt_idx" ON "ContentTopic"("enabled", "lastUsedAt");

-- CreateIndex
CREATE INDEX "ContentTopic_category_idx" ON "ContentTopic"("category");

-- CreateIndex
CREATE INDEX "ContentTopic_platform_idx" ON "ContentTopic"("platform");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "SupportTicket_email_idx" ON "SupportTicket"("email");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managedById_fkey" FOREIGN KEY ("managedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_subscriptionTierId_fkey" FOREIGN KEY ("subscriptionTierId") REFERENCES "SubscriptionTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationDocument" ADD CONSTRAINT "RestorationDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationDocument" ADD CONSTRAINT "RestorationDocument_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientUser" ADD CONSTRAINT "ClientUser_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalInvitation" ADD CONSTRAINT "PortalInvitation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalInvitation" ADD CONSTRAINT "PortalInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportApproval" ADD CONSTRAINT "ReportApproval_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorProfile" ADD CONSTRAINT "ContractorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorCertification" ADD CONSTRAINT "ContractorCertification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ContractorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorServiceArea" ADD CONSTRAINT "ContractorServiceArea_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ContractorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorReview" ADD CONSTRAINT "ContractorReview_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ContractorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorReview" ADD CONSTRAINT "ContractorReview_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "ClientUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorReview" ADD CONSTRAINT "ContractorReview_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_assignedManagerId_fkey" FOREIGN KEY ("assignedManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_managedById_fkey" FOREIGN KEY ("managedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostLibrary" ADD CONSTRAINT "CostLibrary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostItem" ADD CONSTRAINT "CostItem_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "CostLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalClient" ADD CONSTRAINT "ExternalClient_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalJob" ADD CONSTRAINT "ExternalJob_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationSyncLog" ADD CONSTRAINT "IntegrationSyncLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "AddonPurchase" ADD CONSTRAINT "AddonPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimAnalysisBatch" ADD CONSTRAINT "ClaimAnalysisBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimAnalysis" ADD CONSTRAINT "ClaimAnalysis_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ClaimAnalysisBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissingElement" ADD CONSTRAINT "MissingElement_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ClaimAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandardTemplate" ADD CONSTRAINT "StandardTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentalData" ADD CONSTRAINT "EnvironmentalData_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoistureReading" ADD CONSTRAINT "MoistureReading_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectedArea" ADD CONSTRAINT "AffectedArea_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeItem" ADD CONSTRAINT "ScopeItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEstimate" ADD CONSTRAINT "CostEstimate_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classification" ADD CONSTRAINT "Classification_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingCode" ADD CONSTRAINT "BuildingCode_regulatoryDocumentId_fkey" FOREIGN KEY ("regulatoryDocumentId") REFERENCES "RegulatoryDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatorySection" ADD CONSTRAINT "RegulatorySection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RegulatoryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RegulatoryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionPhoto" ADD CONSTRAINT "InspectionPhoto_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "AuthorityFormInstance" ADD CONSTRAINT "AuthorityFormInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AuthorityFormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityFormInstance" ADD CONSTRAINT "AuthorityFormInstance_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityFormSignature" ADD CONSTRAINT "AuthorityFormSignature_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "AuthorityFormInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_formTemplateId_fkey" FOREIGN KEY ("formTemplateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewResponse" ADD CONSTRAINT "InterviewResponse_interviewSessionId_fkey" FOREIGN KEY ("interviewSessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "AgentWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_agentSlug_fkey" FOREIGN KEY ("agentSlug") REFERENCES "AgentDefinition"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTaskLog" ADD CONSTRAINT "AgentTaskLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceSequence" ADD CONSTRAINT "InvoiceSequence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recurringInvoiceId_fkey" FOREIGN KEY ("recurringInvoiceId") REFERENCES "RecurringInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InvoiceTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePaymentAllocation" ADD CONSTRAINT "InvoicePaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "InvoicePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePaymentAllocation" ADD CONSTRAINT "InvoicePaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteLineItem" ADD CONSTRAINT "CreditNoteLineItem_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceTemplate" ADD CONSTRAINT "InvoiceTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAuditLog" ADD CONSTRAINT "InvoiceAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAuditLog" ADD CONSTRAINT "InvoiceAuditLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceEmail" ADD CONSTRAINT "InvoiceEmail_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReminder" ADD CONSTRAINT "PaymentReminder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeTemplate" ADD CONSTRAINT "ScopeTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentJob" ADD CONSTRAINT "ContentJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ContentJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAnalytics" ADD CONSTRAINT "ContentAnalytics_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ContentPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

