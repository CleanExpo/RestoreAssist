-- Durable API idempotency cache for mobile/offline retry replay and
-- serverless multi-instance safety.

CREATE TABLE "IdempotencyRecord" (
  "id" TEXT NOT NULL,
  "cacheKey" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "responseStatus" INTEGER,
  "responseBody" TEXT,
  "responseContentType" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyRecord_cacheKey_key" ON "IdempotencyRecord"("cacheKey");
CREATE INDEX "IdempotencyRecord_scope_key_idx" ON "IdempotencyRecord"("scope", "key");
CREATE INDEX "IdempotencyRecord_status_expiresAt_idx" ON "IdempotencyRecord"("status", "expiresAt");
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");
