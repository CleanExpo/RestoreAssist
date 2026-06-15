-- Tenant-scoped RLS for the 8 Sketch / Capture / Insurer / Material tables that
-- shipped AFTER the RA-4970 RLS sweep and the RA-4956 policy pass, and were found
-- RLS-DISABLED + policy-less (anon-readable/writable) by the 2026-06-15 Supabase
-- advisor audit (docs/data-hygiene-audit-2026-06-15.md, P0 #1).
--
-- Unlike RA-4956 (where RA-4970 had already ENABLEd RLS), these 8 have RLS OFF,
-- so this migration ENABLEs it first, then adds policies in the SAME transaction
-- (enabling RLS with no policy = silent default-deny breakage — never split them).
--
-- Access models (verified against prisma/schema.prisma):
--   1-hop via Inspection (workspace-backed):  CaptureToken, ClientEvidenceSubmission
--   2-hop via ClaimSketch -> Inspection:        SketchElement, Hazard,
--                                               InsuranceContext, SketchMoistureReading
--                                               (ClaimSketch has NO direct owner column;
--                                                it is itself owned via inspectionId)
--   ANZ reference data (global, read-all):      Material, InsurerProfile (no owner column)
--
-- Server code (Prisma via DATABASE_URL = postgres superuser, BYPASSRLS; and the
-- service role) is unaffected. The homeowner self-capture and client-portal WRITE
-- paths use the SERVICE ROLE + an opaque-token check, NOT an authenticated Supabase
-- JWT, so they bypass these policies. auth.uid() is NULL on NextAuth-only surfaces,
-- so these policies deny anon-key access until a Supabase-JWT path uses them — the
-- exact RA-413 / RA-4956 model. Idempotent: DROP POLICY IF EXISTS + to_regclass guards.

BEGIN;

-- The Supabase-managed `authenticated` role may not exist on plain Postgres
-- (CI / local). A bare NOLOGIN role is inert on prod (IF NOT EXISTS => no-op) and
-- lets the migration apply uniformly. (RA-4956 note.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

-- Workspace helpers — CREATE OR REPLACE; identical definitions to RA-413 / RA-4956
-- (redefining is a no-op there).
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
-- Policy emitters (pg_temp). Each skips silently if a table is missing and drops
-- any same-named policy first. Policy names use the `rask_` prefix.
-- ───────────────────────────────────────────────────────────────────────────

-- 1-HOP: child.fk -> parent.id, parent is workspace-backed (userId + workspaceId).
-- Verbatim shape of RA-4956's policy_child_via_parent.
CREATE OR REPLACE FUNCTION pg_temp.rask_via_parent(tbl text, fk_col text, parent_tbl text)
RETURNS void AS $$
DECLARE cond text;
BEGIN
  IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN
    RAISE NOTICE 'RA-sketch-rls: skipped (missing) child %', tbl; RETURN;
  END IF;
  IF to_regclass('public.' || quote_ident(parent_tbl)) IS NULL THEN
    RAISE NOTICE 'RA-sketch-rls: skipped % — parent % missing', tbl, parent_tbl; RETURN;
  END IF;
  cond := format(
    'EXISTS (SELECT 1 FROM public.%I p WHERE p."id" = public.%I.%I AND '
    || '(p."userId" = auth.uid()::text OR (p."workspaceId" IS NOT NULL '
    || 'AND (is_workspace_owner(p."workspaceId") OR is_workspace_member(p."workspaceId")))))',
    parent_tbl, tbl, fk_col);
  EXECUTE format('DROP POLICY IF EXISTS "rask_select" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "rask_insert" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "rask_update" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "rask_delete" ON public.%I', tbl);
  EXECUTE format('CREATE POLICY "rask_select" ON public.%I FOR SELECT TO authenticated USING (%s)', tbl, cond);
  EXECUTE format('CREATE POLICY "rask_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', tbl, cond);
  EXECUTE format('CREATE POLICY "rask_update" ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', tbl, cond, cond);
  EXECUTE format('CREATE POLICY "rask_delete" ON public.%I FOR DELETE TO authenticated USING (%s)', tbl, cond);
END;
$$ LANGUAGE plpgsql;

-- 2-HOP: child.fk -> mid.id, mid.mid_fk -> grandparent.id (Inspection, workspace-backed).
-- Needed because ClaimSketch has no ownership column of its own — RLS does not
-- recurse into the subquery, so the grandparent predicate is inlined here.
CREATE OR REPLACE FUNCTION pg_temp.rask_via_grandparent(
  tbl text, fk_col text, mid_tbl text, mid_fk text, gp_tbl text)
RETURNS void AS $$
DECLARE cond text;
BEGIN
  IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN
    RAISE NOTICE 'RA-sketch-rls: skipped (missing) child %', tbl; RETURN;
  END IF;
  IF to_regclass('public.' || quote_ident(mid_tbl)) IS NULL
     OR to_regclass('public.' || quote_ident(gp_tbl)) IS NULL THEN
    RAISE NOTICE 'RA-sketch-rls: skipped % — mid/grandparent missing', tbl; RETURN;
  END IF;
  cond := format(
    'EXISTS (SELECT 1 FROM public.%I m JOIN public.%I g ON g."id" = m.%I '
    || 'WHERE m."id" = public.%I.%I AND (g."userId" = auth.uid()::text '
    || 'OR (g."workspaceId" IS NOT NULL AND (is_workspace_owner(g."workspaceId") OR is_workspace_member(g."workspaceId")))))',
    mid_tbl, gp_tbl, mid_fk, tbl, fk_col);
  EXECUTE format('DROP POLICY IF EXISTS "rask_select" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "rask_insert" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "rask_update" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "rask_delete" ON public.%I', tbl);
  EXECUTE format('CREATE POLICY "rask_select" ON public.%I FOR SELECT TO authenticated USING (%s)', tbl, cond);
  EXECUTE format('CREATE POLICY "rask_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', tbl, cond);
  EXECUTE format('CREATE POLICY "rask_update" ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', tbl, cond, cond);
  EXECUTE format('CREATE POLICY "rask_delete" ON public.%I FOR DELETE TO authenticated USING (%s)', tbl, cond);
END;
$$ LANGUAGE plpgsql;

-- REFERENCE DATA: global ANZ reference, readable by any authenticated user; writes
-- are service-role only (default-deny — no write policy emitted). These tables have
-- NO ownership column by design, so a read-all SELECT policy is correct reference
-- behaviour, NOT a USING(true) tenant leak (mirrors RA-4970's public-ref tables).
CREATE OR REPLACE FUNCTION pg_temp.rask_reference_readall(tbl text)
RETURNS void AS $$
BEGIN
  IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN
    RAISE NOTICE 'RA-sketch-rls: skipped (missing) reference %', tbl; RETURN;
  END IF;
  EXECUTE format('DROP POLICY IF EXISTS "rask_ref_select" ON public.%I', tbl);
  EXECUTE format('CREATE POLICY "rask_ref_select" ON public.%I FOR SELECT TO authenticated USING (true)', tbl);
END;
$$ LANGUAGE plpgsql;

-- ── ENABLE RLS (these 8 shipped after RA-4970, so RLS is currently OFF) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'CaptureToken', 'ClientEvidenceSubmission', 'SketchElement', 'Hazard',
    'InsuranceContext', 'SketchMoistureReading', 'Material', 'InsurerProfile'
  ] LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END
$$;

-- ── Policies ──
-- 1-hop via Inspection
SELECT pg_temp.rask_via_parent('CaptureToken', 'inspectionId', 'Inspection');
SELECT pg_temp.rask_via_parent('ClientEvidenceSubmission', 'inspectionId', 'Inspection');

-- 2-hop via ClaimSketch -> Inspection
SELECT pg_temp.rask_via_grandparent('SketchElement', 'sketchId', 'ClaimSketch', 'inspectionId', 'Inspection');
SELECT pg_temp.rask_via_grandparent('Hazard', 'sketchId', 'ClaimSketch', 'inspectionId', 'Inspection');
SELECT pg_temp.rask_via_grandparent('InsuranceContext', 'sketchId', 'ClaimSketch', 'inspectionId', 'Inspection');
SELECT pg_temp.rask_via_grandparent('SketchMoistureReading', 'sketchId', 'ClaimSketch', 'inspectionId', 'Inspection');

-- Reference data (read-all for authenticated; service-role writes)
SELECT pg_temp.rask_reference_readall('Material');
SELECT pg_temp.rask_reference_readall('InsurerProfile');

COMMIT;
