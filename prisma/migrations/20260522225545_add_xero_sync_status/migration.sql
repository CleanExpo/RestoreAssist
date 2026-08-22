-- RA-1112: Xero outbound sync lifecycle status rows
CREATE TABLE "XeroSyncStatus" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "xeroEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeroSyncStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "XeroSyncStatus_entityType_entityId_key" ON "XeroSyncStatus"("entityType", "entityId");
CREATE INDEX "XeroSyncStatus_userId_idx" ON "XeroSyncStatus"("userId");
CREATE INDEX "XeroSyncStatus_state_nextRetryAt_idx" ON "XeroSyncStatus"("state", "nextRetryAt");

ALTER TABLE "XeroSyncStatus"
ADD CONSTRAINT "XeroSyncStatus_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
