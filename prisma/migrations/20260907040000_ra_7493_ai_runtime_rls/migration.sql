-- RA-7493: row-level security for the five AI-runtime tables.
--
-- WHY THIS EXISTS: the repo's own guard demanded it. Adding the tables in
-- 20260907030000 turned `scripts/__tests__/audit-rls-coverage.test.ts`
-- ("RA-6677 — a new un-RLS'd model fails CI") red, naming all five:
--
--   models with no RLS-enable migration and absent from PENDING_RLS/RLS_EXEMPT
--   → AiJobSuggestion, AiRunnerBudget, AiRunnerFlag, AiRunnerReceipt,
--     AiStyleProfile
--
-- The guard offers two ways out: an RLS migration, or RLS_EXEMPT with a reason.
-- Exempting them would be the wrong one. These five hold a tenant's AI spend,
-- their job suggestions, their receipts and the writing profile learned from
-- their own documents — the most tenant-private data the runtime will handle.
-- PR #2178 was a customer's ADMIN role reaching another customer's records; the
-- answer to that is not a exemption list.
--
-- POSTURE: read for active members of the owning workspace, writes server-side
-- only. There is deliberately no INSERT/UPDATE/DELETE policy:
--   * a member must not be able to forge or amend a receipt — the ledger is
--     append-only and the server is the only author;
--   * a member must not be able to flip their own runner flag or raise their
--     own budget;
--   * accepting or dismissing a suggestion goes through a route handler, which
--     connects as the owner role and is not subject to these policies.
-- Default-deny is therefore the correct posture for every write.
--
-- `(select auth.uid())`, not bare `auth.uid()`: scripts/lint-rls-policy-initplan.mjs
-- rejects the bare form on any NEW policy. It exists because RA-4956
-- reintroduced 27 unwrapped calls across 24 policies after RA-4827 had removed
-- them. The wrapped form is evaluated once per query rather than once per row.
--
-- The workspace column is qualified with its own table name on both sides of
-- the comparison. An unqualified `"workspaceId"` inside the subquery resolves
-- to WorkspaceMember's column first, which silently compares that column to
-- itself and makes the policy true for every row — a policy that reads like
-- tenant isolation and enforces nothing.
--
-- Additive and idempotent: DROP POLICY IF EXISTS before each CREATE so a replay
-- is a no-op; ALTER TABLE ... ENABLE is idempotent in Postgres. No table,
-- column, constraint or index is altered or removed.

ALTER TABLE "AiRunnerFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiRunnerBudget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiRunnerReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiJobSuggestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiStyleProfile" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "AiRunnerFlag_select_member" ON "AiRunnerFlag";
CREATE POLICY "AiRunnerFlag_select_member" ON "AiRunnerFlag"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "WorkspaceMember" wm
      WHERE wm."workspaceId" = "AiRunnerFlag"."workspaceId"
        AND wm."userId" = (select auth.uid())::text
        AND wm."status" = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS "AiRunnerBudget_select_member" ON "AiRunnerBudget";
CREATE POLICY "AiRunnerBudget_select_member" ON "AiRunnerBudget"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "WorkspaceMember" wm
      WHERE wm."workspaceId" = "AiRunnerBudget"."workspaceId"
        AND wm."userId" = (select auth.uid())::text
        AND wm."status" = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS "AiRunnerReceipt_select_member" ON "AiRunnerReceipt";
CREATE POLICY "AiRunnerReceipt_select_member" ON "AiRunnerReceipt"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "WorkspaceMember" wm
      WHERE wm."workspaceId" = "AiRunnerReceipt"."workspaceId"
        AND wm."userId" = (select auth.uid())::text
        AND wm."status" = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS "AiJobSuggestion_select_member" ON "AiJobSuggestion";
CREATE POLICY "AiJobSuggestion_select_member" ON "AiJobSuggestion"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "WorkspaceMember" wm
      WHERE wm."workspaceId" = "AiJobSuggestion"."workspaceId"
        AND wm."userId" = (select auth.uid())::text
        AND wm."status" = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS "AiStyleProfile_select_member" ON "AiStyleProfile";
CREATE POLICY "AiStyleProfile_select_member" ON "AiStyleProfile"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "WorkspaceMember" wm
      WHERE wm."workspaceId" = "AiStyleProfile"."workspaceId"
        AND wm."userId" = (select auth.uid())::text
        AND wm."status" = 'ACTIVE'
    )
  );
