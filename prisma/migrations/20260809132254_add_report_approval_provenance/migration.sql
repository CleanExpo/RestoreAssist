-- CreateEnum
CREATE TYPE "ReportApprovalResponseSource" AS ENUM ('CLIENT_PORTAL');

-- AlterTable
ALTER TABLE "ReportApproval"
ADD COLUMN "responseSource" "ReportApprovalResponseSource",
ADD COLUMN "respondedByClientUserId" TEXT,
ADD COLUMN "responseReportVersion" INTEGER,
ADD COLUMN "responseReportUpdatedAt" TIMESTAMP(3);
