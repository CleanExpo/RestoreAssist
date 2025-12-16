-- Idempotent migration: Check if types exist before creating
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
        CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'MANAGER');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClientStatus') THEN
        CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PROSPECT', 'ARCHIVED');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportStatus') THEN
        CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'COMPLETED', 'ARCHIVED');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IntegrationStatus') THEN
        CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionStatus') THEN
        CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'CANCELED', 'EXPIRED', 'PAST_DUE');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstimateStatus') THEN
        CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'APPROVED', 'LOCKED');
    END IF;
END $$;

-- CreateTable with IF NOT EXISTS
CREATE TABLE IF NOT EXISTS "Account" (
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

CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
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
    "businessName" TEXT,
    "businessAddress" TEXT,
    "businessLogo" TEXT,
    "businessABN" TEXT,
    "businessPhone" TEXT,
    "businessEmail" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "Client" (
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

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Report" (
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
    "clientContactDetails" TEXT,
    "propertyPostcode" TEXT,
    "claimReferenceNumber" TEXT,
    "incidentDate" TIMESTAMP(3),
    "technicianAttendanceDate" TIMESTAMP(3),
    "technicianName" TEXT,
    "technicianFieldReport" TEXT,
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

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Integration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "apiKey" TEXT,
    "config" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CostLibrary" (
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

CREATE TABLE IF NOT EXISTS "CostItem" (
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

CREATE TABLE IF NOT EXISTS "Scope" (
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

CREATE TABLE IF NOT EXISTS "Estimate" (
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

CREATE TABLE IF NOT EXISTS "EstimateLineItem" (
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

CREATE TABLE IF NOT EXISTS "EstimateVersion" (
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

CREATE TABLE IF NOT EXISTS "EstimateVariation" (
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

CREATE TABLE IF NOT EXISTS "CompanyPricingConfig" (
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

-- CreateIndex with IF NOT EXISTS
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Account_provider_providerAccountId_key') THEN
        CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
    END IF;
END $$;

-- CreateIndex with IF NOT EXISTS
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Session_sessionToken_key') THEN
        CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'User_email_key') THEN
        CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'User_subscriptionId_key') THEN
        CREATE UNIQUE INDEX "User_subscriptionId_key" ON "User"("subscriptionId");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'User_stripeCustomerId_key') THEN
        CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'VerificationToken_token_key') THEN
        CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'VerificationToken_identifier_token_key') THEN
        CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Scope_reportId_key') THEN
        CREATE UNIQUE INDEX "Scope_reportId_key" ON "Scope"("reportId");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Estimate_scopeId_key') THEN
        CREATE UNIQUE INDEX "Estimate_scopeId_key" ON "Estimate"("scopeId");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'EstimateLineItem_estimateId_idx') THEN
        CREATE INDEX "EstimateLineItem_estimateId_idx" ON "EstimateLineItem"("estimateId");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'EstimateLineItem_category_idx') THEN
        CREATE INDEX "EstimateLineItem_category_idx" ON "EstimateLineItem"("category");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'EstimateVersion_estimateId_idx') THEN
        CREATE INDEX "EstimateVersion_estimateId_idx" ON "EstimateVersion"("estimateId");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'EstimateVersion_estimateId_version_key') THEN
        CREATE UNIQUE INDEX "EstimateVersion_estimateId_version_key" ON "EstimateVersion"("estimateId", "version");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'EstimateVariation_estimateId_idx') THEN
        CREATE INDEX "EstimateVariation_estimateId_idx" ON "EstimateVariation"("estimateId");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'EstimateVariation_estimateId_variationNumber_key') THEN
        CREATE UNIQUE INDEX "EstimateVariation_estimateId_variationNumber_key" ON "EstimateVariation"("estimateId", "variationNumber");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'CompanyPricingConfig_userId_key') THEN
        CREATE UNIQUE INDEX "CompanyPricingConfig_userId_key" ON "CompanyPricingConfig"("userId");
    END IF;
END $$;

-- AddForeignKey (only if constraint doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Account_userId_fkey') THEN
        ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Session_userId_fkey') THEN
        ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Client_userId_fkey') THEN
        ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Report_userId_fkey') THEN
        ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Report_clientId_fkey') THEN
        ALTER TABLE "Report" ADD CONSTRAINT "Report_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Integration_userId_fkey') THEN
        ALTER TABLE "Integration" ADD CONSTRAINT "Integration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CostLibrary_userId_fkey') THEN
        ALTER TABLE "CostLibrary" ADD CONSTRAINT "CostLibrary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CostItem_libraryId_fkey') THEN
        ALTER TABLE "CostItem" ADD CONSTRAINT "CostItem_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "CostLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Scope_reportId_fkey') THEN
        ALTER TABLE "Scope" ADD CONSTRAINT "Scope_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Scope_userId_fkey') THEN
        ALTER TABLE "Scope" ADD CONSTRAINT "Scope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Estimate_reportId_fkey') THEN
        ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Estimate_scopeId_fkey') THEN
        ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "Scope"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Estimate_userId_fkey') THEN
        ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EstimateLineItem_estimateId_fkey') THEN
        ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EstimateVersion_estimateId_fkey') THEN
        ALTER TABLE "EstimateVersion" ADD CONSTRAINT "EstimateVersion_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EstimateVariation_estimateId_fkey') THEN
        ALTER TABLE "EstimateVariation" ADD CONSTRAINT "EstimateVariation_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyPricingConfig_userId_fkey') THEN
        ALTER TABLE "CompanyPricingConfig" ADD CONSTRAINT "CompanyPricingConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
