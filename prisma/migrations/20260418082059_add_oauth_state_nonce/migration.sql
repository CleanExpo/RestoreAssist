-- RA-1285: DB-backed one-time-use OAuth state nonce for CSRF protection.
-- Prior impl encoded state as base64 JSON with an unused nonce — replay
-- attacks within the 10-min TTL were possible. Now nonces are stored,
-- single-use, and deleted after callback.

CREATE TABLE "OAuthStateNonce" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthStateNonce_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OAuthStateNonce_nonce_key" ON "OAuthStateNonce"("nonce");
CREATE INDEX "OAuthStateNonce_expiresAt_idx" ON "OAuthStateNonce"("expiresAt");
CREATE INDEX "OAuthStateNonce_userId_provider_idx" ON "OAuthStateNonce"("userId", "provider");
