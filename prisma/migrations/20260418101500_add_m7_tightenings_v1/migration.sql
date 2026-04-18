-- RA-1383 (Board M-7): Schema tightenings v1
-- Ops Director war-story fixes, purely safe subset.
-- Deferred items (v2 follow-up): ScopeVariation enum, MakeSafeAction CHECK constraint, Estimate.scopeId required.
--
-- This migration:
--   1) EnvironmentalData — removes @unique on inspectionId (converts to time-series)
--   2) MoistureReading — adds isBaseline, isMonitoringPoint booleans + composite indexes
--   3) New Authorisation model for engagement-time licence/insurance verification

-- ── 1) EnvironmentalData: drop singleton constraint ─────────────────────────
-- The unique index is automatically named per Prisma convention.
DROP INDEX IF EXISTS "EnvironmentalData_inspectionId_key";

-- Add non-unique indexes to preserve query performance
CREATE INDEX "EnvironmentalData_inspectionId_idx" ON "EnvironmentalData"("inspectionId");
CREATE INDEX "EnvironmentalData_inspectionId_recordedAt_idx" ON "EnvironmentalData"("inspectionId", "recordedAt");

-- ── 2) MoistureReading: new booleans + composite indexes ────────────────────
ALTER TABLE "MoistureReading" ADD COLUMN "isBaseline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MoistureReading" ADD COLUMN "isMonitoringPoint" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "MoistureReading_inspectionId_isBaseline_idx" ON "MoistureReading"("inspectionId", "isBaseline");
CREATE INDEX "MoistureReading_inspectionId_isMonitoringPoint_idx" ON "MoistureReading"("inspectionId", "isMonitoringPoint");

-- ── 3) Authorisation table (engagement-time licence/insurance verification) ─
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

CREATE INDEX "Authorisation_inspectionId_idx" ON "Authorisation"("inspectionId");
CREATE INDEX "Authorisation_userId_idx" ON "Authorisation"("userId");
CREATE INDEX "Authorisation_subjectContractorId_idx" ON "Authorisation"("subjectContractorId");
CREATE INDEX "Authorisation_status_idx" ON "Authorisation"("status");
CREATE INDEX "Authorisation_expiresAt_idx" ON "Authorisation"("expiresAt");

ALTER TABLE "Authorisation"
  ADD CONSTRAINT "Authorisation_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
