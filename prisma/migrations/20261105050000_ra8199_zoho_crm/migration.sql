-- RA-8199: Zoho CRM as an OAuth integration provider, plus a durable
-- outbound upsert queue. ADD VALUE only extends the enum; no existing
-- value is renamed or removed. The new value is not used in this file.
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'ZOHO';

CREATE TABLE IF NOT EXISTS "ZohoSyncJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ZohoSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ZohoSyncJob_userId_entityType_entityId_key"
  ON "ZohoSyncJob"("userId", "entityType", "entityId");

CREATE INDEX IF NOT EXISTS "ZohoSyncJob_status_createdAt_idx"
  ON "ZohoSyncJob"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "ZohoSyncJob_userId_idx"
  ON "ZohoSyncJob"("userId");
