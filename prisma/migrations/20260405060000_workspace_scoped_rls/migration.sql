-- RA-413: Workspace-scoped RLS for customer data tables
-- Applies to: Client, Report, Inspection, Invoice, Integration, CostLibrary
-- Strategy: dual-access model
--   1. Legacy userId ownership (backward compat — rows with NULL workspaceId still accessible by owner)
--   2. Workspace membership — any ACTIVE member of the row's workspace can access
-- All policies use OR so that neither path blocks the other during migration.
--
-- Supabase-only auth.uid() helpers/policies: skip on DigitalOcean/Heroku Postgres
-- where the auth schema does not exist (P3018 / 3F000). RLS is still ENABLED
-- (default-deny for non-owner roles; Prisma BYPASSRLS unaffected).

-- Enable RLS regardless of auth (defense-in-depth default-deny without policies)
ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Report" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Inspection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Integration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CostLibrary" ENABLE ROW LEVEL SECURITY;

-- Helpers + policies require auth.uid()
DO $ra413$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    RAISE NOTICE 'auth schema missing — skipping workspace-scoped RLS helpers/policies (non-Supabase Postgres)';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    RAISE NOTICE 'auth.uid() missing — skipping workspace-scoped RLS helpers/policies';
    RETURN;
  END IF;

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
  DROP POLICY IF EXISTS "Client_select" ON "Client";
  CREATE POLICY "Client_select" ON "Client"
    FOR SELECT USING (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "Client_insert" ON "Client";
  CREATE POLICY "Client_insert" ON "Client"
    FOR INSERT WITH CHECK (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "Client_update" ON "Client";
  CREATE POLICY "Client_update" ON "Client"
    FOR UPDATE USING (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "Client_delete" ON "Client";
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
  DROP POLICY IF EXISTS "Report_select" ON "Report";
  CREATE POLICY "Report_select" ON "Report"
    FOR SELECT USING (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "Report_insert" ON "Report";
  CREATE POLICY "Report_insert" ON "Report"
    FOR INSERT WITH CHECK (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "Report_update" ON "Report";
  CREATE POLICY "Report_update" ON "Report"
    FOR UPDATE USING (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "Report_delete" ON "Report";
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
  DROP POLICY IF EXISTS "Inspection_select" ON "Inspection";
  CREATE POLICY "Inspection_select" ON "Inspection"
    FOR SELECT USING (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "Inspection_insert" ON "Inspection";
  CREATE POLICY "Inspection_insert" ON "Inspection"
    FOR INSERT WITH CHECK (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "Inspection_update" ON "Inspection";
  CREATE POLICY "Inspection_update" ON "Inspection"
    FOR UPDATE USING (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "Inspection_delete" ON "Inspection";
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
  DROP POLICY IF EXISTS "Invoice_select" ON "Invoice";
  CREATE POLICY "Invoice_select" ON "Invoice"
    FOR SELECT USING (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "Invoice_insert" ON "Invoice";
  CREATE POLICY "Invoice_insert" ON "Invoice"
    FOR INSERT WITH CHECK (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "Invoice_update" ON "Invoice";
  CREATE POLICY "Invoice_update" ON "Invoice"
    FOR UPDATE USING (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "Invoice_delete" ON "Invoice";
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
  DROP POLICY IF EXISTS "Integration_select" ON "Integration";
  CREATE POLICY "Integration_select" ON "Integration"
    FOR SELECT USING (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "Integration_insert" ON "Integration";
  CREATE POLICY "Integration_insert" ON "Integration"
    FOR INSERT WITH CHECK (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "Integration_update" ON "Integration";
  CREATE POLICY "Integration_update" ON "Integration"
    FOR UPDATE USING (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "Integration_delete" ON "Integration";
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
  DROP POLICY IF EXISTS "CostLibrary_select" ON "CostLibrary";
  CREATE POLICY "CostLibrary_select" ON "CostLibrary"
    FOR SELECT USING (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "CostLibrary_insert" ON "CostLibrary";
  CREATE POLICY "CostLibrary_insert" ON "CostLibrary"
    FOR INSERT WITH CHECK (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "CostLibrary_update" ON "CostLibrary";
  CREATE POLICY "CostLibrary_update" ON "CostLibrary"
    FOR UPDATE USING (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId"))
      )
    );

  DROP POLICY IF EXISTS "CostLibrary_delete" ON "CostLibrary";
  CREATE POLICY "CostLibrary_delete" ON "CostLibrary"
    FOR DELETE USING (
      "userId" = auth.uid()::text
      OR (
        "workspaceId" IS NOT NULL
        AND is_workspace_owner("workspaceId")
      )
    );
END
$ra413$;

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
