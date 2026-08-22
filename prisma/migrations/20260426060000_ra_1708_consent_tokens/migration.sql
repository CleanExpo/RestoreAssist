-- RA-1708 / P0-4 — Pi-Sign consent token (ETA 1999/2002 sufficiency).
-- Adds the AttestationConsentToken table and signer audit columns on
-- ProgressAttestation. Required by app/api/progress/[reportId]/attest
-- post-merge; backwards-compatible with rows written before this lands
-- (existing rows have NULL consentTokenId/signerIp/etc.).

ALTER TABLE "ProgressAttestation"
    ADD COLUMN "consentTokenId" TEXT,
    ADD COLUMN "signerIp" TEXT,
    ADD COLUMN "signerUserAgent" TEXT,
    ADD COLUMN "contentHash" TEXT;

CREATE TABLE "AttestationConsentToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "attestationType" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttestationConsentToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttestationConsentToken_userId_expiresAt_idx"
    ON "AttestationConsentToken"("userId", "expiresAt");

CREATE INDEX "AttestationConsentToken_reportId_idx"
    ON "AttestationConsentToken"("reportId");

CREATE INDEX "AttestationConsentToken_consumedAt_idx"
    ON "AttestationConsentToken"("consumedAt");
