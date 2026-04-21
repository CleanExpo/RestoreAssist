-- RA-1352: admin impersonation audit trail.
CREATE TABLE "AdminImpersonation" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    CONSTRAINT "AdminImpersonation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminImpersonation_tokenId_key" ON "AdminImpersonation"("tokenId");
CREATE INDEX "AdminImpersonation_adminUserId_startedAt_idx" ON "AdminImpersonation"("adminUserId", "startedAt");
CREATE INDEX "AdminImpersonation_targetUserId_startedAt_idx" ON "AdminImpersonation"("targetUserId", "startedAt");
CREATE INDEX "AdminImpersonation_expiresAt_idx" ON "AdminImpersonation"("expiresAt");

ALTER TABLE "AdminImpersonation" ADD CONSTRAINT "AdminImpersonation_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminImpersonation" ADD CONSTRAINT "AdminImpersonation_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
