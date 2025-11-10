-- Add Standards & Regulatory Compliance System to RestoreAssist
-- This migration adds tables for storing regulatory standards (IICRC S500, S520, etc.)
-- and their clauses for use in report generation

-- Create enum types first
CREATE TYPE "StandardStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'WITHDRAWN', 'DRAFT');
CREATE TYPE "ClauseImportance" AS ENUM ('CRITICAL', 'REQUIRED', 'STANDARD', 'RECOMMENDED', 'OPTIONAL');
CREATE TYPE "SyncType" AS ENUM ('FULL', 'INCREMENTAL', 'SINGLE_FILE');
CREATE TYPE "SyncStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'PARTIAL');

-- Create Standard table
CREATE TABLE "Standard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL UNIQUE,
    "title" TEXT NOT NULL,
    "edition" TEXT,
    "publisher" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "publicationDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "driveFileId" TEXT UNIQUE,
    "driveFileName" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "description" TEXT,
    "scope" TEXT,
    "applicability" TEXT,
    "status" "StandardStatus" NOT NULL DEFAULT 'ACTIVE',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "tags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create StandardSection table
CREATE TABLE "StandardSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "standardId" TEXT NOT NULL,
    "sectionNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "summary" TEXT,
    "parentSectionId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StandardSection_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "Standard"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StandardSection_standardId_sectionNumber_key" UNIQUE ("standardId", "sectionNumber")
);

-- Create StandardClause table
CREATE TABLE "StandardClause" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "standardId" TEXT NOT NULL,
    "sectionId" TEXT,
    "clauseNumber" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "interpretation" TEXT,
    "keywords" TEXT,
    "category" TEXT,
    "importance" "ClauseImportance" NOT NULL DEFAULT 'STANDARD',
    "applicability" TEXT,
    "howToComply" TEXT,
    "examples" TEXT,
    "commonErrors" TEXT,
    "relatedClauses" TEXT,
    "externalRefs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StandardClause_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "Standard"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StandardClause_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "StandardSection"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StandardClause_standardId_clauseNumber_key" UNIQUE ("standardId", "clauseNumber")
);

-- Create SyncHistory table
CREATE TABLE "SyncHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "syncType" "SyncType" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "driveFileId" TEXT,
    "driveFileName" TEXT,
    "standardsCreated" INTEGER NOT NULL DEFAULT 0,
    "standardsUpdated" INTEGER NOT NULL DEFAULT 0,
    "clausesCreated" INTEGER NOT NULL DEFAULT 0,
    "clausesUpdated" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "errorLog" TEXT,
    "processedFiles" TEXT,
    "summary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "triggeredBy" TEXT,
    "triggerMethod" TEXT
);

-- Create indexes for Standard
CREATE INDEX "Standard_code_idx" ON "Standard"("code");
CREATE INDEX "Standard_category_idx" ON "Standard"("category");
CREATE INDEX "Standard_status_idx" ON "Standard"("status");
CREATE INDEX "Standard_driveFileId_idx" ON "Standard"("driveFileId");

-- Create indexes for StandardSection
CREATE INDEX "StandardSection_standardId_idx" ON "StandardSection"("standardId");
CREATE INDEX "StandardSection_parentSectionId_idx" ON "StandardSection"("parentSectionId");

-- Create indexes for StandardClause
CREATE INDEX "StandardClause_standardId_idx" ON "StandardClause"("standardId");
CREATE INDEX "StandardClause_sectionId_idx" ON "StandardClause"("sectionId");
CREATE INDEX "StandardClause_category_idx" ON "StandardClause"("category");
CREATE INDEX "StandardClause_importance_idx" ON "StandardClause"("importance");

-- Create indexes for SyncHistory
CREATE INDEX "SyncHistory_status_idx" ON "SyncHistory"("status");
CREATE INDEX "SyncHistory_syncType_idx" ON "SyncHistory"("syncType");
CREATE INDEX "SyncHistory_startedAt_idx" ON "SyncHistory"("startedAt");

-- Insert initial IICRC standards metadata (will be populated by sync)
INSERT INTO "Standard" ("id", "code", "title", "edition", "publisher", "version", "status", "isRequired", "category", "createdAt", "updatedAt")
VALUES
    ('std_s500', 'S500', 'Water Damage Restoration', '5th Edition', 'IICRC', '5.0', 'ACTIVE', true, 'Water Damage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('std_s520', 'S520', 'Mould Remediation', '3rd Edition', 'IICRC', '3.0', 'ACTIVE', true, 'Mould', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('std_s540', 'S540', 'Trauma and Crime Scene Cleanup', '1st Edition', 'IICRC', '1.0', 'ACTIVE', false, 'Trauma', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('std_s800', 'S800', 'Professional Inspection of Textile Floorcovering', '1st Edition', 'IICRC', '1.0', 'ACTIVE', false, 'Inspection', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('std_s100', 'S100', 'Professional Cleaning of Textile Floor Coverings', '2021', 'IICRC', '2021', 'ACTIVE', false, 'Cleaning', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('std_s220', 'S220', 'Professional Inspection of Hard Surface Floors', NULL, 'IICRC', '1.0', 'ACTIVE', false, 'Inspection', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Add comment explaining the tables
COMMENT ON TABLE "Standard" IS 'Regulatory standards (IICRC, AS, etc.) with metadata and Drive sync tracking';
COMMENT ON TABLE "StandardSection" IS 'Major sections within each standard for hierarchical organization';
COMMENT ON TABLE "StandardClause" IS 'Individual clauses/requirements that can be referenced in reports';
COMMENT ON TABLE "SyncHistory" IS 'Track synchronization jobs from Google Drive to database';
