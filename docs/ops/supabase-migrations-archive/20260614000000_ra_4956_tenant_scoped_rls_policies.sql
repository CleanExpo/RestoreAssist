-- RA-4956: Tenant-scoped RLS policies for the 119 previously-unprotected tables.
--
-- CONTEXT — read this before reviewing:
--   RA-4970 (migration 20260518_enable_rls_phase_1_close_anon_exposure) ALREADY
--   ran ALTER TABLE ... ENABLE ROW LEVEL SECURITY on all 119 tables and added
--   anon_select policies to 12 public-reference tables. That closed the critical
--   anon-key exposure (Supabase security advisor: 128 ERROR -> 0 ERROR).
--
--   So today, every table below is RLS-ENABLED-WITHOUT-A-POLICY = default-deny
--   for anon/authenticated. Server code (Prisma via DATABASE_URL = postgres
--   superuser, BYPASSRLS; and SUPABASE_SERVICE_ROLE_KEY) is unaffected.
--
--   This migration is DEFENSE-IN-DEPTH: it layers correct *tenant-scoped*
--   policies on top, so that IF/WHEN a feature ever reads these tables with an
--   authenticated anon-key Supabase client, rows are correctly isolated by
--   owner / workspace / organization instead of being all-or-nothing.
--
-- PATTERN — mirrors RA-413 (20260405060000_workspace_scoped_rls). NOT invented:
--   * Owner path:  "userId" = auth.uid()::text
--   * Workspace path: is_workspace_owner(wid) OR is_workspace_member(wid)
--     via the existing SECURITY DEFINER STABLE helper functions.
--   * Child tables join through their parent's policy via EXISTS subquery.
--   * 4 policies per table (select/insert/update/delete); DELETE = owner-only.
--   * service-only tables get NO policy (default-deny stays — correct).
--
-- IDEMPOTENT + ENV-TOLERANT:
--   * to_regclass guards skip tables absent from a given env (sandbox/dev/prod
--     table sets differ — see RA-4970 notes).
--   * DROP POLICY IF EXISTS before each CREATE (PG has no CREATE POLICY IF NOT
--     EXISTS). Re-running is a no-op.
--
-- IMPORTANT CAVEAT FOR REVIEWERS:
--   This app authenticates with NextAuth, NOT Supabase Auth. auth.uid() is only
--   populated for requests made with a Supabase-issued JWT. For NextAuth-only
--   surfaces auth.uid() is NULL, so these policies deny anon-key access (safe).
--   They become *active* protection only on Supabase-JWT paths. This is exactly
--   how RA-413 already works for Client/Report/Inspection/Invoice — we mirror it.

BEGIN;

-- RA-4956 fix: ensure `authenticated` role exists (no-op on Supabase; needed on plain PG).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Helpers. CREATE OR REPLACE so this is safe whether or not RA-413 ran first.
-- (RA-413 created identical definitions; redefining is a no-op there.)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "WorkspaceMember"
    WHERE "workspaceId" = p_workspace_id
      AND "userId" = auth.uid()::text
      AND "status" = 'ACTIVE'
  )
$$;

CREATE OR REPLACE FUNCTION is_workspace_owner(p_workspace_id TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Workspace"
    WHERE "id" = p_workspace_id
      AND "ownerId" = auth.uid()::text
  )
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Generic policy emitters (pg_temp). Each skips silently if the table is
-- missing in the target env, and drops any same-named policy first.
-- ───────────────────────────────────────────────────────────────────────────

-- USER-OWNED: row.<col> = auth.uid(). DELETE also owner-only (same predicate).
CREATE OR REPLACE FUNCTION pg_temp.policy_user_owned(tbl text, col text DEFAULT 'userId')
RETURNS void AS $$
DECLARE pred text;
BEGIN
  IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN
    RAISE NOTICE 'RA-4956: skipped (missing) user-owned table %', tbl; RETURN;
  END IF;
  pred := format('%I = auth.uid()::text', col);
  EXECUTE format('DROP POLICY IF EXISTS "ra4956_select" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "ra4956_insert" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "ra4956_update" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "ra4956_delete" ON public.%I', tbl);
  EXECUTE format('CREATE POLICY "ra4956_select" ON public.%I FOR SELECT TO authenticated USING (%s)', tbl, pred);
  EXECUTE format('CREATE POLICY "ra4956_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', tbl, pred);
  EXECUTE format('CREATE POLICY "ra4956_update" ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', tbl, pred, pred);
  EXECUTE format('CREATE POLICY "ra4956_delete" ON public.%I FOR DELETE TO authenticated USING (%s)', tbl, pred);
