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
