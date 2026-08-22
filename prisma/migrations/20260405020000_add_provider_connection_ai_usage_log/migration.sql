-- RA-414: ProviderConnection table + AiUsageLog async logging
-- Replaces ad-hoc BYOK config with a proper workspace-scoped credential store.
-- AiUsageLog tracks every AI call (tokens, cost, latency) from day one.

-- CreateEnum: AiProvider
CREATE TYPE "AiProvider" AS ENUM ('ANTHROPIC', 'OPENAI', 'GOOGLE', 'GEMMA');

-- CreateEnum: ProviderConnectionStatus
CREATE TYPE "ProviderConnectionStatus" AS ENUM ('ACTIVE', 'FAILED', 'DISABLED');

-- CreateTable: ProviderConnection
CREATE TABLE "ProviderConnection" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "provider" "AiProvider" NOT NULL,
  "status" "ProviderConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "encryptedCredentials" TEXT NOT NULL,
  "lastValidatedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdByMemberId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AiUsageLog
CREATE TABLE "AiUsageLog" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "memberId" TEXT,
  "provider" "AiProvider" NOT NULL,
  "model" TEXT NOT NULL,
  "taskType" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL,
  "outputTokens" INTEGER NOT NULL,
  "estimatedCostUsd" DOUBLE PRECISION NOT NULL,
  "latencyMs" INTEGER NOT NULL,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "errorType" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- Indexes: ProviderConnection
CREATE UNIQUE INDEX "ProviderConnection_workspaceId_provider_key" ON "ProviderConnection"("workspaceId", "provider");
CREATE INDEX "ProviderConnection_workspaceId_idx" ON "ProviderConnection"("workspaceId");
CREATE INDEX "ProviderConnection_provider_idx" ON "ProviderConnection"("provider");
CREATE INDEX "ProviderConnection_status_idx" ON "ProviderConnection"("status");

-- Indexes: AiUsageLog
CREATE INDEX "AiUsageLog_workspaceId_createdAt_idx" ON "AiUsageLog"("workspaceId", "createdAt");
CREATE INDEX "AiUsageLog_memberId_idx" ON "AiUsageLog"("memberId");
CREATE INDEX "AiUsageLog_provider_idx" ON "AiUsageLog"("provider");
CREATE INDEX "AiUsageLog_taskType_idx" ON "AiUsageLog"("taskType");
CREATE INDEX "AiUsageLog_success_idx" ON "AiUsageLog"("success");
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

-- ForeignKeys
ALTER TABLE "ProviderConnection" ADD CONSTRAINT "ProviderConnection_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "ProviderConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiUsageLog" ENABLE ROW LEVEL SECURITY;

-- RLS: ProviderConnection — workspace members can view; only owner can manage
CREATE POLICY "ProviderConnection_select_member" ON "ProviderConnection"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "WorkspaceMember" wm
      WHERE wm."workspaceId" = "workspaceId"
        AND wm."userId" = auth.uid()::text
        AND wm."status" = 'ACTIVE'
    )
  );
CREATE POLICY "ProviderConnection_insert_owner" ON "ProviderConnection"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Workspace" w
      WHERE w."id" = "workspaceId" AND w."ownerId" = auth.uid()::text
    )
  );
CREATE POLICY "ProviderConnection_update_owner" ON "ProviderConnection"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "Workspace" w
      WHERE w."id" = "workspaceId" AND w."ownerId" = auth.uid()::text
    )
  );
CREATE POLICY "ProviderConnection_delete_owner" ON "ProviderConnection"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "Workspace" w
      WHERE w."id" = "workspaceId" AND w."ownerId" = auth.uid()::text
    )
  );

-- RLS: AiUsageLog — workspace members can view their workspace logs
CREATE POLICY "AiUsageLog_select_member" ON "AiUsageLog"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "WorkspaceMember" wm
      WHERE wm."workspaceId" = "workspaceId"
        AND wm."userId" = auth.uid()::text
        AND wm."status" = 'ACTIVE'
    )
  );
-- Inserts are server-side only (service role) — no client INSERT policy