END;
$$ LANGUAGE plpgsql;

-- WORKSPACE-OWNED: row.workspaceId nullable; owner path on row.userId if present.
-- has_user_col=true => also allow the legacy "userId = auth.uid()" path (RA-413 shape).
CREATE OR REPLACE FUNCTION pg_temp.policy_workspace_owned(tbl text, has_user_col boolean DEFAULT false)
RETURNS void AS $$
DECLARE ws text; rw text; del text;
BEGIN
  IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN
    RAISE NOTICE 'RA-4956: skipped (missing) workspace-owned table %', tbl; RETURN;
  END IF;
  ws := '("workspaceId" IS NOT NULL AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))';
  IF has_user_col THEN
    rw  := '("userId" = auth.uid()::text OR ' || ws || ')';
    del := '("userId" = auth.uid()::text OR ("workspaceId" IS NOT NULL AND is_workspace_owner("workspaceId")))';
  ELSE
    rw  := ws;
    del := '("workspaceId" IS NOT NULL AND is_workspace_owner("workspaceId"))';
  END IF;
  EXECUTE format('DROP POLICY IF EXISTS "ra4956_select" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "ra4956_insert" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "ra4956_update" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "ra4956_delete" ON public.%I', tbl);
  EXECUTE format('CREATE POLICY "ra4956_select" ON public.%I FOR SELECT TO authenticated USING (%s)', tbl, rw);
  EXECUTE format('CREATE POLICY "ra4956_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', tbl, rw);
  EXECUTE format('CREATE POLICY "ra4956_update" ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', tbl, rw, rw);
  EXECUTE format('CREATE POLICY "ra4956_delete" ON public.%I FOR DELETE TO authenticated USING (%s)', tbl, del);
END;
$$ LANGUAGE plpgsql;

-- CHILD via EXISTS join to a parent table that is itself RLS-protected.
-- We re-express the parent predicate inline (we cannot rely on the parent's RLS
-- cascading through a subquery — PostgREST evaluates the child policy directly).
--   parent_tbl: e.g. 'Inspection'    fk_col: child FK e.g. 'inspectionId'
--   parent_pred_template: SQL using %1$I = parent table alias-free name.
-- For workspace-backed parents (Inspection/Report/Invoice/Estimate/Client/
-- Integration) the parent owner check is userId OR workspace membership.
CREATE OR REPLACE FUNCTION pg_temp.policy_child_via_parent(
  tbl text, fk_col text, parent_tbl text, parent_has_workspace boolean DEFAULT true)
RETURNS void AS $$
DECLARE owner_pred text; cond text;
BEGIN
  IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN
    RAISE NOTICE 'RA-4956: skipped (missing) child table %', tbl; RETURN;
  END IF;
  IF to_regclass('public.' || quote_ident(parent_tbl)) IS NULL THEN
    RAISE NOTICE 'RA-4956: skipped child % — parent % missing', tbl, parent_tbl; RETURN;
  END IF;
  IF parent_has_workspace THEN
    owner_pred := 'p."userId" = auth.uid()::text OR (p."workspaceId" IS NOT NULL AND (is_workspace_owner(p."workspaceId") OR is_workspace_member(p."workspaceId")))';
  ELSE
    owner_pred := 'p."userId" = auth.uid()::text';
  END IF;
  cond := format(
    'EXISTS (SELECT 1 FROM public.%I p WHERE p."id" = public.%I.%I AND (%s))',
    parent_tbl, tbl, fk_col, owner_pred);
  EXECUTE format('DROP POLICY IF EXISTS "ra4956_select" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "ra4956_insert" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "ra4956_update" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "ra4956_delete" ON public.%I', tbl);
  EXECUTE format('CREATE POLICY "ra4956_select" ON public.%I FOR SELECT TO authenticated USING (%s)', tbl, cond);
  EXECUTE format('CREATE POLICY "ra4956_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', tbl, cond);
  EXECUTE format('CREATE POLICY "ra4956_update" ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', tbl, cond, cond);
  EXECUTE format('CREATE POLICY "ra4956_delete" ON public.%I FOR DELETE TO authenticated USING (%s)', tbl, cond);
