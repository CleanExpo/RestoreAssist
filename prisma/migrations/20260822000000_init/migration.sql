-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'MANAGER');

-- CreateEnum
CREATE TYPE "ExperienceMode" AS ENUM ('APPRENTICE', 'EXPERIENCED');

-- CreateEnum
CREATE TYPE "ChunkProvenance" AS ENUM ('AUTHORITATIVE_STANDARD', 'KNOWLEDGE');

-- CreateEnum
CREATE TYPE "TradingStatus" AS ENUM ('ACTIVE', 'PRE_TRADING');

-- CreateEnum
CREATE TYPE "SetupMode" AS ENUM ('AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "HydrationKind" AS ENUM ('ABR', 'WEBSITE', 'PRICING');

-- CreateEnum
CREATE TYPE "HydrationStatus" AS ENUM ('RUNNING', 'READY', 'ERROR', 'MANUAL');

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
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'SENT', 'CLIENT_REVIEW', 'APPROVED', 'LOCKED', 'REJECTED', 'EXPIRED', 'WITHDRAWN');

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
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PROCESSING', 'CLASSIFIED', 'SCOPED', 'ESTIMATED', 'COMPLETED', 'REJECTED', 'IN_BILLING', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('WATER', 'FIRE', 'MOULD', 'STORM', 'CONTENTS', 'BIOHAZARD', 'ODOUR', 'CARPET', 'HVAC', 'ASBESTOS');

-- CreateEnum
CREATE TYPE "WaterCategory" AS ENUM ('CAT_1', 'CAT_2', 'CAT_3');

-- CreateEnum
CREATE TYPE "DamageClass" AS ENUM ('CLASS_1', 'CLASS_2', 'CLASS_3', 'CLASS_4');

-- CreateEnum
CREATE TYPE "LossSourceType" AS ENUM ('PLUMBING', 'ROOF', 'APPLIANCE', 'FLOOD', 'GROUNDWATER', 'CONDENSATION', 'HVAC', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "StructuralStability" AS ENUM ('SAFE', 'UNCERTAIN', 'COMPROMISED');

-- CreateEnum
CREATE TYPE "SmokeResidueType" AS ENUM ('WET', 'DRY', 'PROTEIN', 'FUEL_OIL');

-- CreateEnum
CREATE TYPE "OdourType" AS ENUM ('SMOKE', 'PROTEIN', 'CHEMICAL', 'FUEL');

-- CreateEnum
CREATE TYPE "PackOutDecision" AS ENUM ('CLEAN_ONSITE', 'PACK_OUT', 'TOTAL_LOSS');

-- CreateEnum
CREATE TYPE "ConditionGrade" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'POOR');

-- CreateEnum
CREATE TYPE "MouldConditionLevel" AS ENUM ('CONDITION_1', 'CONDITION_2', 'CONDITION_3');

-- CreateEnum
CREATE TYPE "StormEventType" AS ENUM ('STORM', 'CYCLONE', 'HAIL', 'DOWNBURST', 'TORNADO');

-- CreateEnum
CREATE TYPE "DamagePenetration" AS ENUM ('SURFACE', 'PARTIAL', 'FULL');

-- CreateEnum
CREATE TYPE "RoofMaterialType" AS ENUM ('COLORBOND', 'TERRACOTTA', 'SHINGLES', 'METAL', 'OTHER');

-- CreateEnum
CREATE TYPE "BiohazardType" AS ENUM ('SEWAGE_CAT3', 'BLOOD', 'BODILY_FLUIDS', 'CRIME_SCENE', 'UNATTENDED_DEATH');

-- CreateEnum
CREATE TYPE "PPELevel" AS ENUM ('LEVEL_1', 'LEVEL_2', 'LEVEL_3');

-- CreateEnum
CREATE TYPE "CarpetFiberType" AS ENUM ('WOOL', 'NYLON', 'POLYESTER', 'POLYPROPYLENE', 'OTHER');

-- CreateEnum
CREATE TYPE "CarpetPileType" AS ENUM ('CUT', 'LOOP', 'CUT_LOOP', 'FRIEZE');

-- CreateEnum
CREATE TYPE "StainRemovalResult" AS ENUM ('COMPLETE', 'PARTIAL', 'UNSUCCESSFUL');

-- CreateEnum
CREATE TYPE "HVACContaminationLevel" AS ENUM ('NONE', 'LIGHT', 'MODERATE', 'HEAVY');

-- CreateEnum
CREATE TYPE "AustralianState" AS ENUM ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT');

-- CreateEnum
CREATE TYPE "TechnicianCertification" AS ENUM ('WRT', 'ASD', 'CMS', 'HST', 'OCT', 'CCT', 'MRS', 'OTHER');

-- CreateEnum
CREATE TYPE "NRPGCategory" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'CATASTROPHIC');

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

-- CreateEnum
CREATE TYPE "EvidenceClass" AS ENUM ('MOISTURE_READING', 'THERMAL_IMAGE', 'AMBIENT_ENVIRONMENTAL', 'PHOTO_DAMAGE', 'PHOTO_EQUIPMENT', 'PHOTO_PROGRESS', 'PHOTO_COMPLETION', 'VIDEO_WALKTHROUGH', 'FLOOR_PLAN', 'SCOPE_DOCUMENT', 'LAB_RESULT', 'AUTHORITY_FORM', 'EQUIPMENT_LOG', 'TECHNICIAN_NOTE', 'VOICE_MEMO', 'THIRD_PARTY_REPORT', 'COMPLIANCE_CERTIFICATE', 'AFFECTED_CONTENTS');

