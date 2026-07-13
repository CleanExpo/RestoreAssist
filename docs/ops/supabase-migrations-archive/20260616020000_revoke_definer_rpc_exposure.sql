-- BYOK audit #2 (corrected). The prior cluster migration's
-- "REVOKE EXECUTE ... FROM anon, authenticated" was a NO-OP: Postgres grants
-- function EXECUTE to PUBLIC by default and anon/authenticated inherit it, so the
-- advisor still reported the 8 *_security_definer_function_executable findings.
--
-- Revoke from PUBLIC (the real grantor) for the two functions that are genuine
-- exposure risks; keep service_role for any server-side use:
--   handle_new_user()         — trigger function; no caller needs direct EXECUTE.
--   verify_client_invite(text)— RPC-only; no app code calls it; PUBLIC exposure
--                               enabled invite-token probing.
--
-- is_workspace_member(text) / is_workspace_owner(text) are intentionally LEFT
-- executable: they are invoked inside RLS policy USING clauses (revoking breaks
-- policy evaluation for authenticated users) and only ever reveal the CALLER's
-- own membership (auth.uid()), so the residual exposure is benign.
-- Expect the advisor to drop 8 → 4 (the two RLS helpers × anon+authenticated).

BEGIN;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('handle_new_user','verify_client_invite')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
COMMIT;
