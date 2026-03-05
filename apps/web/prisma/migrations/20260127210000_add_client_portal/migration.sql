-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('SCOPE_OF_WORK', 'COST_ESTIMATE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateTable
CREATE TABLE "ClientUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "clientId" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportApproval" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "approvalType" "ApprovalType" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "clientComments" TEXT,
    "amount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientUser_email_key" ON "ClientUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ClientUser_clientId_key" ON "ClientUser"("clientId");

-- CreateIndex
CREATE INDEX "ClientUser_email_idx" ON "ClientUser"("email");

-- CreateIndex
CREATE INDEX "ClientUser_clientId_idx" ON "ClientUser"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalInvitation_token_key" ON "PortalInvitation"("token");

-- CreateIndex
CREATE INDEX "PortalInvitation_token_idx" ON "PortalInvitation"("token");

-- CreateIndex
CREATE INDEX "PortalInvitation_email_idx" ON "PortalInvitation"("email");

-- CreateIndex
CREATE INDEX "PortalInvitation_clientId_idx" ON "PortalInvitation"("clientId");

-- CreateIndex
CREATE INDEX "PortalInvitation_userId_idx" ON "PortalInvitation"("userId");

-- CreateIndex
CREATE INDEX "PortalInvitation_status_expiresAt_idx" ON "PortalInvitation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ReportApproval_reportId_approvalType_idx" ON "ReportApproval"("reportId", "approvalType");

-- CreateIndex
CREATE INDEX "ReportApproval_status_idx" ON "ReportApproval"("status");

-- AddForeignKey
ALTER TABLE "ClientUser" ADD CONSTRAINT "ClientUser_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalInvitation" ADD CONSTRAINT "PortalInvitation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalInvitation" ADD CONSTRAINT "PortalInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportApproval" ADD CONSTRAINT "ReportApproval_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
