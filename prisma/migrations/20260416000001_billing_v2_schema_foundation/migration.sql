-- RA-848: Billing & Estimation Platform v2 — M1 Schema Foundation
-- Generated: 2026-04-16
-- Safe migration: all new columns are nullable or carry defaults. No destructive changes.

-- ============================================================
-- EstimateLineItem: Xero account code + tax fields
-- ============================================================
ALTER TABLE "EstimateLineItem"
  ADD COLUMN IF NOT EXISTS "xeroAccountCode" TEXT,
  ADD COLUMN IF NOT EXISTS "taxType"         TEXT NOT NULL DEFAULT 'OUTPUT',
  ADD COLUMN IF NOT EXISTS "isPassThrough"   BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- CompanyPricingConfig: additional equipment rates + multipliers
-- ============================================================
ALTER TABLE "CompanyPricingConfig"
  ADD COLUMN IF NOT EXISTS "negativeAirMachineDailyRate" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "hepaVacuumDailyRate"         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "monitoringVisitDailyRate"    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "mobilisationFee"             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "afterHoursMultiplier"        DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS "saturdayMultiplier"          DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS "sundayMultiplier"            DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS "publicHolidayMultiplier"     DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS "wasteDisposalPerBinRate"     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "projectManagementPercent"    DOUBLE PRECISION NOT NULL DEFAULT 8.0,
  ADD COLUMN IF NOT EXISTS "photoDocumentationFee"       DOUBLE PRECISION;

-- ============================================================
-- ScopeItem: rate suggestion + Xero account code
-- ============================================================
ALTER TABLE "ScopeItem"
  ADD COLUMN IF NOT EXISTS "suggestedRate"   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "rateSource"      TEXT,
  ADD COLUMN IF NOT EXISTS "xeroAccountCode" TEXT;

-- ============================================================
-- CostDatabase: composite index for fast rate lookup
-- ============================================================
CREATE INDEX IF NOT EXISTS "CostDatabase_itemType_region_idx"
  ON "CostDatabase" ("itemType", "region");

-- ============================================================
-- InvoiceLineItem: Xero account code + tax + unit/code fields
-- ============================================================
ALTER TABLE "InvoiceLineItem"
  ADD COLUMN IF NOT EXISTS "xeroAccountCode" TEXT,
  ADD COLUMN IF NOT EXISTS "taxType"         TEXT NOT NULL DEFAULT 'OUTPUT',
  ADD COLUMN IF NOT EXISTS "unit"            TEXT,
  ADD COLUMN IF NOT EXISTS "code"            TEXT,
  ADD COLUMN IF NOT EXISTS "isPassThrough"   BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- XeroAccountCodeMapping: new table
-- ============================================================
CREATE TABLE IF NOT EXISTS "XeroAccountCodeMapping" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "category"    TEXT NOT NULL,
  "damageType"  TEXT,
  "accountCode" TEXT NOT NULL,
  "taxType"     TEXT NOT NULL DEFAULT 'OUTPUT',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "XeroAccountCodeMapping_pkey" PRIMARY KEY ("id")
);

-- Foreign key: userId → User.id (cascade delete)
ALTER TABLE "XeroAccountCodeMapping"
  ADD CONSTRAINT "XeroAccountCodeMapping_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique constraint: one mapping per (userId, category, damageType)
CREATE UNIQUE INDEX IF NOT EXISTS "XeroAccountCodeMapping_userId_category_damageType_key"
  ON "XeroAccountCodeMapping" ("userId", "category", "damageType");

-- Index: fast lookup by userId
CREATE INDEX IF NOT EXISTS "XeroAccountCodeMapping_userId_idx"
  ON "XeroAccountCodeMapping" ("userId");
