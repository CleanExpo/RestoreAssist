CREATE TABLE "NativeAuthNonce" (
  "id" TEXT NOT NULL,
  "nonceHash" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NativeAuthNonce_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NativeAuthNonce_provider_check" CHECK ("provider" IN ('apple','google'))
);
CREATE UNIQUE INDEX "NativeAuthNonce_nonceHash_key" ON "NativeAuthNonce"("nonceHash");
CREATE INDEX "NativeAuthNonce_provider_expiresAt_idx" ON "NativeAuthNonce"("provider", "expiresAt");
-- SERVICE_ONLY: authentication challenge material is server-only.
ALTER TABLE "NativeAuthNonce" ENABLE ROW LEVEL SECURITY;
