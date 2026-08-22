-- RA-4861: First-class persistence for client portal access tokens.
--
-- Replaces the ad-hoc HMAC-signed string token used by
-- `app/portal/[token]/page.tsx` with a revocable, rotatable, auditable
-- row per Client. The legacy `lib/portal-token.ts` HMAC tokens continue
-- to validate against the inspection-scoped flow during the cutover
-- window — no data migration is needed because no rows in the existing
-- system are persisted (HMAC tokens were stateless).

-- CreateTable
CREATE TABLE "ClientPortalAccount" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenRotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastAccessedAt" TIMESTAMP(3),

    CONSTRAINT "ClientPortalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalAccount_token_key" ON "ClientPortalAccount"("token");

-- CreateIndex
CREATE INDEX "ClientPortalAccount_clientId_idx" ON "ClientPortalAccount"("clientId");

-- CreateIndex
CREATE INDEX "ClientPortalAccount_token_idx" ON "ClientPortalAccount"("token");

-- AddForeignKey
ALTER TABLE "ClientPortalAccount" ADD CONSTRAINT "ClientPortalAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
