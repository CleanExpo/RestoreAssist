-- Migration: create_missing_gatecheck_scopetemplate_xero
-- Date: 2026-05-13
-- Surfaced by the CI drift-check (see scripts/check-schema-drift.mjs).
-- Three models existed in prisma/schema.prisma without a corresponding CREATE
-- TABLE migration. Sandbox has GateCheck (created via prior `db push`), but
-- ScopeTemplate and XeroAccountCodeMapping never made it to any environment.
-- Using IF NOT EXISTS so this is a no-op on environments where some/all of
-- these tables already exist.

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

DO $$ BEGIN
  ALTER TABLE "ScopeTemplate" ADD CONSTRAINT "ScopeTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "XeroAccountCodeMapping" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "XeroAccountCodeMapping_integrationId_category_key" ON "XeroAccountCodeMapping"("integrationId", "category");
CREATE INDEX IF NOT EXISTS "XeroAccountCodeMapping_integrationId_idx" ON "XeroAccountCodeMapping"("integrationId");
CREATE INDEX IF NOT EXISTS "XeroAccountCodeMapping_integrationId_accountCode_idx" ON "XeroAccountCodeMapping"("integrationId", "accountCode");

DO $$ BEGIN
  ALTER TABLE "XeroAccountCodeMapping" ADD CONSTRAINT "XeroAccountCodeMapping_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
