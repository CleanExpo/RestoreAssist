-- Migration: add_ascora_drnrpg_drying_goal
-- Date: 2026-03-29
-- Adds:
--   • AscoraIntegration / AscoraJob / AscoraLineItem / AscoraNote (RA-262)
--   • ScopePricingDatabase (RA-260 Phase 2 + RA-262)
--   • DrNrpgIntegration / DrNrpgJobSync / DrNrpgWebhookLog (RA-27)
--   • DryingGoalRecord (RA-260 Phase 5)
--   • Inspection.drNrpgJobSync + Inspection.dryingGoalRecord back-relations (virtual, no SQL needed)
--   • User.ascoraIntegration + User.drNrpgIntegration back-relations (virtual, no SQL needed)

-- ============================================================
-- ASCORA INTEGRATION
-- ============================================================

CREATE TABLE "AscoraIntegration" (
    "id"                  TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId"              TEXT NOT NULL UNIQUE,
    "apiKey"              TEXT NOT NULL,
    "baseUrl"             TEXT NOT NULL DEFAULT 'https://api.ascora.com.au',
    "isActive"            BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt"          TIMESTAMP(3),
    "totalJobsImported"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AscoraIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AscoraJob" (
    "id"              TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "integrationId"   TEXT NOT NULL,
    "ascoraJobId"     TEXT NOT NULL UNIQUE,
    "ascoraJobNumber" TEXT,
    "jobType"         TEXT,
    "claimType"       TEXT,
    "suburb"          TEXT,
    "state"           TEXT,
    "postcode"        TEXT,
    "completedAt"     TIMESTAMP(3),
    "sentToMyob"      BOOLEAN NOT NULL DEFAULT false,
    "totalExTax"      DOUBLE PRECISION,
    "importedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AscoraJob_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AscoraIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AscoraJob_integrationId_idx" ON "AscoraJob"("integrationId");
CREATE INDEX "AscoraJob_claimType_idx"     ON "AscoraJob"("claimType");
CREATE INDEX "AscoraJob_completedAt_idx"   ON "AscoraJob"("completedAt");
CREATE INDEX "AscoraJob_sentToMyob_idx"    ON "AscoraJob"("sentToMyob");
CREATE INDEX "AscoraJob_totalExTax_idx"    ON "AscoraJob"("totalExTax");

CREATE TABLE "AscoraLineItem" (
    "id"             TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "ascoraJobId"    TEXT NOT NULL,
    "partNumber"     TEXT NOT NULL,
    "description"    TEXT NOT NULL,
    "quantity"       DOUBLE PRECISION NOT NULL,
    "unitPriceExTax" DOUBLE PRECISION NOT NULL,
    "amountExTax"    DOUBLE PRECISION NOT NULL,
    "invoiceDate"    TIMESTAMP(3),
    "importedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AscoraLineItem_ascoraJobId_fkey" FOREIGN KEY ("ascoraJobId") REFERENCES "AscoraJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AscoraLineItem_ascoraJobId_idx" ON "AscoraLineItem"("ascoraJobId");
CREATE INDEX "AscoraLineItem_partNumber_idx"  ON "AscoraLineItem"("partNumber");

CREATE TABLE "AscoraNote" (
    "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "ascoraJobId" TEXT NOT NULL,
    "noteText"    TEXT NOT NULL,
    "importedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AscoraNote_ascoraJobId_fkey" FOREIGN KEY ("ascoraJobId") REFERENCES "AscoraJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AscoraNote_ascoraJobId_idx" ON "AscoraNote"("ascoraJobId");

-- ============================================================
-- AU-NATIVE SCOPE PRICING DATABASE
-- ============================================================

CREATE TABLE "ScopePricingDatabase" (
    "id"                 TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "partNumber"         TEXT NOT NULL UNIQUE,
    "description"        TEXT NOT NULL,
    "claimTypes"         TEXT[] NOT NULL DEFAULT '{}',
    "usageCount"         INTEGER NOT NULL DEFAULT 0,
    "averageUnitPriceAU" DOUBLE PRECISION NOT NULL,
    "medianUnitPriceAU"  DOUBLE PRECISION,
    "minPriceAU"         DOUBLE PRECISION,
    "maxPriceAU"         DOUBLE PRECISION,
    "averageQuantity"    DOUBLE PRECISION,
    "acceptanceRate"     DOUBLE PRECISION,
    "acceptedCount"      INTEGER NOT NULL DEFAULT 0,
    "rejectedCount"      INTEGER NOT NULL DEFAULT 0,
    "priceHistory"       JSONB,
    "source"             TEXT NOT NULL DEFAULT 'ascora',
    "isActive"           BOOLEAN NOT NULL DEFAULT true,
    "lastUpdated"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ScopePricingDatabase_acceptanceRate_idx" ON "ScopePricingDatabase"("acceptanceRate");
CREATE INDEX "ScopePricingDatabase_isActive_idx"       ON "ScopePricingDatabase"("isActive");
CREATE INDEX "ScopePricingDatabase_source_idx"         ON "ScopePricingDatabase"("source");

-- ============================================================
-- DR-NRPG INTEGRATION
-- ============================================================

CREATE TABLE "DrNrpgIntegration" (
    "id"            TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId"        TEXT NOT NULL UNIQUE,
    "drNrpgApiKey"  TEXT NOT NULL,
    "drNrpgBaseUrl" TEXT NOT NULL DEFAULT 'https://api.dr-nrpg.com.au',
    "webhookSecret" TEXT NOT NULL,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt"    TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DrNrpgIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DrNrpgJobSync" (
    "id"              TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "integrationId"   TEXT NOT NULL,
    "inspectionId"    TEXT UNIQUE,
    "drNrpgJobId"     TEXT NOT NULL UNIQUE,
    "claimNumber"     TEXT NOT NULL,
    "insurer"         TEXT,
    "policyHolder"    TEXT,
    "propertyAddress" TEXT,
    "lossType"        TEXT,
    "status"          TEXT NOT NULL DEFAULT 'dispatched',
    "lastEventAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventType"   TEXT,
    "syncErrors"      JSONB,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DrNrpgJobSync_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "DrNrpgIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DrNrpgJobSync_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "DrNrpgJobSync_integrationId_idx" ON "DrNrpgJobSync"("integrationId");
CREATE INDEX "DrNrpgJobSync_status_idx"        ON "DrNrpgJobSync"("status");
CREATE INDEX "DrNrpgJobSync_lastEventAt_idx"   ON "DrNrpgJobSync"("lastEventAt");

CREATE TABLE "DrNrpgWebhookLog" (
    "id"             TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "jobSyncId"      TEXT NOT NULL,
    "direction"      TEXT NOT NULL,
    "eventType"      TEXT NOT NULL,
    "payload"        JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody"   TEXT,
    "deliveredAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retryCount"     INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DrNrpgWebhookLog_jobSyncId_fkey" FOREIGN KEY ("jobSyncId") REFERENCES "DrNrpgJobSync"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DrNrpgWebhookLog_jobSyncId_idx"  ON "DrNrpgWebhookLog"("jobSyncId");
CREATE INDEX "DrNrpgWebhookLog_eventType_idx"  ON "DrNrpgWebhookLog"("eventType");
CREATE INDEX "DrNrpgWebhookLog_direction_idx"  ON "DrNrpgWebhookLog"("direction");

-- ============================================================
-- DRYING GOAL VALIDATION
-- ============================================================

CREATE TABLE "DryingGoalRecord" (
    "id"                    TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "inspectionId"          TEXT NOT NULL UNIQUE,
    "targetCategory"        TEXT NOT NULL,
    "targetClass"           TEXT NOT NULL,
    "startedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "materialTargets"       JSONB NOT NULL,
    "goalAchieved"          BOOLEAN NOT NULL DEFAULT false,
    "goalAchievedAt"        TIMESTAMP(3),
    "totalDryingDays"       INTEGER,
    "finalReadingsSnapshot" JSONB,
    "iicrcReference"        TEXT NOT NULL DEFAULT 'IICRC S500:2021 §11.4',
    "signedOffBy"           TEXT,
    "signedOffAt"           TIMESTAMP(3),
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DryingGoalRecord_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DryingGoalRecord_goalAchieved_idx"   ON "DryingGoalRecord"("goalAchieved");
CREATE INDEX "DryingGoalRecord_goalAchievedAt_idx" ON "DryingGoalRecord"("goalAchievedAt");
