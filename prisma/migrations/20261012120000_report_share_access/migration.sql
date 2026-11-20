-- CreateEnum
CREATE TYPE "ReportShareScope" AS ENUM ('OWNER_VIEW', 'INSURER');

-- CreateTable
CREATE TABLE "ReportShareAccess" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "scope" "ReportShareScope" NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3),

    CONSTRAINT "ReportShareAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportShareAccess_token_key" ON "ReportShareAccess"("token");

-- CreateIndex
CREATE INDEX "ReportShareAccess_reportId_idx" ON "ReportShareAccess"("reportId");

-- CreateIndex
CREATE INDEX "ReportShareAccess_reportId_scope_idx" ON "ReportShareAccess"("reportId", "scope");

-- CreateIndex
CREATE INDEX "ReportShareAccess_revokedAt_idx" ON "ReportShareAccess"("revokedAt");

-- AddForeignKey
ALTER TABLE "ReportShareAccess" ADD CONSTRAINT "ReportShareAccess_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportShareAccess" ADD CONSTRAINT "ReportShareAccess_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
