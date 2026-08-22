-- Migration A: Setup Wizard — Phase A additions (2026-05-12)
-- ADDITIVE ONLY: no DROP TABLE, DROP COLUMN, or DROP TYPE statements.

-- CreateEnum
CREATE TYPE "TradingStatus" AS ENUM ('ACTIVE', 'PRE_TRADING');

-- CreateEnum
CREATE TYPE "SetupMode" AS ENUM ('AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "HydrationKind" AS ENUM ('ABR', 'WEBSITE', 'PRICING');

-- CreateEnum
CREATE TYPE "HydrationStatus" AS ENUM ('RUNNING', 'READY', 'ERROR', 'MANUAL');

-- AlterTable "Organization" — add setup wizard fields
ALTER TABLE "Organization" ADD COLUMN "legalName" TEXT;
ALTER TABLE "Organization" ADD COLUMN "tradingName" TEXT;
ALTER TABLE "Organization" ADD COLUMN "abn" TEXT;
ALTER TABLE "Organization" ADD COLUMN "acn" TEXT;
ALTER TABLE "Organization" ADD COLUMN "state" TEXT;
ALTER TABLE "Organization" ADD COLUMN "address" TEXT;
ALTER TABLE "Organization" ADD COLUMN "phone" TEXT;
ALTER TABLE "Organization" ADD COLUMN "email" TEXT;
ALTER TABLE "Organization" ADD COLUMN "website" TEXT;
ALTER TABLE "Organization" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Organization" ADD COLUMN "primaryColor" TEXT;
ALTER TABLE "Organization" ADD COLUMN "accentColor" TEXT;
ALTER TABLE "Organization" ADD COLUMN "aboutCopy" TEXT;
ALTER TABLE "Organization" ADD COLUMN "tradingStatus" "TradingStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Organization" ADD COLUMN "setupStartedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "setupCompletedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "setupMode" "SetupMode" NOT NULL DEFAULT 'AI';

-- CreateTable "HydrationJob"
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

-- CreateTable "AbnLookupCache"
CREATE TABLE "AbnLookupCache" (
    "abn" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbnLookupCache_pkey" PRIMARY KEY ("abn")
);

-- CreateTable "OrganizationPricingConfig"
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

-- CreateUniqueIndex on Organization.abn
CREATE UNIQUE INDEX "Organization_abn_key" ON "Organization"("abn");

-- CreateUniqueIndex on HydrationJob (organizationId, kind)
CREATE UNIQUE INDEX "HydrationJob_organizationId_kind_key" ON "HydrationJob"("organizationId", "kind");

-- CreateIndex on HydrationJob (status, startedAt)
CREATE INDEX "HydrationJob_status_startedAt_idx" ON "HydrationJob"("status", "startedAt");

-- CreateUniqueIndex on OrganizationPricingConfig.organizationId
CREATE UNIQUE INDEX "OrganizationPricingConfig_organizationId_key" ON "OrganizationPricingConfig"("organizationId");

-- AddForeignKey: HydrationJob → Organization
ALTER TABLE "HydrationJob" ADD CONSTRAINT "HydrationJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: OrganizationPricingConfig → Organization
ALTER TABLE "OrganizationPricingConfig" ADD CONSTRAINT "OrganizationPricingConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
