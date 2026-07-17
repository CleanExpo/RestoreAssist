-- RLS hardening cluster (BYOK audit follow-ups #10 / #11 / #2 / #25).
-- Targets Supabase prod project udooysjajglluvuxkijp. Authored 2026-06-16.
--
-- Apply via a channel you control (the auto-mode classifier blocks autonomous
-- bundled prod DDL on this shared project):
--   • Supabase Dashboard → SQL editor (paste this file), OR
--   • supabase db push   (with the project linked), OR
--   • the normal migrate-deploy pipeline.
--
-- All four changes were usage-verified safe before authoring:
--   #2  : no app code calls the 4 SECURITY DEFINER funcs via PostgREST RPC.
--   #25 : only the service-role server client lists evidence-optimised (bypasses RLS).
-- Verify after applying:
--   get_advisors(project_id=udooysjajglluvuxkijp, type:security) → 0 of each of:
--   rls_policy_always_true (PushToken), function_search_path_mutable (9),
--   {anon,authenticated}_security_definer_function_executable (8), public_bucket_allows_listing (1).

BEGIN;

-- #10 PushToken: the UPDATE policy's USING clause was literally `true` (any user
-- could update any row). Scope it to the owning user, matching its WITH CHECK.
DROP POLICY IF EXISTS "PushToken_update_own" ON public."PushToken";
CREATE POLICY "PushToken_update_own" ON public."PushToken"
  FOR UPDATE TO authenticated
  USING ((select auth.uid())::text = "userId")
  WITH CHECK ((select auth.uid())::text = "userId");

-- #11 Pin an immutable empty search_path on the 9 flagged functions (any signature).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'update_report_search_vector','update_client_search_vector',
      'update_inspection_search_vector','update_updated_at_column',
      'handle_new_user','set_updated_at','is_workspace_member',
      'is_workspace_owner','update_media_asset_updated_at')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = ''''', r.sig);
  END LOOP;
END $$;

-- #2 Revoke PostgREST RPC EXECUTE on the SECURITY DEFINER helpers from anon +
-- authenticated (verified: no client code invokes them via .rpc()).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'handle_new_user','is_workspace_member','is_workspace_owner','verify_client_invite')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', r.sig);
  END LOOP;
END $$;

-- #25 Remove the broad public listing policy on the evidence-optimised bucket so
-- anon/authenticated can no longer enumerate evidence objects (service-role,
-- which the only listing code path uses, bypasses RLS and is unaffected).
DROP POLICY IF EXISTS "Public can read optimised" ON storage.objects;

COMMIT;