-- CreateEnum
CREATE TYPE "EvidenceItemStatus" AS ENUM ('ACTIVE', 'FLAGGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WorkflowStepStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "StorageProviderType" AS ENUM ('SUPABASE', 'S3', 'GCS', 'AZURE', 'GOOGLE_DRIVE', 'ONEDRIVE', 'LOCAL');

-- CreateEnum
CREATE TYPE "MirrorJobKind" AS ENUM ('PHOTO', 'REPORT', 'INVOICE', 'JOB_PACKAGE', 'HANDOVER_PACKAGE', 'AUDIT_LOG');

-- CreateEnum
CREATE TYPE "MirrorJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "RestoreJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'SKIPPED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "RestoreMode" AS ENUM ('MISSING', 'FORCE');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('PROVISIONING', 'READY', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "WorkspaceMemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('ANTHROPIC', 'OPENAI', 'GOOGLE', 'GEMMA', 'ELEVENLABS', 'OPENROUTER');

-- CreateEnum
CREATE TYPE "ProviderConnectionStatus" AS ENUM ('ACTIVE', 'FAILED', 'DISABLED');

-- CreateEnum
CREATE TYPE "AddonSku" AS ENUM ('VOICE', 'TECHNICIAN_SEATS', 'BOOKKEEPING', 'SERVICE_CRM', 'PAYMENTS', 'FLOORPLAN_UNDERLAY', 'CLIENT_COMMS');

-- CreateEnum
CREATE TYPE "ScrapingProvider" AS ENUM ('APIFY', 'BRIGHTDATA', 'ZYTE', 'FIRECRAWL', 'SHARED');

-- CreateEnum
CREATE TYPE "ClaimState" AS ENUM ('INTAKE', 'STABILISATION_ACTIVE', 'WHS_HOLD', 'STABILISATION_COMPLETE', 'SCOPE_DRAFT', 'SCOPE_APPROVED', 'DRYING_ACTIVE', 'VARIATION_REVIEW', 'DRYING_CERTIFIED', 'CLOSEOUT', 'INVOICE_ISSUED', 'INVOICE_PAID', 'DISPUTED', 'CLOSED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AuthorisationSource" AS ENUM ('INSURER_EMAIL', 'CUSTOMER_SIGNATURE', 'INTERNAL_MANAGER', 'ADJUSTER_APPROVAL', 'CARRIER_EMAIL', 'CARRIER_PORTAL', 'DOCUSIGN', 'PHONE_THEN_EMAIL_FOLLOWUP', 'EMERGENCY_SELF');

-- CreateEnum
CREATE TYPE "AuthorisationLicenceClass" AS ENUM ('OPEN', 'PROVISIONAL', 'RESTRICTED', 'LEARNER', 'PROBATIONARY', 'HEAVY_VEHICLE', 'MOTORCYCLE', 'OTHER');

-- CreateEnum
CREATE TYPE "WHSIncidentType" AS ENUM ('NEAR_MISS', 'FIRST_AID', 'MEDICAL_TREATMENT', 'LOST_TIME_INJURY', 'NOTIFIABLE_INCIDENT', 'PROPERTY_DAMAGE', 'ENVIRONMENTAL', 'BIOHAZARD', 'OTHER');

-- CreateEnum
CREATE TYPE "InsurerReportFormat" AS ENUM ('STANDARD', 'ENHANCED', 'FORENSIC', 'SCOPE_ONLY');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('MASTER_BEDROOM', 'BEDROOM', 'BATHROOM', 'ENSUITE', 'KITCHEN', 'LIVING_ROOM', 'FAMILY_ROOM', 'DINING_ROOM', 'LAUNDRY', 'HALLWAY', 'GARAGE', 'ATTIC', 'BASEMENT', 'CRAWL_SPACE', 'OFFICE', 'STUDY', 'OUTDOOR', 'ROOF_CAVITY', 'SUBFLOOR', 'STAIRWELL', 'OTHER');

-- CreateEnum
CREATE TYPE "AnnotationType" AS ENUM ('ARROW', 'CIRCLE', 'RECTANGLE', 'TEXT', 'FREEHAND', 'MEASUREMENT', 'DAMAGE_ZONE');

-- CreateEnum
CREATE TYPE "CustodyAction" AS ENUM ('CAPTURED', 'UPLOADED', 'REVIEWED', 'ANNOTATED', 'EXPORTED', 'SHARED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "InspectionLayout" AS ENUM ('ROOM_FIRST', 'TIMELINE', 'QUICK_CAPTURE');

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
    "phone" TEXT,
    "password" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "acceptedTermsAt" TIMESTAMP(3),
    "firstRunChecklistDismissedAt" TIMESTAMP(3),
    "productTourDismissedAt" TIMESTAMP(3),
    "trialReminderSentAt" JSONB,
    "pricingReminderSentAt" TIMESTAMP(3),
    "cloudMirrorProvider" TEXT,
    "isJuniorTechnician" BOOLEAN NOT NULL DEFAULT false,
    "experienceMode" "ExperienceMode" NOT NULL DEFAULT 'APPRENTICE',
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
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorEnabledAt" TIMESTAMP(3),
    "twoFactorRecoveryCodes" TEXT,
    "hasPremiumInspectionReports" BOOLEAN NOT NULL DEFAULT false,
    "quickFillCreditsRemaining" INTEGER DEFAULT 1,
    "totalQuickFillUsed" INTEGER DEFAULT 0,
    "deepseekApiKey" TEXT,
    "businessName" TEXT,
    "businessAddress" TEXT,
    "businessLogo" TEXT,
    "businessABN" TEXT,
    "businessACN" TEXT,
    "businessState" TEXT,
    "businessPhone" TEXT,
    "businessEmail" TEXT,
    "needsOnboarding" BOOLEAN NOT NULL DEFAULT false,
    "monthlyUsageCap" DOUBLE PRECISION,
    "interviewTier" "SubscriptionTierLevel" NOT NULL DEFAULT 'STANDARD',
    "preferredQuestionStyle" TEXT,
    "autoAcceptSuggestionsAboveConfidence" DOUBLE PRECISION,
    "subscriptionTierId" TEXT,
    "activeBusinessProfileId" TEXT,
    "inspectionLayout" "InspectionLayout" NOT NULL DEFAULT 'ROOM_FIRST',

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
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "brandLogoUrl" TEXT,
    "brandPrimaryColor" TEXT,
    "pulseOptOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
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
CREATE TABLE "ClientPortalAccount" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenRotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastAccessedAt" TIMESTAMP(3),

    CONSTRAINT "ClientPortalAccount_pkey" PRIMARY KEY ("id")
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
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "aiSynopsis" TEXT,
    "aiSynopsisAt" TIMESTAMP(3),
    "clientSummaryCache" TEXT,
    "clientSummaryCachedAt" TIMESTAMP(3),
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
    "aiDraftGeneratedAt" TIMESTAMP(3),
    "aiDraftHumanEditedAt" TIMESTAMP(3),
    "reportOwnershipAcknowledgedAt" TIMESTAMP(3),
    "reportOwnershipAcknowledgedBy" TEXT,
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
    "workspaceId" TEXT,
    "businessProfileId" TEXT,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "storageProvider" "StorageProviderType" NOT NULL DEFAULT 'SUPABASE',
    "storageBucketUrl" TEXT,
    "storageProviderRefreshToken" TEXT,
    "storageProviderAccessToken" TEXT,
    "storageProviderTokenExpiresAt" TIMESTAMP(3),
    "storageProviderAccountEmail" TEXT,
    "storageProviderPkceVerifier" TEXT,
    "country" TEXT NOT NULL DEFAULT 'AU',
    "legalName" TEXT,
    "tradingName" TEXT,
    "abn" TEXT,
    "acn" TEXT,
    "state" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "accentColor" TEXT,
    "aboutCopy" TEXT,
    "tradingStatus" "TradingStatus" NOT NULL DEFAULT 'ACTIVE',
    "setupStartedAt" TIMESTAMP(3),
    "setupCompletedAt" TIMESTAMP(3),
    "emailProvider" TEXT,
    "emailProviderEncryptedKey" TEXT,
    "emailFromAddress" TEXT,
    "googleReviewUrl" TEXT,
    "setupMode" "SetupMode" NOT NULL DEFAULT 'AI',
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
    "workspaceId" TEXT,
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
    "workspaceId" TEXT,

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
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalEventId" TEXT,
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
CREATE TABLE "XeroAccountCodeMapping" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "category" TEXT,
    "accountCode" TEXT NOT NULL,
    "taxType" TEXT NOT NULL DEFAULT 'OUTPUT',
    "description" TEXT,
    "damageType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeroAccountCodeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XeroSyncStatus" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "xeroEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeroSyncStatus_pkey" PRIMARY KEY ("id")
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
    "metadata" TEXT,
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
    "sourceCostItemId" TEXT,
    "isPassThrough" BOOLEAN NOT NULL DEFAULT false,
    "taxType" TEXT NOT NULL DEFAULT 'OUTPUT',
    "xeroAccountCode" TEXT,
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
    "negativeAirMachineDailyRate" DOUBLE PRECISION,
    "hepaVacuumDailyRate" DOUBLE PRECISION,
    "monitoringVisitDailyRate" DOUBLE PRECISION,
    "mobilisationFee" DOUBLE PRECISION,
    "wasteDisposalPerBinRate" DOUBLE PRECISION,
    "photoDocumentationFee" DOUBLE PRECISION,
    "afterHoursMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "saturdayMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "sundayMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "publicHolidayMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "projectManagementPercent" DOUBLE PRECISION NOT NULL DEFAULT 8.0,
    "electricityRatePer24h" DOUBLE PRECISION DEFAULT 1.50,
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
CREATE TABLE "AssessmentGeneration" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "assessmentType" TEXT NOT NULL,
    "reportSections" JSONB NOT NULL,
    "scopeItems" JSONB NOT NULL,
    "estimateLines" JSONB NOT NULL,
    "citations" JSONB NOT NULL,
    "modelUsed" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "costEstimateUsd" DOUBLE PRECISION,
    "workspaceId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT,

    CONSTRAINT "AssessmentGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "reportId" TEXT,
    "propertyCountry" TEXT NOT NULL DEFAULT 'AU',
    "inspectionNumber" TEXT NOT NULL,
    "propertyAddress" TEXT NOT NULL,
    "propertyPostcode" TEXT NOT NULL,
    "inspectionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "technicianName" TEXT,
    "technicianId" TEXT,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "closeSummary" TEXT,
    "completedAt" TIMESTAMP(3),
    "closePackageStorageKey" TEXT,
    "handoverCompletedAt" TIMESTAMP(3),
    "handoverPackageStorageKey" TEXT,
    "source" TEXT DEFAULT 'MANUAL',
    "acceptedAt" TIMESTAMP(3),
    "pulseEnabled" BOOLEAN NOT NULL DEFAULT false,
    "claimType" "ClaimType",
    "signatureUrl" TEXT,
    "signedAt" TIMESTAMPTZ,
    "signedByName" TEXT,
    "lossDescription" TEXT,
    "generatedNarrative" TEXT,
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
    "powerCircuits" INTEGER,
    "powerCircuitRatingA" INTEGER,
    "powerDeratePct" DOUBLE PRECISION DEFAULT 0.8,
    "contentsManifestDraft" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "search_vector" tsvector,
    "workspaceId" TEXT,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WHSIncident" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT,
    "userId" TEXT NOT NULL,
    "incidentType" TEXT NOT NULL,
    "incidentTypeEnum" "WHSIncidentType",
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
CREATE TABLE "EnvironmentalData" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "ambientTemperature" DOUBLE PRECISION NOT NULL,
    "humidityLevel" DOUBLE PRECISION NOT NULL,
    "dewPoint" DOUBLE PRECISION,
    "airCirculation" BOOLEAN NOT NULL DEFAULT false,
    "weatherConditions" TEXT,
    "notes" TEXT,
    "mobileLocalId" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "timestamp" TIMESTAMPTZ,
    "location" TEXT,
    "gpp" DOUBLE PRECISION,
    "emc" DOUBLE PRECISION,
    "grainsPerPound" DOUBLE PRECISION,
    "vaporPressure" DOUBLE PRECISION,
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
    "unit" TEXT,
    "deviceVendor" TEXT,
    "deviceModel" TEXT,
    "source" TEXT DEFAULT 'manual',
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "isMonitoringPoint" BOOLEAN NOT NULL DEFAULT false,
    "affectedArea" TEXT,
    "mapX" DOUBLE PRECISION,
    "mapY" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoistureReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterDamageClassification" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "waterCategory" "WaterCategory",
    "damageClass" "DamageClass",
    "lossSourceType" "LossSourceType",
    "lossSourceIdentified" BOOLEAN NOT NULL DEFAULT false,
    "lossSourceAddressed" BOOLEAN NOT NULL DEFAULT false,
    "hoursOfExposure" DOUBLE PRECISION,
    "gateClassificationComplete" BOOLEAN NOT NULL DEFAULT false,
    "gateLossSourceComplete" BOOLEAN NOT NULL DEFAULT false,
    "gatePhotosAttached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaterDamageClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestorationIncident" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "waterCategory" "WaterCategory",
    "damageClass" "DamageClass",
    "lossSource" "LossSourceType",
    "hazards" TEXT[],
    "remediationDays" INTEGER,
    "outcome" TEXT,
    "floorAreaM2" INTEGER,
    "roomCount" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "sourceInspectionHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestorationIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PsychrometricReading" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "visitDate" TIMESTAMPTZ NOT NULL,
    "visitNumber" INTEGER NOT NULL,
    "technicianId" TEXT,
    "dryBulbTempC" DOUBLE PRECISION,
    "wetBulbTempC" DOUBLE PRECISION,
    "relativeHumidity" DOUBLE PRECISION,
    "dewPointC" DOUBLE PRECISION,
    "grainsPerPound" DOUBLE PRECISION,
    "gramsPerKilogram" DOUBLE PRECISION,
    "equipmentRunning" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PsychrometricReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircuitAssessment" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "circuitId" TEXT NOT NULL,
    "locationZone" TEXT NOT NULL,
    "equipmentList" JSONB NOT NULL DEFAULT '[]',
    "circuitBreakerRating" INTEGER NOT NULL,
    "rcdProtected" BOOLEAN NOT NULL DEFAULT false,
    "extensionCordGauge" TEXT,
    "totalCircuitLoad" DOUBLE PRECISION,
    "circuitLoadSafe" BOOLEAN,
    "circuitLoadWarning" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CircuitAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FireSmokeDamageAssessment" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "structuralStability" "StructuralStability",
    "electricalDisconnectVerified" BOOLEAN NOT NULL DEFAULT false,
    "gasShutoffVerified" BOOLEAN NOT NULL DEFAULT false,
    "charringDepthMm" DOUBLE PRECISION,
    "engineerClearanceRequired" BOOLEAN NOT NULL DEFAULT false,
    "smokeResidueType" "SmokeResidueType",
    "residueLocation" TEXT,
    "surfacePH" DOUBLE PRECISION,
    "pHMeterModel" TEXT,
    "odourSeverityScore" INTEGER,
    "hvacAffected" BOOLEAN NOT NULL DEFAULT false,
    "odourType" "OdourType",
    "ozoneTreatmentDuration" DOUBLE PRECISION,
    "ozoneConcentrationPpm" DOUBLE PRECISION,
    "evacuationOrderTimestamp" TIMESTAMPTZ,
    "reentryApprovalTimestamp" TIMESTAMPTZ,
    "spaceVolumeM3" DOUBLE PRECISION,
    "gateStructuralCleared" BOOLEAN NOT NULL DEFAULT false,
    "gateElectricalCleared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FireSmokeDamageAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MouldRemediationAssessment" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "mouldConditionLevel" "MouldConditionLevel",
    "visibleGrowthObserved" BOOLEAN NOT NULL DEFAULT false,
    "affectedAreaM2" DOUBLE PRECISION,
    "moistureSourceIdentified" BOOLEAN NOT NULL DEFAULT false,
    "rootCauseAddressed" BOOLEAN NOT NULL DEFAULT false,
    "pressureDifferentialPa" DOUBLE PRECISION,
    "airChangesPerHour" DOUBLE PRECISION,
    "containmentBarrierMaterial" TEXT,
    "negativePressureMachineModel" TEXT,
    "airSamplingRequired" BOOLEAN NOT NULL DEFAULT false,
    "samplingDate" TIMESTAMPTZ,
    "labName" TEXT,
    "labReportReference" TEXT,
    "sporeType" TEXT,
    "sporeCountPreRemediation" DOUBLE PRECISION,
    "outdoorBaselineCount" DOUBLE PRECISION,
    "sporeCountPostRemediation" DOUBLE PRECISION,
    "clearanceCriterion" TEXT,
    "iepAssessmentRequired" BOOLEAN NOT NULL DEFAULT false,
    "gateMoistureSourceFixed" BOOLEAN NOT NULL DEFAULT false,
    "gateContainmentSufficient" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MouldRemediationAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentsPackOutItem" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "itemDescription" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "ageYears" INTEGER,
    "conditionPreLoss" "ConditionGrade",
    "conditionPostLoss" "ConditionGrade",
    "replacementValueAud" DECIMAL(10,2),
    "restorationCostEstimate" DECIMAL(10,2),
    "packOutDecision" "PackOutDecision",
    "packOutTag" TEXT,
    "beforePhotoUrl" TEXT,
    "afterPhotoUrl" TEXT,
    "claimType" "ClaimType",
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentsPackOutItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StormDamageAssessment" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "bomEventReference" TEXT,
    "windSpeedKmh" DOUBLE PRECISION,
    "eventType" "StormEventType",
    "eventTimestamp" TIMESTAMPTZ,
    "roofMaterialType" "RoofMaterialType",
    "roofDamageAreaM2" DOUBLE PRECISION,
    "damagePenetration" "DamagePenetration",
    "waterIngressPoints" TEXT,
    "engineerClearanceRequired" BOOLEAN NOT NULL DEFAULT false,
    "emergencyTarpingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "emergencyTarpingM2" DOUBLE PRECISION,
    "emergencyTarpingTimestamp" TIMESTAMPTZ,
    "waterCategory" "WaterCategory",
    "asbestosRiskFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StormDamageAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiohazardAssessment" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "biohazardType" "BiohazardType",
    "contaminationAreaM2" DOUBLE PRECISION,
    "atpReadingPre" DOUBLE PRECISION,
    "atpReadingPost" DOUBLE PRECISION,
    "swmsCompleted" BOOLEAN NOT NULL DEFAULT false,
    "ppeLevel" "PPELevel",
    "wasteDisposalManifestId" TEXT,
    "disposalFacilityLicense" TEXT,
    "disposalCertificateUrl" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BiohazardAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarpetRestorationAssessment" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "fiberType" "CarpetFiberType",
    "pileType" "CarpetPileType",
    "backingType" TEXT,
    "standingWaterHours" DOUBLE PRECISION,
    "extractionRateLitresPerHour" DOUBLE PRECISION,
    "extractionPasses" INTEGER,
    "residualMoisturePostExtraction" DOUBLE PRECISION,
    "delaminationTestResult" TEXT,
    "finalMoisturePercent" DOUBLE PRECISION,
    "stainType" TEXT,
    "stainPH" DOUBLE PRECISION,
    "stainTreatmentProduct" TEXT,
    "stainRemovalResult" "StainRemovalResult",
    "restorationDecision" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarpetRestorationAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HVACAssessment" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "hvacSystemInspected" BOOLEAN NOT NULL DEFAULT false,
    "ductContaminationLevel" "HVACContaminationLevel",
    "visibleSootInDucts" BOOLEAN NOT NULL DEFAULT false,
    "smokeOdourInDucts" BOOLEAN NOT NULL DEFAULT false,
    "filterCondition" TEXT,
    "coilContaminationLevel" "HVACContaminationLevel",
    "hvacCleaningRequired" BOOLEAN NOT NULL DEFAULT false,
    "insulationResistanceMegaohm" DOUBLE PRECISION,
    "insulationTestPerformedBy" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HVACAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AustralianComplianceRecord" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "insurerName" TEXT,
    "claimNumber" TEXT,
    "lossAdjusterName" TEXT,
    "lossAdjusterReference" TEXT,
    "nrpgCategory" "NRPGCategory",
    "iicrcCertifiedTechnician" BOOLEAN NOT NULL DEFAULT false,
    "technicianCertification" "TechnicianCertification",
    "technicianLicenseNumber" TEXT,
    "state" "AustralianState",
    "propertyYearBuilt" INTEGER,
    "asbestosRiskAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "friableAssessment" TEXT,
    "workHalted" BOOLEAN NOT NULL DEFAULT false,
    "licensedAssessorName" TEXT,
    "licensedAssessorLicense" TEXT,
    "removalQuoteAud" DECIMAL(10,2),
    "separateInvoiceRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AustralianComplianceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffectedArea" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "roomZoneId" TEXT NOT NULL,
    "affectedSquareFootage" DOUBLE PRECISION NOT NULL,
    "affectedAreaSqm" DOUBLE PRECISION,
    "waterSource" TEXT NOT NULL,
    "timeSinceLoss" DOUBLE PRECISION,
    "category" TEXT,
    "class" TEXT,
    "description" TEXT,
    "photos" TEXT,
    "roomId" TEXT,
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
    "clauseRef" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "xeroAccountCode" TEXT,
    "rateSource" TEXT,
    "suggestedRate" DOUBLE PRECISION,
    "roomId" TEXT,
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
    "damageCategory" TEXT,
    "damageClass" TEXT,
    "s500SectionRef" TEXT,
    "roomType" TEXT,
    "moistureSource" TEXT,
    "affectedMaterial" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "surfaceOrientation" TEXT,
    "damageExtentEstimate" TEXT,
    "equipmentVisible" BOOLEAN NOT NULL DEFAULT false,
    "secondaryDamageIndicators" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photoStage" TEXT,
    "captureAngle" TEXT,
    "labelledBy" TEXT NOT NULL DEFAULT 'HUMAN_TECH',
    "technicianNotes" TEXT,
    "moistureReadingLink" TEXT,
    "aiLabels" JSONB,
    "aiConfidence" DOUBLE PRECISION,
    "aiModel" TEXT,
    "aiRunAt" TIMESTAMP(3),
    "roomId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "mobileLocalId" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cocoaSha256" TEXT,
    "cocoaCapturedAtUtc" TIMESTAMP(3),
    "cocoaUserHash" TEXT,
    "cocoaDeviceHint" TEXT,

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
CREATE TABLE "VoiceCopilotSession" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'idle',
    "missingItems" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceCopilotSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceCopilotObservation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rawTranscript" TEXT NOT NULL,
    "parsed" JSONB NOT NULL,
    "confidence" TEXT NOT NULL,
    "needsConfirmation" BOOLEAN NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "storedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceCopilotObservation_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "GateCheck" (
    "id" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "taskId" TEXT,
    "qualityScore" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "dimensions" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "telegramSent" BOOLEAN NOT NULL DEFAULT false,
    "rawResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateCheck_pkey" PRIMARY KEY ("id")
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
    "reportTitleSnapshot" VARCHAR(256),
    "reportAddressSnapshot" VARCHAR(512),
    "estimateRefSnapshot" VARCHAR(128),
    "clientNameSnapshot" VARCHAR(256),
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "originalInvoiceId" TEXT,
    "recurringInvoiceId" TEXT,
    "templateId" TEXT,
    "externalInvoiceId" TEXT,
    "externalSyncProvider" TEXT,
    "externalSyncStatus" "ExternalSyncStatus",
    "externalSyncedAt" TIMESTAMP(3),
    "externalSyncError" TEXT,
    "externalSyncRetryCount" INTEGER NOT NULL DEFAULT 0,
    "pdfUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "publicToken" TEXT,
    "publicViewCount" INTEGER NOT NULL DEFAULT 0,
    "publicTokenExpiresAt" TIMESTAMP(3),
    "publicTokenRotatedAt" TIMESTAMP(3),
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
    "xeroAccountCode" TEXT,
    "subtotal" INTEGER NOT NULL,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "gstAmount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "discountAmount" INTEGER DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPassThrough" BOOLEAN NOT NULL DEFAULT false,
    "taxType" TEXT NOT NULL DEFAULT 'OUTPUT',
    "code" TEXT,
    "unit" TEXT,
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
CREATE TABLE "SupportTicketReply" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentToEmail" TEXT NOT NULL,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppRelease" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "commitSha" TEXT,
    "githubDeliveryId" TEXT,
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserReleaseSeen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReleaseSeen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "evidenceClass" "EvidenceClass" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "capturedById" TEXT NOT NULL,
    "capturedByName" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedLat" DOUBLE PRECISION,
    "capturedLng" DOUBLE PRECISION,
    "deviceId" TEXT,
    "deviceType" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "fileMimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "thumbnailUrl" TEXT,
    "roomName" TEXT,
    "structuredData" TEXT,
    "workflowStepId" TEXT,
    "affectedAreaId" TEXT,
    "hashSha256" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "status" "EvidenceItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionWorkflow" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "experienceLevel" TEXT NOT NULL DEFAULT 'APPRENTICE',
    "currentStepOrder" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "completedSteps" INTEGER NOT NULL DEFAULT 0,
    "skippedSteps" INTEGER NOT NULL DEFAULT 0,
    "isReadyToSubmit" BOOLEAN NOT NULL DEFAULT false,
    "submissionScore" DOUBLE PRECISION,
    "lastValidatedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "stepKey" TEXT NOT NULL,
    "stepTitle" TEXT NOT NULL,
    "stepDescription" TEXT,
    "stepDescriptionShort" TEXT,
    "requiredEvidenceClasses" TEXT NOT NULL,
    "optionalEvidenceClasses" TEXT,
    "minimumEvidenceCount" INTEGER NOT NULL DEFAULT 1,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "riskTier" INTEGER NOT NULL DEFAULT 1,
    "escalationNote" TEXT,
    "status" "WorkflowStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionReason" (
    "id" TEXT NOT NULL,
    "evidenceItemId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonText" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notifiedAdminAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExceptionReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageMirrorJob" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" "MirrorJobKind" NOT NULL,
    "status" "MirrorJobStatus" NOT NULL DEFAULT 'PENDING',
    "photoId" TEXT,
    "reportId" TEXT,
    "invoiceId" TEXT,
    "inspectionId" TEXT,
    "sourceStoragePath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "driveFileId" TEXT,
    "driveViewUrl" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StorageMirrorJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageRestoreJob" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sourceMirrorJobId" TEXT NOT NULL,
    "kind" "MirrorJobKind" NOT NULL,
    "mode" "RestoreMode" NOT NULL DEFAULT 'MISSING',
    "status" "RestoreJobStatus" NOT NULL DEFAULT 'PENDING',
    "sourceStoragePath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "initiatedByUserId" TEXT,
    "expectedSha256" TEXT,
    "restoredSha256" TEXT,
    "restoredBytes" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StorageRestoreJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'PROVISIONING',
    "tenantDbStatus" TEXT NOT NULL DEFAULT 'none',
    "tenantDbConnectionEnc" TEXT,
    "tenantDbProvisionPhase" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "aiDailyBudgetUsd" DOUBLE PRECISION,
    "autoFetchFloorPlanOnInspection" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "WorkspaceMemberStatus" NOT NULL DEFAULT 'INVITED',
    "joinedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceRole" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberRoleBinding" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "MemberRoleBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAssetTag" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "inspectionId" TEXT,
    "evidenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAssetTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timezone" TEXT,
    "deviceMake" TEXT,
    "deviceModel" TEXT,
    "software" TEXT,
    "lensModel" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "orientation" INTEGER,
    "colorSpace" TEXT,
    "dpiX" DOUBLE PRECISION,
    "dpiY" DOUBLE PRECISION,
    "focalLength" DOUBLE PRECISION,
    "aperture" DOUBLE PRECISION,
    "exposureTime" TEXT,
    "iso" INTEGER,
    "flash" BOOLEAN,
    "durationSeconds" DOUBLE PRECISION,
    "videoWidth" INTEGER,
    "videoHeight" INTEGER,
    "videoCodec" TEXT,
    "frameRate" DOUBLE PRECISION,
    "rawExifData" JSONB,
    "altText" TEXT,
    "seoJsonLd" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "status" "ProviderConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "encryptedCredentials" TEXT NOT NULL,
    "lastValidatedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdByMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureEntitlement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sku" "AddonSku" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "seats" INTEGER,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapingProviderConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "ScrapingProvider" NOT NULL,
    "status" "ProviderConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "encryptedCredentials" TEXT NOT NULL,
    "encryptedConfig" TEXT,
    "lastValidatedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdByMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapingProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT,
    "provider" "AiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorType" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IicrcChunk" (
    "id" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "embedding" vector(1536),
    "provenance" "ChunkProvenance" NOT NULL DEFAULT 'AUTHORITATIVE_STANDARD',
    "jurisdiction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IicrcChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimSketch" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "floorNumber" INTEGER NOT NULL DEFAULT 0,
    "floorLabel" TEXT NOT NULL DEFAULT 'Ground Floor',
    "sketchType" TEXT NOT NULL DEFAULT 'structural',
    "sketchData" JSONB,
    "backgroundImageUrl" TEXT,
    "renderedPngUrl" TEXT,
    "backgroundImageOpacity" DOUBLE PRECISION,
    "backgroundImageScale" DOUBLE PRECISION,
    "backgroundImageOffsetX" DOUBLE PRECISION,
    "backgroundImageOffsetY" DOUBLE PRECISION,
    "moisturePoints" JSONB,
    "equipmentPoints" JSONB,
    "pendingHomeownerCapture" JSONB,
    "totalFloorAreaM2" DOUBLE PRECISION,
    "country" TEXT NOT NULL DEFAULT 'AU',
    "captureAdapter" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimSketch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SketchRoom" (
    "id" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "fabricObjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Room',
    "areaM2" DOUBLE PRECISION,
    "perimeterM" DOUBLE PRECISION,
    "heightM" DOUBLE PRECISION,
    "floorNumber" INTEGER NOT NULL DEFAULT 0,
    "materialSlug" TEXT,
    "waterCategory" TEXT,
    "dryingStatus" TEXT NOT NULL DEFAULT 'unknown',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "geometryJson" JSONB,
    "provenance" TEXT NOT NULL DEFAULT 'operator_measured',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SketchRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomPlanCaptureReceipt" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "clientCustodyId" TEXT,
    "floorNumber" INTEGER NOT NULL DEFAULT 0,
    "payloadJson" JSONB NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "clientSha256" TEXT,
    "evidenceItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomPlanCaptureReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidencePin" (
    "id" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "sketchRoomId" TEXT,
    "inspectionPhotoId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'photo',
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "nx" DOUBLE PRECISION,
    "ny" DOUBLE PRECISION,
    "rotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fileUrl" TEXT,
    "thumbnailUrl" TEXT,
    "fileName" TEXT,
    "fileMimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "caption" TEXT,
    "capturedByUserId" TEXT,
    "captureSource" TEXT NOT NULL DEFAULT 'web',
    "offlineQueued" BOOLEAN NOT NULL DEFAULT false,
    "syncState" TEXT NOT NULL DEFAULT 'synced',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidencePin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SketchAnnotation" (
    "id" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SketchAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SketchElement" (
    "id" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "geometryJson" JSONB NOT NULL,
    "dimensionsM" JSONB,
    "materialId" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'operator_measured',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SketchElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptureToken" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptureToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientEvidenceSubmission" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "fileMimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "ClientEvidenceSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT[],
    "dryStandardMc" DOUBLE PRECISION NOT NULL,
    "isPotentialAcm" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hazard" (
    "id" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "elementId" TEXT,
    "sketchRoomId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'suspected',
    "whsPathwayNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hazard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceContext" (
    "id" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "pathway" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SketchMoistureReading" (
    "id" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "elementId" TEXT,
    "sketchRoomId" TEXT,
    "materialId" TEXT,
    "waterCategory" TEXT,
    "targetMc" DOUBLE PRECISION,
    "currentMc" DOUBLE PRECISION NOT NULL,
    "dryStandardMet" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "readingDatetime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SketchMoistureReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AscoraIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "webhookSecret" TEXT,
    "baseUrl" TEXT NOT NULL DEFAULT 'https://api.ascora.com.au',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastWebhookAt" TIMESTAMP(3),
    "totalJobsImported" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AscoraIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AscoraJob" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "ascoraJobId" TEXT NOT NULL,
    "ascoraJobNumber" TEXT,
    "jobType" TEXT,
    "claimType" TEXT,
    "suburb" TEXT,
    "state" TEXT,
    "postcode" TEXT,
    "completedAt" TIMESTAMP(3),
    "sentToMyob" BOOLEAN NOT NULL DEFAULT false,
    "totalExTax" DOUBLE PRECISION,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "labourSyncedAt" TIMESTAMP(3),

    CONSTRAINT "AscoraJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AscoraLineItem" (
    "id" TEXT NOT NULL,
    "ascoraJobId" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPriceExTax" DOUBLE PRECISION NOT NULL,
    "amountExTax" DOUBLE PRECISION NOT NULL,
    "invoiceDate" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AscoraLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AscoraNote" (
    "id" TEXT NOT NULL,
    "ascoraJobId" TEXT NOT NULL,
    "noteText" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AscoraNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopePricingDatabase" (
    "id" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "claimTypes" TEXT[],
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "averageUnitPriceAU" DOUBLE PRECISION NOT NULL,
    "medianUnitPriceAU" DOUBLE PRECISION,
    "minPriceAU" DOUBLE PRECISION,
    "maxPriceAU" DOUBLE PRECISION,
    "averageQuantity" DOUBLE PRECISION,
    "acceptanceRate" DOUBLE PRECISION,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "priceHistory" JSONB,
    "source" TEXT NOT NULL DEFAULT 'ascora',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScopePricingDatabase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrNrpgIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "drNrpgApiKey" TEXT NOT NULL,
    "drNrpgBaseUrl" TEXT NOT NULL DEFAULT 'https://api.dr-nrpg.com.au',
    "webhookSecret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrNrpgIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrNrpgJobSync" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "drNrpgJobId" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "insurer" TEXT,
    "policyHolder" TEXT,
    "propertyAddress" TEXT,
    "lossType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'dispatched',
    "lastEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventType" TEXT,
    "syncErrors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrNrpgJobSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrNrpgWebhookLog" (
    "id" TEXT NOT NULL,
    "jobSyncId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DrNrpgWebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrNrpgWebhookEvent" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "drNrpgJobId" TEXT NOT NULL,
    "eventTimestamp" TIMESTAMP(3) NOT NULL,
    "eventType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrNrpgWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DryingGoalRecord" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "targetCategory" TEXT NOT NULL,
    "targetClass" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "materialTargets" JSONB NOT NULL,
    "goalAchieved" BOOLEAN NOT NULL DEFAULT false,
    "goalAchievedAt" TIMESTAMP(3),
    "totalDryingDays" INTEGER,
    "finalReadingsSnapshot" JSONB,
    "iicrcReference" TEXT NOT NULL DEFAULT 'IICRC S500:2021 §12.5.7',
    "signedOffBy" TEXT,
    "signedOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DryingGoalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCommsLog" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "suppressionReason" TEXT,
    "providerMessageId" TEXT,
    "templateKey" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientCommsLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "waterCategory" TEXT,
    "waterClass" TEXT,
    "address" TEXT,
    "suburb" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "customerName" TEXT,
    "totalExTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalIncTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "equipmentCount" INTEGER NOT NULL DEFAULT 0,
    "classificationSource" TEXT,
    "insurerName" TEXT,
    "claimNumber" TEXT,
    "scopeOfWorks" TEXT,
    "totalLabourHours" DOUBLE PRECISION,
    "durationDays" INTEGER,
    "embeddingVector" vector(1536),
    "embeddingModel" TEXT,
    "embeddedAt" TIMESTAMPTZ,

    CONSTRAINT "HistoricalJob_pkey" PRIMARY KEY ("id")
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
    "startCompletionPct" INTEGER,
    "finalCompletionPct" INTEGER,

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
    "provenance" "ChunkProvenance" NOT NULL DEFAULT 'AUTHORITATIVE_STANDARD',

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
CREATE TABLE "ClaimProgress" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "currentState" "ClaimState" NOT NULL DEFAULT 'INTAKE',
    "previousState" "ClaimState",
    "version" INTEGER NOT NULL DEFAULT 0,
    "primaryTechnicianId" TEXT,
    "primaryManagerId" TEXT,
    "accountingUserId" TEXT,
    "carrierContactEmail" TEXT,
    "legalUserId" TEXT,
    "carrierVariationThresholdPercent" INTEGER,
    "managerReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "managerReviewRequiredAt" TIMESTAMP(3),
    "managerReviewedByUserId" TEXT,
    "managerReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ClaimProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressTransition" (
    "id" TEXT NOT NULL,
    "claimProgressId" TEXT NOT NULL,
    "transitionKey" TEXT NOT NULL,
    "fromState" "ClaimState" NOT NULL,
    "toState" "ClaimState" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorIp" TEXT,
    "guardSnapshot" JSONB NOT NULL,
    "integrationReceipts" JSONB,
    "integrityHash" TEXT NOT NULL,
    "softGaps" JSONB,
    "auditGaps" JSONB,
    "transitionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressAttestation" (
    "id" TEXT NOT NULL,
    "claimProgressId" TEXT NOT NULL,
    "transitionId" TEXT,
    "attestorUserId" TEXT NOT NULL,
    "attestorRole" TEXT NOT NULL,
    "attestorName" TEXT NOT NULL,
    "attestorEmail" TEXT NOT NULL,
    "attestationType" TEXT NOT NULL,
    "attestationNote" TEXT,
    "docusignEnvelopeId" TEXT,
    "docusignStatus" TEXT,
    "signatureDataUrl" TEXT,
    "integrityHash" TEXT NOT NULL,
    "labourHireHours" DECIMAL(6,2),
    "labourHireAwardClass" TEXT,
    "labourHireSuperRate" DECIMAL(5,4),
    "labourHirePortableLslState" TEXT,
    "labourHireInductionEvidenceId" TEXT,
    "consentTokenId" TEXT,
    "signerIp" TEXT,
    "signerUserAgent" TEXT,
    "contentHash" TEXT,
    "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttestationConsentToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "attestationType" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttestationConsentToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverrideGovernanceReport" (
    "id" TEXT NOT NULL,
    "reportMonth" DATE NOT NULL,
    "gateKey" TEXT NOT NULL,
    "transitionCount" INTEGER NOT NULL,
    "overrideCount" INTEGER NOT NULL,
    "overrideRate" DOUBLE PRECISION NOT NULL,
    "isBreached" BOOLEAN NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OverrideGovernanceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressTelemetryEvent" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "claimProgressId" TEXT,
    "transitionId" TEXT,
    "transitionKey" TEXT,
    "gateKey" TEXT,
    "userId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressTelemetryEvent_pkey" PRIMARY KEY ("id")
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
    "subjectLicenceClassEnum" "AuthorisationLicenceClass",
    "publicLiabilityInsurer" TEXT,
    "publicLiabilityPolicyNumber" TEXT,
    "publicLiabilityCoverAmount" DECIMAL(12,2),
    "workCoverPolicyNumber" TEXT,
    "whsCardNumber" TEXT,
    "whsCardExpiry" TIMESTAMP(3),
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

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthHandoffToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encodedJwt" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthHandoffToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HydrationJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "HydrationKind" NOT NULL,
    "status" "HydrationStatus" NOT NULL,
    "payload" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "HydrationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbnLookupCache" (
    "abn" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbnLookupCache_pkey" PRIMARY KEY ("abn")
);

-- CreateTable
CREATE TABLE "OrganizationPricingConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
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
    "negativeAirMachineDailyRate" DOUBLE PRECISION,
    "hepaVacuumDailyRate" DOUBLE PRECISION,
    "monitoringVisitDailyRate" DOUBLE PRECISION,
    "mobilisationFee" DOUBLE PRECISION,
    "wasteDisposalPerBinRate" DOUBLE PRECISION,
    "photoDocumentationFee" DOUBLE PRECISION,
    "afterHoursMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "saturdayMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "sundayMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "publicHolidayMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "projectManagementPercent" DOUBLE PRECISION NOT NULL DEFAULT 8.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationPricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVariant" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "claimType" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentVariantId" TEXT,
    "compositeScore" DOUBLE PRECISION,
    "structuralScore" DOUBLE PRECISION,
    "citationScore" DOUBLE PRECISION,
    "equipmentScore" DOUBLE PRECISION,
    "specificityScore" DOUBLE PRECISION,
    "categoryScore" DOUBLE PRECISION,
    "isProduction" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationRun" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "promptVariantId" TEXT,
    "testCaseId" TEXT NOT NULL,
    "generatedScope" TEXT NOT NULL,
    "compositeScore" DOUBLE PRECISION NOT NULL,
    "structuralScore" DOUBLE PRECISION,
    "citationScore" DOUBLE PRECISION,
    "equipmentScore" DOUBLE PRECISION,
    "specificityScore" DOUBLE PRECISION,
    "categoryScore" DOUBLE PRECISION,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costAud" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationRun_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "stripeEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "responseContentType" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitHit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientMutation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "inspectionId" TEXT,
    "mutationId" TEXT NOT NULL,
    "mutationType" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "errorCode" TEXT,
    "clientCreatedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientMutation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldCaptureEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "inspectionId" TEXT,
    "clientMutationId" TEXT,
    "eventId" TEXT,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "fieldPath" TEXT,
    "value" JSONB,
    "metadata" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldCaptureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurerProfile" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredEvidenceClasses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredEvidenceClasses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minPhotoCount" INTEGER NOT NULL DEFAULT 5,
    "reportFormat" "InsurerReportFormat" NOT NULL DEFAULT 'STANDARD',
    "requiresSignedScope" BOOLEAN NOT NULL DEFAULT false,
    "requiresThirdPartyScope" BOOLEAN NOT NULL DEFAULT false,
    "preferredInvoiceFormat" TEXT,
    "gstRegistrationRequired" BOOLEAN NOT NULL DEFAULT true,
    "claimsEmailDomain" TEXT,
    "portalUrl" TEXT,
    "specialInstructions" TEXT,
    "iicrcComplianceNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystemProfile" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RoomType" NOT NULL DEFAULT 'OTHER',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "thumbnailUrl" TEXT,
    "floorPlanData" TEXT,
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomAnnotation" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "type" "AnnotationType" NOT NULL,
    "data" TEXT NOT NULL,
    "photoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abn" TEXT,
    "logoUrl" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "insuranceCertificateNumber" TEXT,
    "insuranceExpiry" TIMESTAMP(3),
    "licenceNumber" TEXT,
    "licenceClass" TEXT,
    "licenceExpiry" TIMESTAMP(3),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentDeployment" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "manufacturer" TEXT,
    "make" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "deploymentLocation" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "operatingHours" DOUBLE PRECISION,
    "runHours" DOUBLE PRECISION,
    "ampDraw" DOUBLE PRECISION,
    "notes" TEXT,
    "mobileLocalId" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileInspection" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "mobileLocalId" TEXT NOT NULL,
    "jobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "category" TEXT,
    "damageClass" TEXT,
    "propertyAddress" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notes" TEXT DEFAULT '',
    "userId" TEXT NOT NULL,
    "nirInspectionId" TEXT,
    "reportId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "MobileInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoistureMeter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "lastCalibrationDate" TIMESTAMP(3),
    "calibrationMethod" TEXT,
    "calibrationCertRef" TEXT,
    "calibrationExpiryDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoistureMeter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceModel" TEXT,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyEvent" (
    "id" TEXT NOT NULL,
    "evidenceItemId" TEXT NOT NULL,
    "action" "CustodyAction" NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT,
    "contentHash" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustodyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientInvite" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "inspectionId" TEXT NOT NULL,
    "clientEmail" TEXT NOT NULL,
    "clientName" TEXT,
    "token" TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'::text),
    "expiresAt" TIMESTAMPTZ NOT NULL DEFAULT (now() + '30 days'::interval),
    "firstAccessedAt" TIMESTAMPTZ,
    "revokedAt" TIMESTAMPTZ,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ClientInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalContent" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'customer',
    "category" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "mdxContent" TEXT NOT NULL,
    "videoSlug" TEXT,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_subscriptionId_key" ON "User"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "User_managedById_idx" ON "User"("managedById");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "User_subscriptionTierId_idx" ON "User"("subscriptionTierId");

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
CREATE INDEX "Client_userId_createdAt_idx" ON "Client"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Client_workspaceId_idx" ON "Client"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_userId_email_key" ON "Client"("userId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ClientUser_email_key" ON "ClientUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ClientUser_clientId_key" ON "ClientUser"("clientId");

-- CreateIndex
CREATE INDEX "ClientUser_email_idx" ON "ClientUser"("email");

-- CreateIndex
CREATE INDEX "ClientUser_clientId_idx" ON "ClientUser"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalAccount_token_key" ON "ClientPortalAccount"("token");

-- CreateIndex
CREATE INDEX "ClientPortalAccount_clientId_idx" ON "ClientPortalAccount"("clientId");

-- CreateIndex
CREATE INDEX "ClientPortalAccount_token_idx" ON "ClientPortalAccount"("token");

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
CREATE INDEX "ReportApproval_status_idx" ON "ReportApproval"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReportApproval_reportId_approvalType_key" ON "ReportApproval"("reportId", "approvalType");

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
CREATE INDEX "Report_workspaceId_idx" ON "Report"("workspaceId");

-- CreateIndex
CREATE INDEX "Report_assignedAdminId_idx" ON "Report"("assignedAdminId");

-- CreateIndex
CREATE INDEX "Report_assignedManagerId_idx" ON "Report"("assignedManagerId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_abn_key" ON "Organization"("abn");

-- CreateIndex
CREATE INDEX "Organization_ownerId_idx" ON "Organization"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserInvite_token_key" ON "UserInvite"("token");

-- CreateIndex
CREATE INDEX "UserInvite_email_idx" ON "UserInvite"("email");

-- CreateIndex
CREATE INDEX "UserInvite_organizationId_idx" ON "UserInvite"("organizationId");

-- CreateIndex
CREATE INDEX "UserInvite_createdById_idx" ON "UserInvite"("createdById");

-- CreateIndex
CREATE INDEX "UserInvite_managedById_idx" ON "UserInvite"("managedById");

-- CreateIndex
CREATE INDEX "Integration_userId_idx" ON "Integration"("userId");

-- CreateIndex
CREATE INDEX "Integration_provider_idx" ON "Integration"("provider");

-- CreateIndex
CREATE INDEX "Integration_status_idx" ON "Integration"("status");

-- CreateIndex
CREATE INDEX "Integration_workspaceId_idx" ON "Integration"("workspaceId");

-- CreateIndex
CREATE INDEX "Integration_userId_status_idx" ON "Integration"("userId", "status");

-- CreateIndex
CREATE INDEX "Integration_tenantId_idx" ON "Integration"("tenantId");

-- CreateIndex
CREATE INDEX "Integration_realmId_idx" ON "Integration"("realmId");

-- CreateIndex
CREATE INDEX "Integration_companyId_idx" ON "Integration"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_userId_workspaceId_provider_key" ON "Integration"("userId", "workspaceId", "provider");

-- CreateIndex
CREATE INDEX "CostLibrary_userId_idx" ON "CostLibrary"("userId");

-- CreateIndex
CREATE INDEX "CostLibrary_workspaceId_idx" ON "CostLibrary"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CostLibrary_userId_name_key" ON "CostLibrary"("userId", "name");

-- CreateIndex
CREATE INDEX "CostItem_libraryId_idx" ON "CostItem"("libraryId");

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
CREATE INDEX "ExternalJob_integrationId_clientExternalId_idx" ON "ExternalJob"("integrationId", "clientExternalId");

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
CREATE INDEX "WebhookEvent_provider_integrationId_idx" ON "WebhookEvent"("provider", "integrationId");

-- CreateIndex
CREATE INDEX "WebhookEvent_processedAt_idx" ON "WebhookEvent"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_externalEventId_key" ON "WebhookEvent"("provider", "externalEventId");

-- CreateIndex
CREATE INDEX "XeroAccountCodeMapping_integrationId_idx" ON "XeroAccountCodeMapping"("integrationId");

-- CreateIndex
CREATE INDEX "XeroAccountCodeMapping_integrationId_accountCode_idx" ON "XeroAccountCodeMapping"("integrationId", "accountCode");

-- CreateIndex
CREATE UNIQUE INDEX "XeroAccountCodeMapping_integrationId_category_key" ON "XeroAccountCodeMapping"("integrationId", "category");

-- CreateIndex
CREATE INDEX "XeroSyncStatus_userId_idx" ON "XeroSyncStatus"("userId");

-- CreateIndex
CREATE INDEX "XeroSyncStatus_state_nextRetryAt_idx" ON "XeroSyncStatus"("state", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "XeroSyncStatus_entityType_entityId_key" ON "XeroSyncStatus"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Scope_reportId_key" ON "Scope"("reportId");

-- CreateIndex
CREATE INDEX "Scope_userId_idx" ON "Scope"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_scopeId_key" ON "Estimate"("scopeId");

-- CreateIndex
CREATE INDEX "Estimate_reportId_createdAt_idx" ON "Estimate"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "Estimate_userId_idx" ON "Estimate"("userId");

-- CreateIndex
CREATE INDEX "EstimateLineItem_estimateId_idx" ON "EstimateLineItem"("estimateId");

-- CreateIndex
CREATE INDEX "EstimateLineItem_sourceCostItemId_idx" ON "EstimateLineItem"("sourceCostItemId");

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
CREATE INDEX "StandardTemplate_userId_idx" ON "StandardTemplate"("userId");

-- CreateIndex
CREATE INDEX "AssessmentGeneration_inspectionId_generatedAt_idx" ON "AssessmentGeneration"("inspectionId", "generatedAt");

-- CreateIndex
CREATE INDEX "AssessmentGeneration_assessmentType_generatedAt_idx" ON "AssessmentGeneration"("assessmentType", "generatedAt");

-- CreateIndex
CREATE INDEX "AssessmentGeneration_workspaceId_idx" ON "AssessmentGeneration"("workspaceId");

-- CreateIndex
CREATE INDEX "AssessmentGeneration_generatedById_idx" ON "AssessmentGeneration"("generatedById");

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
CREATE INDEX "Inspection_workspaceId_idx" ON "Inspection"("workspaceId");

-- CreateIndex
CREATE INDEX "Inspection_userId_createdAt_idx" ON "Inspection"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Inspection_userId_status_idx" ON "Inspection"("userId", "status");

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
CREATE INDEX "EnvironmentalData_inspectionId_idx" ON "EnvironmentalData"("inspectionId");

-- CreateIndex
CREATE INDEX "EnvironmentalData_inspectionId_recordedAt_idx" ON "EnvironmentalData"("inspectionId", "recordedAt");

-- CreateIndex
CREATE INDEX "MoistureReading_inspectionId_idx" ON "MoistureReading"("inspectionId");

-- CreateIndex
CREATE INDEX "MoistureReading_surfaceType_idx" ON "MoistureReading"("surfaceType");

-- CreateIndex
CREATE INDEX "MoistureReading_inspectionId_recordedAt_idx" ON "MoistureReading"("inspectionId", "recordedAt");

-- CreateIndex
CREATE INDEX "MoistureReading_inspectionId_isBaseline_idx" ON "MoistureReading"("inspectionId", "isBaseline");

-- CreateIndex
CREATE INDEX "MoistureReading_inspectionId_isMonitoringPoint_idx" ON "MoistureReading"("inspectionId", "isMonitoringPoint");

-- CreateIndex
CREATE INDEX "MoistureReading_inspectionId_affectedArea_idx" ON "MoistureReading"("inspectionId", "affectedArea");

-- CreateIndex
CREATE UNIQUE INDEX "WaterDamageClassification_inspectionId_key" ON "WaterDamageClassification"("inspectionId");

-- CreateIndex
CREATE INDEX "WaterDamageClassification_inspectionId_idx" ON "WaterDamageClassification"("inspectionId");

-- CreateIndex
CREATE INDEX "WaterDamageClassification_waterCategory_idx" ON "WaterDamageClassification"("waterCategory");

-- CreateIndex
CREATE INDEX "WaterDamageClassification_damageClass_idx" ON "WaterDamageClassification"("damageClass");

-- CreateIndex
CREATE UNIQUE INDEX "RestorationIncident_sourceInspectionHash_key" ON "RestorationIncident"("sourceInspectionHash");

-- CreateIndex
CREATE INDEX "RestorationIncident_state_postcode_idx" ON "RestorationIncident"("state", "postcode");

-- CreateIndex
CREATE INDEX "RestorationIncident_waterCategory_damageClass_idx" ON "RestorationIncident"("waterCategory", "damageClass");

-- CreateIndex
CREATE INDEX "RestorationIncident_capturedAt_idx" ON "RestorationIncident"("capturedAt");

-- CreateIndex
CREATE INDEX "PsychrometricReading_inspectionId_idx" ON "PsychrometricReading"("inspectionId");

-- CreateIndex
CREATE INDEX "PsychrometricReading_visitDate_idx" ON "PsychrometricReading"("visitDate");

-- CreateIndex
CREATE INDEX "PsychrometricReading_visitNumber_idx" ON "PsychrometricReading"("visitNumber");

-- CreateIndex
CREATE INDEX "CircuitAssessment_inspectionId_idx" ON "CircuitAssessment"("inspectionId");

-- CreateIndex
CREATE INDEX "CircuitAssessment_circuitLoadSafe_idx" ON "CircuitAssessment"("circuitLoadSafe");

-- CreateIndex
CREATE UNIQUE INDEX "FireSmokeDamageAssessment_inspectionId_key" ON "FireSmokeDamageAssessment"("inspectionId");

-- CreateIndex
CREATE INDEX "FireSmokeDamageAssessment_inspectionId_idx" ON "FireSmokeDamageAssessment"("inspectionId");

-- CreateIndex
CREATE INDEX "FireSmokeDamageAssessment_structuralStability_idx" ON "FireSmokeDamageAssessment"("structuralStability");

-- CreateIndex
CREATE UNIQUE INDEX "MouldRemediationAssessment_inspectionId_key" ON "MouldRemediationAssessment"("inspectionId");

-- CreateIndex
CREATE INDEX "MouldRemediationAssessment_inspectionId_idx" ON "MouldRemediationAssessment"("inspectionId");

-- CreateIndex
CREATE INDEX "MouldRemediationAssessment_mouldConditionLevel_idx" ON "MouldRemediationAssessment"("mouldConditionLevel");

-- CreateIndex
CREATE INDEX "ContentsPackOutItem_inspectionId_idx" ON "ContentsPackOutItem"("inspectionId");

-- CreateIndex
CREATE INDEX "ContentsPackOutItem_packOutDecision_idx" ON "ContentsPackOutItem"("packOutDecision");

-- CreateIndex
CREATE INDEX "ContentsPackOutItem_claimType_idx" ON "ContentsPackOutItem"("claimType");

-- CreateIndex
CREATE UNIQUE INDEX "StormDamageAssessment_inspectionId_key" ON "StormDamageAssessment"("inspectionId");

-- CreateIndex
CREATE INDEX "StormDamageAssessment_inspectionId_idx" ON "StormDamageAssessment"("inspectionId");

-- CreateIndex
CREATE INDEX "StormDamageAssessment_eventType_idx" ON "StormDamageAssessment"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "BiohazardAssessment_inspectionId_key" ON "BiohazardAssessment"("inspectionId");

-- CreateIndex
CREATE INDEX "BiohazardAssessment_inspectionId_idx" ON "BiohazardAssessment"("inspectionId");

-- CreateIndex
CREATE INDEX "BiohazardAssessment_biohazardType_idx" ON "BiohazardAssessment"("biohazardType");

-- CreateIndex
CREATE UNIQUE INDEX "CarpetRestorationAssessment_inspectionId_key" ON "CarpetRestorationAssessment"("inspectionId");

-- CreateIndex
CREATE INDEX "CarpetRestorationAssessment_inspectionId_idx" ON "CarpetRestorationAssessment"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "HVACAssessment_inspectionId_key" ON "HVACAssessment"("inspectionId");

-- CreateIndex
CREATE INDEX "HVACAssessment_inspectionId_idx" ON "HVACAssessment"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "AustralianComplianceRecord_inspectionId_key" ON "AustralianComplianceRecord"("inspectionId");

-- CreateIndex
CREATE INDEX "AustralianComplianceRecord_inspectionId_idx" ON "AustralianComplianceRecord"("inspectionId");

-- CreateIndex
CREATE INDEX "AustralianComplianceRecord_state_idx" ON "AustralianComplianceRecord"("state");

-- CreateIndex
CREATE INDEX "AustralianComplianceRecord_nrpgCategory_idx" ON "AustralianComplianceRecord"("nrpgCategory");

-- CreateIndex
CREATE INDEX "AffectedArea_inspectionId_idx" ON "AffectedArea"("inspectionId");

-- CreateIndex
CREATE INDEX "AffectedArea_category_idx" ON "AffectedArea"("category");

-- CreateIndex
CREATE INDEX "AffectedArea_class_idx" ON "AffectedArea"("class");

-- CreateIndex
CREATE INDEX "AffectedArea_roomId_idx" ON "AffectedArea"("roomId");

-- CreateIndex
CREATE INDEX "ScopeItem_inspectionId_idx" ON "ScopeItem"("inspectionId");

-- CreateIndex
CREATE INDEX "ScopeItem_itemType_idx" ON "ScopeItem"("itemType");

-- CreateIndex
CREATE INDEX "ScopeItem_autoDetermined_idx" ON "ScopeItem"("autoDetermined");

-- CreateIndex
CREATE INDEX "ScopeItem_roomId_idx" ON "ScopeItem"("roomId");

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
CREATE INDEX "AuditLog_inspectionId_timestamp_idx" ON "AuditLog"("inspectionId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "AdminImpersonation_tokenId_key" ON "AdminImpersonation"("tokenId");

-- CreateIndex
CREATE INDEX "AdminImpersonation_adminUserId_startedAt_idx" ON "AdminImpersonation"("adminUserId", "startedAt");

-- CreateIndex
CREATE INDEX "AdminImpersonation_targetUserId_startedAt_idx" ON "AdminImpersonation"("targetUserId", "startedAt");

-- CreateIndex
CREATE INDEX "AdminImpersonation_expiresAt_idx" ON "AdminImpersonation"("expiresAt");

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
CREATE INDEX "Citation_documentId_idx" ON "Citation"("documentId");

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
CREATE INDEX "InspectionPhoto_inspectionId_timestamp_idx" ON "InspectionPhoto"("inspectionId", "timestamp");

-- CreateIndex
CREATE INDEX "InspectionPhoto_roomType_idx" ON "InspectionPhoto"("roomType");

-- CreateIndex
CREATE INDEX "InspectionPhoto_damageCategory_idx" ON "InspectionPhoto"("damageCategory");

-- CreateIndex
CREATE INDEX "InspectionPhoto_photoStage_idx" ON "InspectionPhoto"("photoStage");

-- CreateIndex
CREATE INDEX "InspectionPhoto_roomId_idx" ON "InspectionPhoto"("roomId");

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
CREATE INDEX "UsageEvent_timestamp_idx" ON "UsageEvent"("timestamp");

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
CREATE INDEX "VoiceCopilotSession_inspectionId_startedAt_idx" ON "VoiceCopilotSession"("inspectionId", "startedAt");

-- CreateIndex
CREATE INDEX "VoiceCopilotSession_userId_startedAt_idx" ON "VoiceCopilotSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "VoiceCopilotSession_state_expiresAt_idx" ON "VoiceCopilotSession"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "VoiceCopilotObservation_sessionId_createdAt_idx" ON "VoiceCopilotObservation"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceCopilotObservation_type_idx" ON "VoiceCopilotObservation"("type");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyLookup_inspectionId_key" ON "PropertyLookup"("inspectionId");

-- CreateIndex
CREATE INDEX "PropertyLookup_expiresAt_idx" ON "PropertyLookup"("expiresAt");

-- CreateIndex
CREATE INDEX "PropertyLookup_inspectionId_idx" ON "PropertyLookup"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyLookup_propertyAddress_propertyPostcode_key" ON "PropertyLookup"("propertyAddress", "propertyPostcode");

-- CreateIndex
CREATE INDEX "CancellationFeedback_userId_idx" ON "CancellationFeedback"("userId");

-- CreateIndex
CREATE INDEX "CancellationFeedback_reason_idx" ON "CancellationFeedback"("reason");

-- CreateIndex
CREATE INDEX "CancellationFeedback_createdAt_idx" ON "CancellationFeedback"("createdAt");

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
CREATE UNIQUE INDEX "OAuthStateNonce_nonce_key" ON "OAuthStateNonce"("nonce");

-- CreateIndex
CREATE INDEX "OAuthStateNonce_expiresAt_idx" ON "OAuthStateNonce"("expiresAt");

-- CreateIndex
CREATE INDEX "OAuthStateNonce_userId_provider_idx" ON "OAuthStateNonce"("userId", "provider");

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
CREATE INDEX "GateCheck_projectKey_createdAt_idx" ON "GateCheck"("projectKey", "createdAt");

-- CreateIndex
CREATE INDEX "GateCheck_decision_createdAt_idx" ON "GateCheck"("decision", "createdAt");

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
CREATE INDEX "Invoice_workspaceId_idx" ON "Invoice"("workspaceId");

-- CreateIndex
CREATE INDEX "Invoice_originalInvoiceId_idx" ON "Invoice"("originalInvoiceId");

-- CreateIndex
CREATE INDEX "Invoice_recurringInvoiceId_idx" ON "Invoice"("recurringInvoiceId");

-- CreateIndex
CREATE INDEX "Invoice_templateId_idx" ON "Invoice"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_externalSyncProvider_externalInvoiceId_key" ON "Invoice"("externalSyncProvider", "externalInvoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_sortOrder_idx" ON "InvoiceLineItem"("invoiceId", "sortOrder");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_estimateLineItemId_idx" ON "InvoiceLineItem"("estimateLineItemId");

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
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "SupportTicket_email_idx" ON "SupportTicket"("email");

-- CreateIndex
CREATE INDEX "SupportTicketReply_ticketId_idx" ON "SupportTicketReply"("ticketId");

-- CreateIndex
CREATE INDEX "SupportTicketReply_sentById_idx" ON "SupportTicketReply"("sentById");

-- CreateIndex
CREATE UNIQUE INDEX "AppRelease_version_key" ON "AppRelease"("version");

-- CreateIndex
CREATE UNIQUE INDEX "AppRelease_githubDeliveryId_key" ON "AppRelease"("githubDeliveryId");

-- CreateIndex
CREATE INDEX "AppRelease_createdAt_idx" ON "AppRelease"("createdAt");

-- CreateIndex
CREATE INDEX "UserReleaseSeen_userId_idx" ON "UserReleaseSeen"("userId");

-- CreateIndex
CREATE INDEX "UserReleaseSeen_releaseId_idx" ON "UserReleaseSeen"("releaseId");

-- CreateIndex
CREATE UNIQUE INDEX "UserReleaseSeen_userId_releaseId_key" ON "UserReleaseSeen"("userId", "releaseId");

-- CreateIndex
CREATE INDEX "EvidenceItem_inspectionId_idx" ON "EvidenceItem"("inspectionId");

-- CreateIndex
CREATE INDEX "EvidenceItem_evidenceClass_idx" ON "EvidenceItem"("evidenceClass");

-- CreateIndex
CREATE INDEX "EvidenceItem_capturedById_idx" ON "EvidenceItem"("capturedById");

-- CreateIndex
CREATE INDEX "EvidenceItem_capturedAt_idx" ON "EvidenceItem"("capturedAt");

-- CreateIndex
CREATE INDEX "EvidenceItem_workflowStepId_idx" ON "EvidenceItem"("workflowStepId");

-- CreateIndex
CREATE INDEX "EvidenceItem_inspectionId_evidenceClass_idx" ON "EvidenceItem"("inspectionId", "evidenceClass");

-- CreateIndex
CREATE INDEX "EvidenceItem_inspectionId_status_idx" ON "EvidenceItem"("inspectionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionWorkflow_inspectionId_key" ON "InspectionWorkflow"("inspectionId");

-- CreateIndex
CREATE INDEX "InspectionWorkflow_inspectionId_idx" ON "InspectionWorkflow"("inspectionId");

-- CreateIndex
CREATE INDEX "InspectionWorkflow_jobType_idx" ON "InspectionWorkflow"("jobType");

-- CreateIndex
CREATE INDEX "WorkflowStep_workflowId_idx" ON "WorkflowStep"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowStep_status_idx" ON "WorkflowStep"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStep_workflowId_stepOrder_key" ON "WorkflowStep"("workflowId", "stepOrder");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStep_workflowId_stepKey_key" ON "WorkflowStep"("workflowId", "stepKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExceptionReason_evidenceItemId_key" ON "ExceptionReason"("evidenceItemId");

-- CreateIndex
CREATE INDEX "ExceptionReason_reasonCode_idx" ON "ExceptionReason"("reasonCode");

-- CreateIndex
CREATE INDEX "ExceptionReason_approvedById_idx" ON "ExceptionReason"("approvedById");

-- CreateIndex
CREATE INDEX "StorageMirrorJob_orgId_status_idx" ON "StorageMirrorJob"("orgId", "status");

-- CreateIndex
CREATE INDEX "StorageMirrorJob_status_nextAttemptAt_idx" ON "StorageMirrorJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "StorageMirrorJob_createdAt_idx" ON "StorageMirrorJob"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorageMirrorJob_orgId_kind_photoId_reportId_invoiceId_insp_key" ON "StorageMirrorJob"("orgId", "kind", "photoId", "reportId", "invoiceId", "inspectionId");

-- CreateIndex
CREATE INDEX "StorageRestoreJob_orgId_status_idx" ON "StorageRestoreJob"("orgId", "status");

-- CreateIndex
CREATE INDEX "StorageRestoreJob_status_nextAttemptAt_idx" ON "StorageRestoreJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorageRestoreJob_orgId_sourceMirrorJobId_key" ON "StorageRestoreJob"("orgId", "sourceMirrorJobId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_stripeCustomerId_key" ON "Workspace"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_stripeSubscriptionId_key" ON "Workspace"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");

-- CreateIndex
CREATE INDEX "Workspace_slug_idx" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_status_idx" ON "Workspace"("status");

-- CreateIndex
CREATE INDEX "WorkspaceMember_workspaceId_idx" ON "WorkspaceMember"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_status_idx" ON "WorkspaceMember"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "WorkspaceRole_workspaceId_idx" ON "WorkspaceRole"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceRole_isSystem_idx" ON "WorkspaceRole"("isSystem");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceRole_workspaceId_name_key" ON "WorkspaceRole"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "Permission_category_idx" ON "Permission"("category");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "MemberRoleBinding_memberId_idx" ON "MemberRoleBinding"("memberId");

-- CreateIndex
CREATE INDEX "MemberRoleBinding_roleId_idx" ON "MemberRoleBinding"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberRoleBinding_memberId_roleId_key" ON "MemberRoleBinding"("memberId", "roleId");

-- CreateIndex
CREATE INDEX "MediaAssetTag_workspaceId_category_idx" ON "MediaAssetTag"("workspaceId", "category");

-- CreateIndex
CREATE INDEX "MediaAssetTag_workspaceId_category_value_idx" ON "MediaAssetTag"("workspaceId", "category", "value");

-- CreateIndex
CREATE INDEX "MediaAssetTag_assetId_idx" ON "MediaAssetTag"("assetId");

-- CreateIndex
CREATE INDEX "MediaAssetTag_inspectionId_idx" ON "MediaAssetTag"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAssetTag_assetId_category_value_key" ON "MediaAssetTag"("assetId", "category", "value");

-- CreateIndex
CREATE INDEX "MediaAsset_workspaceId_idx" ON "MediaAsset"("workspaceId");

-- CreateIndex
CREATE INDEX "MediaAsset_inspectionId_idx" ON "MediaAsset"("inspectionId");

-- CreateIndex
CREATE INDEX "MediaAsset_evidenceId_idx" ON "MediaAsset"("evidenceId");

-- CreateIndex
CREATE INDEX "MediaAsset_capturedAt_idx" ON "MediaAsset"("capturedAt");

-- CreateIndex
CREATE INDEX "MediaAsset_latitude_longitude_idx" ON "MediaAsset"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "MediaAsset_mimeType_idx" ON "MediaAsset"("mimeType");

-- CreateIndex
CREATE INDEX "ProviderConnection_workspaceId_idx" ON "ProviderConnection"("workspaceId");

-- CreateIndex
CREATE INDEX "ProviderConnection_provider_idx" ON "ProviderConnection"("provider");

-- CreateIndex
CREATE INDEX "ProviderConnection_status_idx" ON "ProviderConnection"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConnection_workspaceId_provider_key" ON "ProviderConnection"("workspaceId", "provider");

-- CreateIndex
CREATE INDEX "FeatureEntitlement_workspaceId_idx" ON "FeatureEntitlement"("workspaceId");

-- CreateIndex
CREATE INDEX "FeatureEntitlement_sku_idx" ON "FeatureEntitlement"("sku");

-- CreateIndex
CREATE INDEX "FeatureEntitlement_active_idx" ON "FeatureEntitlement"("active");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureEntitlement_workspaceId_sku_key" ON "FeatureEntitlement"("workspaceId", "sku");

-- CreateIndex
CREATE INDEX "ScrapingProviderConnection_workspaceId_idx" ON "ScrapingProviderConnection"("workspaceId");

-- CreateIndex
CREATE INDEX "ScrapingProviderConnection_provider_idx" ON "ScrapingProviderConnection"("provider");

-- CreateIndex
CREATE INDEX "ScrapingProviderConnection_status_idx" ON "ScrapingProviderConnection"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapingProviderConnection_workspaceId_provider_key" ON "ScrapingProviderConnection"("workspaceId", "provider");

-- CreateIndex
CREATE INDEX "AiUsageLog_workspaceId_createdAt_idx" ON "AiUsageLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_memberId_idx" ON "AiUsageLog"("memberId");

-- CreateIndex
CREATE INDEX "AiUsageLog_provider_idx" ON "AiUsageLog"("provider");

-- CreateIndex
CREATE INDEX "AiUsageLog_taskType_idx" ON "AiUsageLog"("taskType");

-- CreateIndex
CREATE INDEX "AiUsageLog_success_idx" ON "AiUsageLog"("success");

-- CreateIndex
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IicrcChunk_contentHash_key" ON "IicrcChunk"("contentHash");

-- CreateIndex
CREATE INDEX "IicrcChunk_standard_edition_idx" ON "IicrcChunk"("standard", "edition");

-- CreateIndex
CREATE INDEX "IicrcChunk_section_idx" ON "IicrcChunk"("section");

-- CreateIndex
CREATE INDEX "IicrcChunk_provenance_idx" ON "IicrcChunk"("provenance");

-- CreateIndex
CREATE INDEX "ClaimSketch_inspectionId_idx" ON "ClaimSketch"("inspectionId");

-- CreateIndex
CREATE INDEX "ClaimSketch_inspectionId_floorNumber_idx" ON "ClaimSketch"("inspectionId", "floorNumber");

-- CreateIndex
CREATE INDEX "SketchRoom_sketchId_idx" ON "SketchRoom"("sketchId");

-- CreateIndex
CREATE INDEX "SketchRoom_sketchId_floorNumber_idx" ON "SketchRoom"("sketchId", "floorNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SketchRoom_sketchId_fabricObjectId_key" ON "SketchRoom"("sketchId", "fabricObjectId");

-- CreateIndex
CREATE INDEX "RoomPlanCaptureReceipt_inspectionId_idx" ON "RoomPlanCaptureReceipt"("inspectionId");

-- CreateIndex
CREATE INDEX "RoomPlanCaptureReceipt_inspectionId_contentSha256_idx" ON "RoomPlanCaptureReceipt"("inspectionId", "contentSha256");

-- CreateIndex
CREATE INDEX "RoomPlanCaptureReceipt_clientCustodyId_idx" ON "RoomPlanCaptureReceipt"("clientCustodyId");

-- CreateIndex
CREATE INDEX "EvidencePin_sketchId_idx" ON "EvidencePin"("sketchId");

-- CreateIndex
CREATE INDEX "EvidencePin_sketchRoomId_idx" ON "EvidencePin"("sketchRoomId");

-- CreateIndex
CREATE INDEX "EvidencePin_inspectionPhotoId_idx" ON "EvidencePin"("inspectionPhotoId");

-- CreateIndex
CREATE INDEX "EvidencePin_sketchId_kind_idx" ON "EvidencePin"("sketchId", "kind");

-- CreateIndex
CREATE INDEX "SketchAnnotation_sketchId_idx" ON "SketchAnnotation"("sketchId");

-- CreateIndex
CREATE INDEX "SketchElement_sketchId_idx" ON "SketchElement"("sketchId");

-- CreateIndex
CREATE INDEX "SketchElement_sketchId_provenance_idx" ON "SketchElement"("sketchId", "provenance");

-- CreateIndex
CREATE INDEX "SketchElement_materialId_idx" ON "SketchElement"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "CaptureToken_tokenHash_key" ON "CaptureToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CaptureToken_inspectionId_idx" ON "CaptureToken"("inspectionId");

-- CreateIndex
CREATE INDEX "ClientEvidenceSubmission_inspectionId_idx" ON "ClientEvidenceSubmission"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_slug_key" ON "Material"("slug");

-- CreateIndex
CREATE INDEX "Hazard_sketchId_idx" ON "Hazard"("sketchId");

-- CreateIndex
CREATE INDEX "Hazard_elementId_idx" ON "Hazard"("elementId");

-- CreateIndex
CREATE INDEX "Hazard_sketchRoomId_idx" ON "Hazard"("sketchRoomId");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceContext_sketchId_key" ON "InsuranceContext"("sketchId");

-- CreateIndex
CREATE INDEX "SketchMoistureReading_sketchId_idx" ON "SketchMoistureReading"("sketchId");

-- CreateIndex
CREATE INDEX "SketchMoistureReading_sketchId_source_idx" ON "SketchMoistureReading"("sketchId", "source");

-- CreateIndex
CREATE INDEX "SketchMoistureReading_elementId_idx" ON "SketchMoistureReading"("elementId");

-- CreateIndex
CREATE INDEX "SketchMoistureReading_sketchRoomId_idx" ON "SketchMoistureReading"("sketchRoomId");

-- CreateIndex
CREATE INDEX "SketchMoistureReading_materialId_idx" ON "SketchMoistureReading"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "AscoraIntegration_userId_key" ON "AscoraIntegration"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AscoraJob_ascoraJobId_key" ON "AscoraJob"("ascoraJobId");

-- CreateIndex
CREATE INDEX "AscoraJob_integrationId_idx" ON "AscoraJob"("integrationId");

-- CreateIndex
CREATE INDEX "AscoraJob_claimType_idx" ON "AscoraJob"("claimType");

-- CreateIndex
CREATE INDEX "AscoraJob_completedAt_idx" ON "AscoraJob"("completedAt");

-- CreateIndex
CREATE INDEX "AscoraJob_sentToMyob_idx" ON "AscoraJob"("sentToMyob");

-- CreateIndex
CREATE INDEX "AscoraJob_totalExTax_idx" ON "AscoraJob"("totalExTax");

-- CreateIndex
CREATE INDEX "AscoraJob_labourSyncedAt_idx" ON "AscoraJob"("labourSyncedAt");

-- CreateIndex
CREATE INDEX "AscoraLineItem_ascoraJobId_idx" ON "AscoraLineItem"("ascoraJobId");

-- CreateIndex
CREATE INDEX "AscoraLineItem_partNumber_idx" ON "AscoraLineItem"("partNumber");

-- CreateIndex
CREATE INDEX "AscoraNote_ascoraJobId_idx" ON "AscoraNote"("ascoraJobId");

-- CreateIndex
CREATE UNIQUE INDEX "ScopePricingDatabase_partNumber_key" ON "ScopePricingDatabase"("partNumber");

-- CreateIndex
CREATE INDEX "ScopePricingDatabase_acceptanceRate_idx" ON "ScopePricingDatabase"("acceptanceRate");

-- CreateIndex
CREATE INDEX "ScopePricingDatabase_isActive_idx" ON "ScopePricingDatabase"("isActive");

-- CreateIndex
CREATE INDEX "ScopePricingDatabase_source_idx" ON "ScopePricingDatabase"("source");

-- CreateIndex
CREATE UNIQUE INDEX "DrNrpgIntegration_userId_key" ON "DrNrpgIntegration"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DrNrpgJobSync_inspectionId_key" ON "DrNrpgJobSync"("inspectionId");

-- CreateIndex
CREATE INDEX "DrNrpgJobSync_integrationId_idx" ON "DrNrpgJobSync"("integrationId");

-- CreateIndex
CREATE INDEX "DrNrpgJobSync_status_idx" ON "DrNrpgJobSync"("status");

-- CreateIndex
CREATE INDEX "DrNrpgJobSync_lastEventAt_idx" ON "DrNrpgJobSync"("lastEventAt");

-- CreateIndex
CREATE INDEX "DrNrpgJobSync_claimNumber_idx" ON "DrNrpgJobSync"("claimNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DrNrpgJobSync_integrationId_drNrpgJobId_key" ON "DrNrpgJobSync"("integrationId", "drNrpgJobId");

-- CreateIndex
CREATE INDEX "DrNrpgWebhookLog_jobSyncId_idx" ON "DrNrpgWebhookLog"("jobSyncId");

-- CreateIndex
CREATE INDEX "DrNrpgWebhookLog_eventType_idx" ON "DrNrpgWebhookLog"("eventType");

-- CreateIndex
CREATE INDEX "DrNrpgWebhookLog_direction_idx" ON "DrNrpgWebhookLog"("direction");

-- CreateIndex
CREATE INDEX "DrNrpgWebhookEvent_integrationId_idx" ON "DrNrpgWebhookEvent"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "DrNrpgWebhookEvent_integrationId_drNrpgJobId_eventTimestamp_key" ON "DrNrpgWebhookEvent"("integrationId", "drNrpgJobId", "eventTimestamp", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "DryingGoalRecord_inspectionId_key" ON "DryingGoalRecord"("inspectionId");

-- CreateIndex
CREATE INDEX "DryingGoalRecord_goalAchieved_idx" ON "DryingGoalRecord"("goalAchieved");

-- CreateIndex
CREATE INDEX "DryingGoalRecord_goalAchievedAt_idx" ON "DryingGoalRecord"("goalAchievedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCommsLog_idempotencyKey_key" ON "ClientCommsLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ClientCommsLog_inspectionId_idx" ON "ClientCommsLog"("inspectionId");

-- CreateIndex
CREATE INDEX "ClientCommsLog_status_idx" ON "ClientCommsLog"("status");

-- CreateIndex
CREATE INDEX "ClientCommsLog_eventType_idx" ON "ClientCommsLog"("eventType");

-- CreateIndex
CREATE INDEX "ClientCommsLog_createdAt_idx" ON "ClientCommsLog"("createdAt");

-- CreateIndex
CREATE INDEX "HistoricalJob_tenantId_idx" ON "HistoricalJob"("tenantId");

-- CreateIndex
CREATE INDEX "HistoricalJob_source_idx" ON "HistoricalJob"("source");

-- CreateIndex
CREATE INDEX "HistoricalJob_claimType_idx" ON "HistoricalJob"("claimType");

-- CreateIndex
CREATE INDEX "HistoricalJob_state_idx" ON "HistoricalJob"("state");

-- CreateIndex
CREATE INDEX "HistoricalJob_completedDate_idx" ON "HistoricalJob"("completedDate");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalJob_source_externalId_key" ON "HistoricalJob"("source", "externalId");

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
CREATE UNIQUE INDEX "TeacherUtterance_sessionId_turnIndex_key" ON "TeacherUtterance"("sessionId", "turnIndex");

-- CreateIndex
CREATE INDEX "TeacherToolCall_sessionId_idx" ON "TeacherToolCall"("sessionId");

-- CreateIndex
CREATE INDEX "TeacherToolCall_toolName_idx" ON "TeacherToolCall"("toolName");

-- CreateIndex
CREATE INDEX "StandardsChunk_standard_jurisdiction_idx" ON "StandardsChunk"("standard", "jurisdiction");

-- CreateIndex
CREATE INDEX "StandardsChunk_provenance_idx" ON "StandardsChunk"("provenance");

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
CREATE UNIQUE INDEX "ClaimProgress_reportId_key" ON "ClaimProgress"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimProgress_inspectionId_key" ON "ClaimProgress"("inspectionId");

-- CreateIndex
CREATE INDEX "ClaimProgress_currentState_idx" ON "ClaimProgress"("currentState");

-- CreateIndex
CREATE INDEX "ClaimProgress_primaryManagerId_idx" ON "ClaimProgress"("primaryManagerId");

-- CreateIndex
CREATE INDEX "ClaimProgress_primaryTechnicianId_idx" ON "ClaimProgress"("primaryTechnicianId");

-- CreateIndex
CREATE INDEX "ClaimProgress_createdAt_idx" ON "ClaimProgress"("createdAt");

-- CreateIndex
CREATE INDEX "ProgressTransition_claimProgressId_transitionedAt_idx" ON "ProgressTransition"("claimProgressId", "transitionedAt");

-- CreateIndex
CREATE INDEX "ProgressTransition_actorUserId_idx" ON "ProgressTransition"("actorUserId");

-- CreateIndex
CREATE INDEX "ProgressTransition_transitionKey_idx" ON "ProgressTransition"("transitionKey");

-- CreateIndex
CREATE INDEX "ProgressTransition_transitionedAt_idx" ON "ProgressTransition"("transitionedAt");

-- CreateIndex
CREATE INDEX "ProgressAttestation_claimProgressId_idx" ON "ProgressAttestation"("claimProgressId");

-- CreateIndex
CREATE INDEX "ProgressAttestation_transitionId_idx" ON "ProgressAttestation"("transitionId");

-- CreateIndex
CREATE INDEX "ProgressAttestation_attestorUserId_idx" ON "ProgressAttestation"("attestorUserId");

-- CreateIndex
CREATE INDEX "ProgressAttestation_attestationType_idx" ON "ProgressAttestation"("attestationType");

-- CreateIndex
CREATE INDEX "AttestationConsentToken_userId_expiresAt_idx" ON "AttestationConsentToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AttestationConsentToken_reportId_idx" ON "AttestationConsentToken"("reportId");

-- CreateIndex
CREATE INDEX "AttestationConsentToken_consumedAt_idx" ON "AttestationConsentToken"("consumedAt");

-- CreateIndex
CREATE INDEX "OverrideGovernanceReport_reportMonth_idx" ON "OverrideGovernanceReport"("reportMonth");

-- CreateIndex
CREATE INDEX "OverrideGovernanceReport_isBreached_reportMonth_idx" ON "OverrideGovernanceReport"("isBreached", "reportMonth");

-- CreateIndex
CREATE UNIQUE INDEX "OverrideGovernanceReport_reportMonth_gateKey_key" ON "OverrideGovernanceReport"("reportMonth", "gateKey");

-- CreateIndex
CREATE INDEX "ProgressTelemetryEvent_eventName_createdAt_idx" ON "ProgressTelemetryEvent"("eventName", "createdAt");

-- CreateIndex
CREATE INDEX "ProgressTelemetryEvent_claimProgressId_createdAt_idx" ON "ProgressTelemetryEvent"("claimProgressId", "createdAt");

-- CreateIndex
CREATE INDEX "ProgressTelemetryEvent_transitionKey_createdAt_idx" ON "ProgressTelemetryEvent"("transitionKey", "createdAt");

-- CreateIndex
CREATE INDEX "ProgressTelemetryEvent_createdAt_idx" ON "ProgressTelemetryEvent"("createdAt");

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
CREATE INDEX "Authorisation_subjectUserId_verifiedAt_idx" ON "Authorisation"("subjectUserId", "verifiedAt" DESC);

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
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthHandoffToken_tokenHash_key" ON "OAuthHandoffToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OAuthHandoffToken_tokenHash_idx" ON "OAuthHandoffToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OAuthHandoffToken_expiresAt_idx" ON "OAuthHandoffToken"("expiresAt");

-- CreateIndex
CREATE INDEX "OAuthHandoffToken_userId_idx" ON "OAuthHandoffToken"("userId");

-- CreateIndex
CREATE INDEX "HydrationJob_status_startedAt_idx" ON "HydrationJob"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HydrationJob_organizationId_kind_key" ON "HydrationJob"("organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationPricingConfig_organizationId_key" ON "OrganizationPricingConfig"("organizationId");

-- CreateIndex
CREATE INDEX "PromptVariant_claimType_isProduction_idx" ON "PromptVariant"("claimType", "isProduction");

-- CreateIndex
CREATE INDEX "PromptVariant_claimType_compositeScore_idx" ON "PromptVariant"("claimType", "compositeScore");

-- CreateIndex
CREATE INDEX "PromptVariant_parentVariantId_idx" ON "PromptVariant"("parentVariantId");

-- CreateIndex
CREATE INDEX "EvaluationRun_promptVariantId_idx" ON "EvaluationRun"("promptVariantId");

-- CreateIndex
CREATE INDEX "EvaluationRun_testCaseId_idx" ON "EvaluationRun"("testCaseId");

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
CREATE UNIQUE INDEX "SubscriptionEvent_stripeEventId_key" ON "SubscriptionEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_userId_createdAt_idx" ON "SubscriptionEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_eventType_idx" ON "SubscriptionEvent"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_cacheKey_key" ON "IdempotencyRecord"("cacheKey");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_scope_key_idx" ON "IdempotencyRecord"("scope", "key");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_status_expiresAt_idx" ON "IdempotencyRecord"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE INDEX "RateLimitHit_key_createdAt_idx" ON "RateLimitHit"("key", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimitHit_expiresAt_idx" ON "RateLimitHit"("expiresAt");

-- CreateIndex
CREATE INDEX "ClientMutation_workspaceId_status_receivedAt_idx" ON "ClientMutation"("workspaceId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "ClientMutation_userId_receivedAt_idx" ON "ClientMutation"("userId", "receivedAt");

-- CreateIndex
CREATE INDEX "ClientMutation_inspectionId_receivedAt_idx" ON "ClientMutation"("inspectionId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientMutation_workspaceId_mutationId_key" ON "ClientMutation"("workspaceId", "mutationId");

-- CreateIndex
CREATE INDEX "FieldCaptureEvent_workspaceId_eventType_receivedAt_idx" ON "FieldCaptureEvent"("workspaceId", "eventType", "receivedAt");

-- CreateIndex
CREATE INDEX "FieldCaptureEvent_inspectionId_capturedAt_idx" ON "FieldCaptureEvent"("inspectionId", "capturedAt");

-- CreateIndex
CREATE INDEX "FieldCaptureEvent_clientMutationId_idx" ON "FieldCaptureEvent"("clientMutationId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldCaptureEvent_workspaceId_eventId_key" ON "FieldCaptureEvent"("workspaceId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "InsurerProfile_slug_key" ON "InsurerProfile"("slug");

-- CreateIndex
CREATE INDEX "InsurerProfile_slug_idx" ON "InsurerProfile"("slug");

-- CreateIndex
CREATE INDEX "InsurerProfile_isActive_idx" ON "InsurerProfile"("isActive");

-- CreateIndex
CREATE INDEX "Room_inspectionId_idx" ON "Room"("inspectionId");

-- CreateIndex
CREATE INDEX "RoomAnnotation_roomId_idx" ON "RoomAnnotation"("roomId");

-- CreateIndex
CREATE INDEX "BusinessProfile_userId_idx" ON "BusinessProfile"("userId");

-- CreateIndex
CREATE INDEX "BusinessProfile_userId_isDefault_idx" ON "BusinessProfile"("userId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentDeployment_mobileLocalId_key" ON "EquipmentDeployment"("mobileLocalId");

-- CreateIndex
CREATE INDEX "EquipmentDeployment_reportId_idx" ON "EquipmentDeployment"("reportId");

-- CreateIndex
CREATE INDEX "EquipmentDeployment_userId_idx" ON "EquipmentDeployment"("userId");

-- CreateIndex
CREATE INDEX "EquipmentDeployment_startTime_idx" ON "EquipmentDeployment"("startTime");

-- CreateIndex
CREATE INDEX "EquipmentDeployment_mobileLocalId_idx" ON "EquipmentDeployment"("mobileLocalId");

-- CreateIndex
CREATE UNIQUE INDEX "MobileInspection_mobileLocalId_key" ON "MobileInspection"("mobileLocalId");

-- CreateIndex
CREATE INDEX "MobileInspection_jobId_idx" ON "MobileInspection"("jobId");

-- CreateIndex
CREATE INDEX "MobileInspection_mobileLocalId_idx" ON "MobileInspection"("mobileLocalId");

-- CreateIndex
CREATE INDEX "MobileInspection_status_idx" ON "MobileInspection"("status");

-- CreateIndex
CREATE INDEX "MobileInspection_userId_idx" ON "MobileInspection"("userId");

-- CreateIndex
CREATE INDEX "MoistureMeter_userId_idx" ON "MoistureMeter"("userId");

-- CreateIndex
CREATE INDEX "MoistureMeter_serialNumber_idx" ON "MoistureMeter"("serialNumber");

-- CreateIndex
CREATE INDEX "MoistureMeter_calibrationExpiryDate_idx" ON "MoistureMeter"("calibrationExpiryDate");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- CreateIndex
CREATE INDEX "PushToken_token_idx" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_isActive_idx" ON "PushToken"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_userId_deviceId_key" ON "PushToken"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "CustodyEvent_evidenceItemId_idx" ON "CustodyEvent"("evidenceItemId");

-- CreateIndex
CREATE INDEX "CustodyEvent_actorId_idx" ON "CustodyEvent"("actorId");

-- CreateIndex
CREATE INDEX "CustodyEvent_action_idx" ON "CustodyEvent"("action");

-- CreateIndex
CREATE INDEX "CustodyEvent_createdAt_idx" ON "CustodyEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientInvite_token_key" ON "ClientInvite"("token");

-- CreateIndex
CREATE INDEX "ClientInvite_inspectionId_idx" ON "ClientInvite"("inspectionId");

-- CreateIndex
CREATE INDEX "ClientInvite_clientEmail_idx" ON "ClientInvite"("clientEmail");

-- CreateIndex
CREATE INDEX "ClientInvite_token_idx" ON "ClientInvite"("token");

-- CreateIndex
CREATE INDEX "ClientInvite_expiresAt_idx" ON "ClientInvite"("expiresAt");

-- CreateIndex
CREATE INDEX "PortalContent_audience_category_state_idx" ON "PortalContent"("audience", "category", "state");

-- CreateIndex
CREATE UNIQUE INDEX "PortalContent_scope_slug_key" ON "PortalContent"("scope", "slug");

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
ALTER TABLE "Client" ADD CONSTRAINT "Client_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientUser" ADD CONSTRAINT "ClientUser_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalAccount" ADD CONSTRAINT "ClientPortalAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "Report" ADD CONSTRAINT "Report_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostLibrary" ADD CONSTRAINT "CostLibrary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostLibrary" ADD CONSTRAINT "CostLibrary_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "XeroAccountCodeMapping" ADD CONSTRAINT "XeroAccountCodeMapping_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XeroSyncStatus" ADD CONSTRAINT "XeroSyncStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_sourceCostItemId_fkey" FOREIGN KEY ("sourceCostItemId") REFERENCES "CostItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "AssessmentGeneration" ADD CONSTRAINT "AssessmentGeneration_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentGeneration" ADD CONSTRAINT "AssessmentGeneration_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WHSIncident" ADD CONSTRAINT "WHSIncident_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WHSCorrectiveAction" ADD CONSTRAINT "WHSCorrectiveAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "WHSIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentalData" ADD CONSTRAINT "EnvironmentalData_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoistureReading" ADD CONSTRAINT "MoistureReading_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterDamageClassification" ADD CONSTRAINT "WaterDamageClassification_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PsychrometricReading" ADD CONSTRAINT "PsychrometricReading_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircuitAssessment" ADD CONSTRAINT "CircuitAssessment_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireSmokeDamageAssessment" ADD CONSTRAINT "FireSmokeDamageAssessment_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouldRemediationAssessment" ADD CONSTRAINT "MouldRemediationAssessment_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentsPackOutItem" ADD CONSTRAINT "ContentsPackOutItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StormDamageAssessment" ADD CONSTRAINT "StormDamageAssessment_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiohazardAssessment" ADD CONSTRAINT "BiohazardAssessment_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarpetRestorationAssessment" ADD CONSTRAINT "CarpetRestorationAssessment_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HVACAssessment" ADD CONSTRAINT "HVACAssessment_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AustralianComplianceRecord" ADD CONSTRAINT "AustralianComplianceRecord_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectedArea" ADD CONSTRAINT "AffectedArea_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectedArea" ADD CONSTRAINT "AffectedArea_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeItem" ADD CONSTRAINT "ScopeItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeItem" ADD CONSTRAINT "ScopeItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEstimate" ADD CONSTRAINT "CostEstimate_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classification" ADD CONSTRAINT "Classification_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminImpersonation" ADD CONSTRAINT "AdminImpersonation_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminImpersonation" ADD CONSTRAINT "AdminImpersonation_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingCode" ADD CONSTRAINT "BuildingCode_regulatoryDocumentId_fkey" FOREIGN KEY ("regulatoryDocumentId") REFERENCES "RegulatoryDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatorySection" ADD CONSTRAINT "RegulatorySection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RegulatoryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RegulatoryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionPhoto" ADD CONSTRAINT "InspectionPhoto_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionPhoto" ADD CONSTRAINT "InspectionPhoto_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "VoiceCopilotSession" ADD CONSTRAINT "VoiceCopilotSession_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceCopilotSession" ADD CONSTRAINT "VoiceCopilotSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceCopilotObservation" ADD CONSTRAINT "VoiceCopilotObservation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VoiceCopilotSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyLookup" ADD CONSTRAINT "PropertyLookup_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationFeedback" ADD CONSTRAINT "CancellationFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "AgentWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_agentSlug_fkey" FOREIGN KEY ("agentSlug") REFERENCES "AgentDefinition"("slug") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketReply" ADD CONSTRAINT "SupportTicketReply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketReply" ADD CONSTRAINT "SupportTicketReply_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReleaseSeen" ADD CONSTRAINT "UserReleaseSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReleaseSeen" ADD CONSTRAINT "UserReleaseSeen_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "AppRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_workflowStepId_fkey" FOREIGN KEY ("workflowStepId") REFERENCES "WorkflowStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionWorkflow" ADD CONSTRAINT "InspectionWorkflow_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "InspectionWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionReason" ADD CONSTRAINT "ExceptionReason_evidenceItemId_fkey" FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageMirrorJob" ADD CONSTRAINT "StorageMirrorJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageRestoreJob" ADD CONSTRAINT "StorageRestoreJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceRole" ADD CONSTRAINT "WorkspaceRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "WorkspaceRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRoleBinding" ADD CONSTRAINT "MemberRoleBinding_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRoleBinding" ADD CONSTRAINT "MemberRoleBinding_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "WorkspaceRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAssetTag" ADD CONSTRAINT "MediaAssetTag_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAssetTag" ADD CONSTRAINT "MediaAssetTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderConnection" ADD CONSTRAINT "ProviderConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureEntitlement" ADD CONSTRAINT "FeatureEntitlement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapingProviderConnection" ADD CONSTRAINT "ScrapingProviderConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimSketch" ADD CONSTRAINT "ClaimSketch_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchRoom" ADD CONSTRAINT "SketchRoom_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "ClaimSketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomPlanCaptureReceipt" ADD CONSTRAINT "RoomPlanCaptureReceipt_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidencePin" ADD CONSTRAINT "EvidencePin_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "ClaimSketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidencePin" ADD CONSTRAINT "EvidencePin_sketchRoomId_fkey" FOREIGN KEY ("sketchRoomId") REFERENCES "SketchRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchAnnotation" ADD CONSTRAINT "SketchAnnotation_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "ClaimSketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchElement" ADD CONSTRAINT "SketchElement_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "ClaimSketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchElement" ADD CONSTRAINT "SketchElement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureToken" ADD CONSTRAINT "CaptureToken_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientEvidenceSubmission" ADD CONSTRAINT "ClientEvidenceSubmission_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hazard" ADD CONSTRAINT "Hazard_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "ClaimSketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hazard" ADD CONSTRAINT "Hazard_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "SketchElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hazard" ADD CONSTRAINT "Hazard_sketchRoomId_fkey" FOREIGN KEY ("sketchRoomId") REFERENCES "SketchRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceContext" ADD CONSTRAINT "InsuranceContext_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "ClaimSketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchMoistureReading" ADD CONSTRAINT "SketchMoistureReading_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "ClaimSketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchMoistureReading" ADD CONSTRAINT "SketchMoistureReading_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "SketchElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchMoistureReading" ADD CONSTRAINT "SketchMoistureReading_sketchRoomId_fkey" FOREIGN KEY ("sketchRoomId") REFERENCES "SketchRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchMoistureReading" ADD CONSTRAINT "SketchMoistureReading_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AscoraIntegration" ADD CONSTRAINT "AscoraIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AscoraJob" ADD CONSTRAINT "AscoraJob_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AscoraIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AscoraLineItem" ADD CONSTRAINT "AscoraLineItem_ascoraJobId_fkey" FOREIGN KEY ("ascoraJobId") REFERENCES "AscoraJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AscoraNote" ADD CONSTRAINT "AscoraNote_ascoraJobId_fkey" FOREIGN KEY ("ascoraJobId") REFERENCES "AscoraJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrNrpgIntegration" ADD CONSTRAINT "DrNrpgIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrNrpgJobSync" ADD CONSTRAINT "DrNrpgJobSync_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "DrNrpgIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrNrpgJobSync" ADD CONSTRAINT "DrNrpgJobSync_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrNrpgWebhookLog" ADD CONSTRAINT "DrNrpgWebhookLog_jobSyncId_fkey" FOREIGN KEY ("jobSyncId") REFERENCES "DrNrpgJobSync"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrNrpgWebhookEvent" ADD CONSTRAINT "DrNrpgWebhookEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "DrNrpgIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DryingGoalRecord" ADD CONSTRAINT "DryingGoalRecord_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCommsLog" ADD CONSTRAINT "ClientCommsLog_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "ClaimProgress" ADD CONSTRAINT "ClaimProgress_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimProgress" ADD CONSTRAINT "ClaimProgress_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressTransition" ADD CONSTRAINT "ProgressTransition_claimProgressId_fkey" FOREIGN KEY ("claimProgressId") REFERENCES "ClaimProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressAttestation" ADD CONSTRAINT "ProgressAttestation_claimProgressId_fkey" FOREIGN KEY ("claimProgressId") REFERENCES "ClaimProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressAttestation" ADD CONSTRAINT "ProgressAttestation_transitionId_fkey" FOREIGN KEY ("transitionId") REFERENCES "ProgressTransition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authorisation" ADD CONSTRAINT "Authorisation_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSigningKey" ADD CONSTRAINT "DeviceSigningKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationEvent" ADD CONSTRAINT "ActivationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthHandoffToken" ADD CONSTRAINT "OAuthHandoffToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HydrationJob" ADD CONSTRAINT "HydrationJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationPricingConfig" ADD CONSTRAINT "OrganizationPricingConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptVariant" ADD CONSTRAINT "PromptVariant_parentVariantId_fkey" FOREIGN KEY ("parentVariantId") REFERENCES "PromptVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRun" ADD CONSTRAINT "EvaluationRun_promptVariantId_fkey" FOREIGN KEY ("promptVariantId") REFERENCES "PromptVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentJob" ADD CONSTRAINT "ContentJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ContentJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAnalytics" ADD CONSTRAINT "ContentAnalytics_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ContentPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMutation" ADD CONSTRAINT "ClientMutation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMutation" ADD CONSTRAINT "ClientMutation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMutation" ADD CONSTRAINT "ClientMutation_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldCaptureEvent" ADD CONSTRAINT "FieldCaptureEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldCaptureEvent" ADD CONSTRAINT "FieldCaptureEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldCaptureEvent" ADD CONSTRAINT "FieldCaptureEvent_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldCaptureEvent" ADD CONSTRAINT "FieldCaptureEvent_clientMutationId_fkey" FOREIGN KEY ("clientMutationId") REFERENCES "ClientMutation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAnnotation" ADD CONSTRAINT "RoomAnnotation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentDeployment" ADD CONSTRAINT "EquipmentDeployment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentDeployment" ADD CONSTRAINT "EquipmentDeployment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileInspection" ADD CONSTRAINT "MobileInspection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileInspection" ADD CONSTRAINT "MobileInspection_nirInspectionId_fkey" FOREIGN KEY ("nirInspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileInspection" ADD CONSTRAINT "MobileInspection_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoistureMeter" ADD CONSTRAINT "MoistureMeter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_evidenceItemId_fkey" FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientInvite" ADD CONSTRAINT "ClientInvite_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientInvite" ADD CONSTRAINT "ClientInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
