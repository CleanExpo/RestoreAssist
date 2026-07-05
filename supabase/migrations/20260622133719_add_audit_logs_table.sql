-- CreateTable
-- Audit log for all security events, admin actions, and system changes.
-- Used by lib/services/audit.service.ts (logAuditEvent, logContractorVerification, etc.)
-- NOTE: FK constraints omitted — tenants table not present in this DB instance;
--       userId references "User" (Prisma) not legacy "users" (uuid). Can be re-added
--       once tenant schema is reconciled.

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "performedBy" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "userId" TEXT,
    "userEmail" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "status" TEXT,
    "details" TEXT,
    "errorMessage" TEXT,
    "severity" TEXT,
    "workspaceId" TEXT,
    "metadata" JSONB,
    "changes" JSONB,
    "timestamp" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE INDEX "audit_logs_entityId_idx" ON "audit_logs"("entityId");
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType");
CREATE INDEX "audit_logs_performedBy_idx" ON "audit_logs"("performedBy");
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX "audit_logs_workspaceId_idx" ON "audit_logs"("workspaceId");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_tenantId_idx" ON "audit_logs"("tenantId");
