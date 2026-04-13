-- RA-413: Workspace-scoped RLS for customer data tables
-- Applies to: Client, Report, Inspection, Invoice, Integration, CostLibrary
-- Strategy: dual-access model
--   1. Legacy userId ownership (backward compat — rows with NULL workspaceId still accessible by owner)
--   2. Workspace membership — any ACTIVE member of the row's workspace can access
-- All policies use OR so that neither path blocks the other during migration.

-- ============================================================
-- HELPER: is the current user an ACTIVE member of a workspace?
-- ============================================================
CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "WorkspaceMember"
    WHERE "workspaceId" = p_workspace_id
      AND "userId" = auth.uid()::text
      AND "status" = 'ACTIVE'
  )
$$;

-- ============================================================
-- HELPER: is the current user the owner of a workspace?
-- ============================================================
CREATE OR REPLACE FUNCTION is_workspace_owner(p_workspace_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Workspace"
    WHERE "id" = p_workspace_id
      AND "ownerId" = auth.uid()::text
  )
$$;

-- ============================================================
-- CLIENT
-- ============================================================
ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client_select" ON "Client"
  FOR SELECT USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "Client_insert" ON "Client"
  FOR INSERT WITH CHECK (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "Client_update" ON "Client"
  FOR UPDATE USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "Client_delete" ON "Client"
  FOR DELETE USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND is_workspace_owner("workspaceId")
    )
  );

-- ============================================================
-- REPORT
-- ============================================================
ALTER TABLE "Report" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Report_select" ON "Report"
  FOR SELECT USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "Report_insert" ON "Report"
  FOR INSERT WITH CHECK (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "Report_update" ON "Report"
  FOR UPDATE USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "Report_delete" ON "Report"
  FOR DELETE USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND is_workspace_owner("workspaceId")
    )
  );

-- ============================================================
-- INSPECTION
-- ============================================================
ALTER TABLE "Inspection" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inspection_select" ON "Inspection"
  FOR SELECT USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "Inspection_insert" ON "Inspection"
  FOR INSERT WITH CHECK (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "Inspection_update" ON "Inspection"
  FOR UPDATE USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "Inspection_delete" ON "Inspection"
  FOR DELETE USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND is_workspace_owner("workspaceId")
    )
  );

-- ============================================================
-- INVOICE
-- ============================================================
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invoice_select" ON "Invoice"
  FOR SELECT USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "Invoice_insert" ON "Invoice"
  FOR INSERT WITH CHECK (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "Invoice_update" ON "Invoice"
  FOR UPDATE USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "Invoice_delete" ON "Invoice"
  FOR DELETE USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND is_workspace_owner("workspaceId")
    )
  );

-- ============================================================
-- INTEGRATION
-- ============================================================
ALTER TABLE "Integration" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Integration_select" ON "Integration"
  FOR SELECT USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "Integration_insert" ON "Integration"
  FOR INSERT WITH CHECK (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "Integration_update" ON "Integration"
  FOR UPDATE USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "Integration_delete" ON "Integration"
  FOR DELETE USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND is_workspace_owner("workspaceId")
    )
  );

-- ============================================================
-- COSTLIBRARY
-- ============================================================
ALTER TABLE "CostLibrary" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CostLibrary_select" ON "CostLibrary"
  FOR SELECT USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "CostLibrary_insert" ON "CostLibrary"
  FOR INSERT WITH CHECK (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "CostLibrary_update" ON "CostLibrary"
  FOR UPDATE USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
    )
  );

CREATE POLICY "CostLibrary_delete" ON "CostLibrary"
  FOR DELETE USING (
    "userId" = auth.uid()::text
    OR (
      "workspaceId" IS NOT NULL
      AND is_workspace_owner("workspaceId")
    )
  );

-- ============================================================
-- SEED: Default system workspace for legacy/seed data backfill
-- Creates a single 'system' workspace owned by the first admin
-- user found, or skips if one already exists.
-- All existing rows with NULL workspaceId remain accessible via
-- the legacy userId path — no bulk UPDATE needed.
-- ============================================================
INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "status", "createdAt", "updatedAt")
SELECT
  'ws-system-default',
  'RestoreAssist (Default)',
  'restoreassist-default',
  u."id",
  'READY',
  NOW(),
  NOW()
FROM "User" u
WHERE u."role" = 'ADMIN'
ORDER BY u."createdAt" ASC
LIMIT 1
ON CONFLICT ("id") DO NOTHING;