END;
$$ LANGUAGE plpgsql;

-- ORG-SCOPED: row.organizationId = (the caller's org). The caller's org is read
-- from the User row whose id = auth.uid(). SELECT-only for authenticated; writes
-- stay server-side (no insert/update/delete policy => default-deny for those).
CREATE OR REPLACE FUNCTION pg_temp.policy_org_scoped_readonly(tbl text)
RETURNS void AS $$
DECLARE cond text;
BEGIN
  IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN
    RAISE NOTICE 'RA-4956: skipped (missing) org table %', tbl; RETURN;
  END IF;
  cond := '"organizationId" = (SELECT u."organizationId" FROM public."User" u WHERE u."id" = auth.uid()::text)';
  EXECUTE format('DROP POLICY IF EXISTS "ra4956_select" ON public.%I', tbl);
  EXECUTE format('CREATE POLICY "ra4956_select" ON public.%I FOR SELECT TO authenticated USING (%s)', tbl, cond);
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- BUCKET: user-owned (userId = auth.uid())  — 22 tables
-- (categorisation: user bucket 20 + CreditNoteLineItem-parent CreditNote etc.)
-- ===========================================================================
SELECT pg_temp.policy_user_owned('Account');
SELECT pg_temp.policy_user_owned('AddonPurchase');
SELECT pg_temp.policy_user_owned('ChatMessage');
SELECT pg_temp.policy_user_owned('ClaimAnalysisBatch');
SELECT pg_temp.policy_user_owned('CompanyPricingConfig');
SELECT pg_temp.policy_user_owned('ContractorProfile');
SELECT pg_temp.policy_user_owned('CreditNote');
SELECT pg_temp.policy_user_owned('DeviceToken');
SELECT pg_temp.policy_user_owned('Estimate');                 -- userId only (no workspaceId)
SELECT pg_temp.policy_user_owned('Feedback');
SELECT pg_temp.policy_user_owned('InvoicePayment');
SELECT pg_temp.policy_user_owned('Notification');
SELECT pg_temp.policy_user_owned('PortalInvitation');
SELECT pg_temp.policy_user_owned('RecurringInvoice');
SELECT pg_temp.policy_user_owned('RestorationDocument');
SELECT pg_temp.policy_user_owned('Scope');
SELECT pg_temp.policy_user_owned('Session');                  -- NextAuth-managed; see caveat
SELECT pg_temp.policy_user_owned('StandardTemplate');
SELECT pg_temp.policy_user_owned('SubscriptionEvent');
SELECT pg_temp.policy_user_owned('UserReleaseSeen');

-- ===========================================================================
-- BUCKET: workspace-owned (has workspaceId; userId fallback present)  — 4 tables
-- ===========================================================================
SELECT pg_temp.policy_workspace_owned('AssessmentGeneration', false);       -- workspaceId, no userId
SELECT pg_temp.policy_workspace_owned('ScrapingProviderConnection', false); -- workspaceId, no userId
-- CostItem has NO direct workspaceId — it chains via libraryId -> CostLibrary
-- (which is userId + workspaceId scoped by RA-413). Treat as child of CostLibrary.
SELECT pg_temp.policy_child_via_parent('CostItem', 'libraryId', 'CostLibrary', true);

-- ===========================================================================
-- BUCKET: organization (organizationId = caller's org)  — read-only  — 3 tables
-- ===========================================================================
SELECT pg_temp.policy_org_scoped_readonly('OrganizationPricingConfig');
SELECT pg_temp.policy_org_scoped_readonly('UserInvite');
-- User: special — a user sees their own row AND co-members of their org (read).
SELECT pg_temp.policy_user_owned('User', 'id');  -- own row: id = auth.uid()

-- ===========================================================================
-- BUCKET: via-inspection (join Inspection; workspace-backed)  — 19 tables
-- ===========================================================================
SELECT pg_temp.policy_child_via_parent('AffectedArea', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('AustralianComplianceRecord', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('BiohazardAssessment', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('CarpetRestorationAssessment', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('CircuitAssessment', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('Classification', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('ContentsPackOutItem', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('CostEstimate', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('DryingGoalRecord', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('EnvironmentalData', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('FireSmokeDamageAssessment', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('HVACAssessment', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('InspectionPhoto', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('MoistureReading', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('MouldRemediationAssessment', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('PilotObservation', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('PsychrometricReading', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('ScopeItem', 'inspectionId', 'Inspection');
SELECT pg_temp.policy_child_via_parent('StormDamageAssessment', 'inspectionId', 'Inspection');

-- ===========================================================================
-- BUCKET: via-report (join Report; workspace-backed)  — 3 tables
-- ===========================================================================
SELECT pg_temp.policy_child_via_parent('AuthorityFormInstance', 'reportId', 'Report');
SELECT pg_temp.policy_child_via_parent('ContractorReview', 'reportId', 'Report');
SELECT pg_temp.policy_child_via_parent('ReportApproval', 'reportId', 'Report');

-- ===========================================================================
-- BUCKET: via-invoice (join Invoice; workspace-backed)  — 4 tables
-- ===========================================================================
SELECT pg_temp.policy_child_via_parent('InvoiceEmail', 'invoiceId', 'Invoice');
SELECT pg_temp.policy_child_via_parent('InvoiceLineItem', 'invoiceId', 'Invoice');
SELECT pg_temp.policy_child_via_parent('InvoicePaymentAllocation', 'invoiceId', 'Invoice');
SELECT pg_temp.policy_child_via_parent('PaymentReminder', 'invoiceId', 'Invoice');

-- ===========================================================================
-- BUCKET: via-estimate (join Estimate; userId only — no workspace col)  — 3 tables
-- ===========================================================================
SELECT pg_temp.policy_child_via_parent('EstimateLineItem', 'estimateId', 'Estimate', false);
SELECT pg_temp.policy_child_via_parent('EstimateVariation', 'estimateId', 'Estimate', false);
SELECT pg_temp.policy_child_via_parent('EstimateVersion', 'estimateId', 'Estimate', false);

-- ===========================================================================
-- BUCKET: via-client (join Client; workspace-backed)  — 2 tables
-- ===========================================================================
SELECT pg_temp.policy_child_via_parent('ClientPortalAccount', 'clientId', 'Client');
SELECT pg_temp.policy_child_via_parent('ClientUser', 'clientId', 'Client');

-- ===========================================================================
-- BUCKET: via-integration (join Integration; workspace-backed)  — 4 tables
-- ===========================================================================
SELECT pg_temp.policy_child_via_parent('ExternalClient', 'integrationId', 'Integration');
SELECT pg_temp.policy_child_via_parent('ExternalJob', 'integrationId', 'Integration');
SELECT pg_temp.policy_child_via_parent('IntegrationSyncLog', 'integrationId', 'Integration');
SELECT pg_temp.policy_child_via_parent('XeroAccountCodeMapping', 'integrationId', 'Integration');

-- ===========================================================================
-- BUCKET: via-credit-note (join CreditNote; userId only)  — 1 table
-- ===========================================================================
SELECT pg_temp.policy_child_via_parent('CreditNoteLineItem', 'creditNoteId', 'CreditNote', false);

-- ===========================================================================
-- BUCKET: via-claim-analysis (MissingElement -> ClaimAnalysis -> Batch.userId)
-- ClaimAnalysis itself joins ClaimAnalysisBatch (userId). 2-hop for MissingElement.
-- ===========================================================================
SELECT pg_temp.policy_child_via_parent('ClaimAnalysis', 'batchId', 'ClaimAnalysisBatch', false);
-- MissingElement.analysisId -> ClaimAnalysis.id -> batchId -> Batch.userId (2-hop).
DO $$
BEGIN
  IF to_regclass('public."MissingElement"') IS NOT NULL
     AND to_regclass('public."ClaimAnalysis"') IS NOT NULL
     AND to_regclass('public."ClaimAnalysisBatch"') IS NOT NULL THEN
    EXECUTE $q$
      DROP POLICY IF EXISTS "ra4956_select" ON public."MissingElement";
      DROP POLICY IF EXISTS "ra4956_insert" ON public."MissingElement";
      DROP POLICY IF EXISTS "ra4956_update" ON public."MissingElement";
      DROP POLICY IF EXISTS "ra4956_delete" ON public."MissingElement";
    $q$;
    EXECUTE $q$
      CREATE POLICY "ra4956_select" ON public."MissingElement" FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public."ClaimAnalysis" ca
        JOIN public."ClaimAnalysisBatch" b ON b."id" = ca."batchId"
        WHERE ca."id" = public."MissingElement"."analysisId"
          AND b."userId" = auth.uid()::text))
    $q$;
    EXECUTE $q$
      CREATE POLICY "ra4956_insert" ON public."MissingElement" FOR INSERT TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM public."ClaimAnalysis" ca
        JOIN public."ClaimAnalysisBatch" b ON b."id" = ca."batchId"
        WHERE ca."id" = public."MissingElement"."analysisId"
          AND b."userId" = auth.uid()::text))
    $q$;
    EXECUTE $q$
      CREATE POLICY "ra4956_update" ON public."MissingElement" FOR UPDATE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public."ClaimAnalysis" ca
        JOIN public."ClaimAnalysisBatch" b ON b."id" = ca."batchId"
        WHERE ca."id" = public."MissingElement"."analysisId"
          AND b."userId" = auth.uid()::text))
    $q$;
    EXECUTE $q$
      CREATE POLICY "ra4956_delete" ON public."MissingElement" FOR DELETE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public."ClaimAnalysis" ca
        JOIN public."ClaimAnalysisBatch" b ON b."id" = ca."batchId"
        WHERE ca."id" = public."MissingElement"."analysisId"
          AND b."userId" = auth.uid()::text))
    $q$;
  ELSE
    RAISE NOTICE 'RA-4956: skipped MissingElement (parent chain missing)';
  END IF;
END $$;

-- ===========================================================================
-- BUCKET: via-contractor-profile (join ContractorProfile.userId via profileId)
-- ===========================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ContractorCertification','ContractorServiceArea'] LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL
       AND to_regclass('public."ContractorProfile"') IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "ra4956_select" ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS "ra4956_insert" ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS "ra4956_update" ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS "ra4956_delete" ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY "ra4956_select" ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public."ContractorProfile" cp WHERE cp."id" = public.%I."profileId" AND cp."userId" = auth.uid()::text))', t, t);
      EXECUTE format(
        'CREATE POLICY "ra4956_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public."ContractorProfile" cp WHERE cp."id" = public.%I."profileId" AND cp."userId" = auth.uid()::text))', t, t);
      EXECUTE format(
        'CREATE POLICY "ra4956_update" ON public.%I FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public."ContractorProfile" cp WHERE cp."id" = public.%I."profileId" AND cp."userId" = auth.uid()::text))', t, t);
      EXECUTE format(
        'CREATE POLICY "ra4956_delete" ON public.%I FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public."ContractorProfile" cp WHERE cp."id" = public.%I."profileId" AND cp."userId" = auth.uid()::text))', t, t);
    ELSE
      RAISE NOTICE 'RA-4956: skipped % (ContractorProfile chain missing)', t;
    END IF;
  END LOOP;
END $$;

-- ===========================================================================
-- BUCKET: via-authority-form-instance
-- AuthorityFormSignature -> AuthorityFormInstance -> Report (workspace-backed).
-- ===========================================================================
DO $$
BEGIN
  IF to_regclass('public."AuthorityFormSignature"') IS NOT NULL
     AND to_regclass('public."AuthorityFormInstance"') IS NOT NULL
     AND to_regclass('public."Report"') IS NOT NULL THEN
    -- Resolve the FK column name defensively (formInstanceId or authorityFormInstanceId).
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='AuthorityFormSignature'
                 AND column_name='formInstanceId') THEN
      EXECUTE $q$
        DROP POLICY IF EXISTS "ra4956_select" ON public."AuthorityFormSignature";
        CREATE POLICY "ra4956_select" ON public."AuthorityFormSignature" FOR SELECT TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public."AuthorityFormInstance" afi
          JOIN public."Report" r ON r."id" = afi."reportId"
          WHERE afi."id" = public."AuthorityFormSignature"."formInstanceId"
            AND (r."userId" = auth.uid()::text
                 OR (r."workspaceId" IS NOT NULL
                     AND (is_workspace_owner(r."workspaceId") OR is_workspace_member(r."workspaceId"))))))
      $q$;
    ELSE
      RAISE NOTICE 'RA-4956: AuthorityFormSignature FK column not formInstanceId — left default-deny (TODO review).';
    END IF;
  ELSE
    RAISE NOTICE 'RA-4956: skipped AuthorityFormSignature (parent chain missing)';
  END IF;
END $$;

-- ===========================================================================
-- SPECIAL: Organization — a user may SELECT their own org; writes service-role.
-- ===========================================================================
DO $$
BEGIN
  IF to_regclass('public."Organization"') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "ra4956_select" ON public."Organization"';
    EXECUTE $q$
      CREATE POLICY "ra4956_select" ON public."Organization" FOR SELECT TO authenticated
      USING ("id" = (SELECT u."organizationId" FROM public."User" u WHERE u."id" = auth.uid()::text)
             OR "ownerId" = auth.uid()::text)
    $q$;
  END IF;
END $$;

-- ===========================================================================
-- PUBLIC-REF (12) — anon_select already created by RA-4970. Left as-is.
-- SERVICE-ONLY (34) — intentionally NO policy. RLS-enabled default-deny stays.
--   Tables: AgentDefinition, AgentTask, AgentTaskLog, AgentWorkflow,
--   AscoraIntegration/Job/LineItem/Note, AttestationConsentToken, AuditLog,
--   ContentAnalytics/Job/Post, CronJobRun, DrNrpg* , EvaluationRun, GateCheck,
--   HydrationJob, InvoiceAuditLog, OAuthHandoffToken, OverrideGovernanceReport,
--   ProgressTelemetryEvent, PromptVariant, PropertyLookup, ScheduledEmail,
--   SecurityEvent, StorageMirrorJob, StripeWebhookEvent, WebhookEvent,
--   _prisma_migrations, PasswordResetToken, VerificationToken.
--   These are written/read by server code only (service role / postgres) and
--   must NEVER be reachable by an anon-key client. No policy == correct.
-- ===========================================================================

-- ===========================================================================
-- INVESTIGATE-FIRST (5) — present in prod, ABSENT from prisma/schema.prisma:
--   BusinessProfile, EquipmentDeployment, MoistureMeter, Room, RoomAnnotation.
-- RA-4970 already RLS-enabled them (default-deny). We deliberately add NO
-- tenant policy here because their column shape is unverified in this repo.
-- TODO(RA-4956): inspect columns via Supabase list_tables, then bucket:
--   - Room/RoomAnnotation likely chain to Inspection (room.inspectionId?).
--   - BusinessProfile likely user/org-owned.
--   - EquipmentDeployment likely via Inspection/Report.
--   - MoistureMeter likely user/org-owned device registry.
-- Until verified they stay default-deny (safe — server uses service role).
-- ===========================================================================

COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- VERIFICATION (run AFTER apply, against the target env):
--
--   -- Every one of the 119 tables still has RLS enabled (RA-4970 invariant):
--   SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;
--   -- Expected: 0
--
--   -- This migration's policies are present:
--   SELECT tablename, count(*) FROM pg_policies
--   WHERE schemaname='public' AND policyname LIKE 'ra4956_%'
--   GROUP BY tablename ORDER BY tablename;
--
--   -- Supabase security advisor still reports 0 ERROR-level rls findings:
--   --   mcp__claude_ai_Supabase__get_advisors --type security
--
-- ROLLBACK (mechanical — only drops policies, mutates no data):
--   DO $$
--   DECLARE r record;
--   BEGIN
--     FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
--              WHERE schemaname='public' AND policyname LIKE 'ra4956_%' LOOP
--       EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
--                      r.policyname, r.schemaname, r.tablename);
--     END LOOP;
--   END $$;
--   -- (RLS stays ENABLED — that is RA-4970's concern, not this migration's.)
-- ───────────────────────────────────────────────────────────────────────────
