-- Migration: add_historical_jobs
-- Date: 2026-04-09
-- Adds HistoricalJob model for vector similarity search (Ascora import Phase 4)

CREATE TABLE IF NOT EXISTS "HistoricalJob" (
    "id"            TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "tenantId"      TEXT NOT NULL,
    "source"        TEXT NOT NULL,
    "externalId"    TEXT NOT NULL,
    "jobNumber"     TEXT NOT NULL,
    "jobName"       TEXT NOT NULL,
    "description"   TEXT NOT NULL,
    "claimType"     TEXT NOT NULL,
    "waterCategory" TEXT,
    "waterClass"    TEXT,
    "address"       TEXT,
    "suburb"        TEXT NOT NULL,
    "state"         TEXT NOT NULL,
    "postcode"      TEXT NOT NULL,
    "customerName"  TEXT,
    "totalExTax"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalIncTax"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedDate" TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoricalJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "HistoricalJob_source_externalId_key" ON "HistoricalJob"("source", "externalId");
CREATE INDEX IF NOT EXISTS "HistoricalJob_tenantId_idx"      ON "HistoricalJob"("tenantId");
CREATE INDEX IF NOT EXISTS "HistoricalJob_source_idx"        ON "HistoricalJob"("source");
CREATE INDEX IF NOT EXISTS "HistoricalJob_claimType_idx"     ON "HistoricalJob"("claimType");
CREATE INDEX IF NOT EXISTS "HistoricalJob_state_idx"         ON "HistoricalJob"("state");
CREATE INDEX IF NOT EXISTS "HistoricalJob_completedDate_idx" ON "HistoricalJob"("completedDate");
