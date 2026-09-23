-- Reverse of 20260401000000_ra_7716_auth_uid_shim.
--
-- Drops auth.uid() ONLY when it is the shim this migration created, identified
-- by the comment marker the forward file sets. On Supabase the real auth.uid()
-- carries no such marker and is left standing -- an unconditional
-- `DROP FUNCTION auth.uid()` there would destroy the authentication primitive
-- every tenant policy in this schema depends on.
--
-- AND ONLY WHEN NOTHING DEPENDS ON IT. On a database built from the full chain,
-- the eight RLS migrations that run after this one create ~234 policies whose
-- expressions call auth.uid(), so the drop raises 2BP01. That is caught here and
-- turned into a NOTICE rather than an error: the shim is left standing and
-- nothing else is touched. `DROP ... CASCADE` is deliberately NOT used -- it
-- would take all 234 tenant policies with it, silently, while reporting success.
-- scripts/ci/migration-roundtrip.sh found exactly that, which is why this branch
-- exists.
--
-- So reversing the shim in isolation succeeds only where nothing depends on it:
-- a database where the guarded RLS migrations skipped their policy blocks (any
-- plain Postgres, including production), or one where those migrations have
-- already been reversed first. To reverse it anywhere else, reverse the
-- migrations that created the policies first, then run this.
--
-- The auth schema itself is left in place. Dropping it would cascade into
-- anything else since created there, and an empty schema costs nothing.
--
-- Note for whoever runs this: reversing this leaves the chain unable to rebuild
-- from scratch again, because 20260907040000_ra_7493_ai_runtime_rls becomes
-- unapplied-able on a fresh plain Postgres. That is intentional -- a reversal
-- restores the previous state, it does not invent a better one.

DO $ra7716_down$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid' AND p.pronargs = 0
      AND obj_description(p.oid, 'pg_proc') LIKE 'RA-7716 shim:%'
  ) THEN
    BEGIN
      DROP FUNCTION auth.uid();
      RAISE NOTICE 'RA-7716 shim dropped';
    EXCEPTION WHEN dependent_objects_still_exist THEN
      RAISE NOTICE 'RA-7716 shim left in place: policies still depend on auth.uid(). Reverse those migrations first.';
    END;
  ELSE
    RAISE NOTICE 'auth.uid() is not the RA-7716 shim - leaving it untouched';
  END IF;
END
$ra7716_down$;
