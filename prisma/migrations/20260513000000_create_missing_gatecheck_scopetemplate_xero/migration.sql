-- Migration: create_missing_gatecheck_scopetemplate_xero
-- Date: 2026-05-13
-- Surfaced by the CI drift-check (see scripts/check-schema-drift.mjs).
--
-- Three issues this migration fixes:
--   1. GateCheck — model in schema.prisma, no CREATE TABLE migration.
--   2. ScopeTemplate — model in schema.prisma, no CREATE TABLE migration.
--   3. XeroAccountCodeMapping — created by 20260416000001_billing_v2_schema_foundation
--      with the OLD shape (userId, category, damageType + FK to User). Schema
--      evolved to (integrationId, category, accountCode, taxType, description
--      + FK to Integration) but no ALTER migration was ever written. We drop
--      the incompatible legacy table and recreate it with the current shape.
--      The feature is brand new — zero rows expected — so data loss is safe.
--
-- On sandbox this migration is pre-marked applied in _prisma_migrations because
-- the tables were already created directly via Supabase MCP during the
-- 2026-05-13 cleanup. CI fresh-DB and any other env runs it cleanly.

-- ── GateCheck ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "GateCheck" (
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

CREATE INDEX IF NOT EXISTS "GateCheck_projectKey_createdAt_idx" ON "GateCheck"("projectKey", "createdAt");
CREATE INDEX IF NOT EXISTS "GateCheck_decision_createdAt_idx" ON "GateCheck"("decision", "createdAt");

-- ── ScopeTemplate ───────────────────────────────────────────────────────────

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

CREATE INDEX IF NOT EXISTS "ScopeTemplate_userId_idx" ON "ScopeTemplate"("userId");
CREATE INDEX IF NOT EXISTS "ScopeTemplate_claimType_idx" ON "ScopeTemplate"("claimType");

ALTER TABLE "ScopeTemplate" ADD CONSTRAINT "ScopeTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── XeroAccountCodeMapping — drop legacy billing_v2 version, recreate ──────

DROP TABLE IF EXISTS "XeroAccountCodeMapping" CASCADE;

CREATE TABLE "XeroAccountCodeMapping" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "category" TEXT,
    "accountCode" TEXT NOT NULL,
    "taxType" TEXT NOT NULL DEFAULT 'OUTPUT',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeroAccountCodeMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "XeroAccountCodeMapping_integrationId_category_key" ON "XeroAccountCodeMapping"("integrationId", "category");
CREATE INDEX "XeroAccountCodeMapping_integrationId_idx" ON "XeroAccountCodeMapping"("integrationId");
CREATE INDEX "XeroAccountCodeMapping_integrationId_accountCode_idx" ON "XeroAccountCodeMapping"("integrationId", "accountCode");

ALTER TABLE "XeroAccountCodeMapping" ADD CONSTRAINT "XeroAccountCodeMapping_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
