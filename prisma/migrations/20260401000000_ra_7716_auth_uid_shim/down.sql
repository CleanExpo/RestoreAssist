-- Reverse of 20260401000000_ra_7716_auth_uid_shim.
--
-- Drops auth.uid() ONLY when it is the shim this migration created, identified
-- by the comment marker the forward file sets. On Supabase the real auth.uid()
-- carries no such marker and is left standing -- an unconditional
-- `DROP FUNCTION auth.uid()` there would destroy the authentication primitive
-- every tenant policy in this schema depends on.
--
-- The auth schema itself is left in place. Dropping it would cascade into
-- anything else that has since been created there, and an empty schema costs
-- nothing. CASCADE is deliberately not used on the function either: if some
-- object has come to depend on the shim, the drop should fail loudly rather
-- than take that object with it.
--
-- Note for whoever runs this: reversing this alone leaves the chain unable to
-- rebuild from scratch again, because 20260907040000_ra_7493_ai_runtime_rls
-- becomes unapplied-able on a fresh plain Postgres. That is intentional -- a
-- reversal restores the previous state, it does not invent a better one.

DO $ra7716_down$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid' AND p.pronargs = 0
      AND obj_description(p.oid, 'pg_proc') LIKE 'RA-7716 shim:%'
  ) THEN
    DROP FUNCTION auth.uid();
  ELSE
    RAISE NOTICE 'auth.uid() is not the RA-7716 shim - leaving it untouched';
  END IF;
END
$ra7716_down$;
