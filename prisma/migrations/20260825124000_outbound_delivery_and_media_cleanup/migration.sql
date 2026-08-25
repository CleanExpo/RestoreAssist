CREATE TABLE "OutboundEmailDelivery" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider" TEXT,
  "providerMessageId" TEXT,
  "payloadHash" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastError" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolutionEvidence" TEXT,
  "resolvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutboundEmailDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutboundEmailDelivery_status_check"
    CHECK ("status" IN ('PENDING','SENT','FAILED','AMBIGUOUS'))
);
CREATE UNIQUE INDEX "OutboundEmailDelivery_idempotencyKey_key"
  ON "OutboundEmailDelivery"("idempotencyKey");
CREATE INDEX "OutboundEmailDelivery_kind_status_idx"
  ON "OutboundEmailDelivery"("kind", "status");
CREATE INDEX "OutboundEmailDelivery_recipient_idx"
  ON "OutboundEmailDelivery"("recipient");
-- SERVICE_ONLY: contains recipient identities and provider delivery evidence.
-- No authenticated/client policy is created; only the server's privileged DB
-- role may inspect or reconcile these rows.
ALTER TABLE "OutboundEmailDelivery" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "MediaCleanupTask" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaCleanupTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MediaCleanupTask_status_check"
    CHECK ("status" IN ('PENDING','COMPLETE','FAILED'))
);
CREATE UNIQUE INDEX "MediaCleanupTask_publicId_key"
  ON "MediaCleanupTask"("publicId");
CREATE INDEX "MediaCleanupTask_status_createdAt_idx"
  ON "MediaCleanupTask"("status", "createdAt");
-- SERVICE_ONLY: publicId identifies uploaded customer PII. Browser/client roles
-- receive no policy; cleanup runs only through the cron-authenticated server.
ALTER TABLE "MediaCleanupTask" ENABLE ROW LEVEL SECURITY;
