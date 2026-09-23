-- RA-7716: supply auth.uid() on Postgres that is not Supabase.
--
-- WHY THIS EXISTS: a fresh database could not be built from prisma/migrations
-- alone. `prisma migrate deploy` against an empty plain Postgres dies at
-- 20260907040000_ra_7493_ai_runtime_rls with P3018 / 3F000,
-- `schema "auth" does not exist`, after 226 migrations have applied cleanly.
-- That one migration is the only RLS migration in the chain with no guard; the
-- other seven check pg_namespace first and skip their policies when the auth
-- schema is absent. So every workflow that needs a database has been creating
-- the function by hand first -- six copies of the same bootstrap step across
-- four workflows and two scripts. This migration replaces all six.
--
-- WHAT IT IS NOT: this is not authentication. Supabase's auth.uid() reads the
-- JWT claim of the requesting user. There is no JWT on DigitalOcean, so the
-- shim returns NULL, and a policy comparing a column to NULL is false. The
-- effect on a non-Supabase database is therefore default-deny for any role
-- that RLS applies to -- the same posture those tables already have today,
-- where RLS is enabled and no policy exists at all. The application connects
-- as the table owner and owners bypass RLS unless FORCE ROW LEVEL SECURITY is
-- set (it is not, on any table), so application behaviour is unchanged.
-- Whether the database should be the enforcement point at all is RA-7703's
-- open decision; this migration does not answer it either way.
--
-- CREATE, NEVER REPLACE: on Supabase the real auth.uid() must survive
-- untouched. `CREATE OR REPLACE` would overwrite it with a function that
-- returns NULL and silently switch every tenant policy to default-deny, so
-- the function is created only when pg_proc holds no auth.uid() already.
-- The comment marker below is what down.sql keys on, so a reversal can drop
-- the shim and can never drop a real one.
--
-- SORTS FIRST: the earliest migration referencing auth.uid() is
-- 20260403010000_add_evidence_schema, so this directory is dated before it and
-- runs first on any fresh build. It is additive and idempotent: replaying it
-- is a no-op, and no table, column, constraint, index or policy is touched.

DO $ra7716$
BEGIN
  CREATE SCHEMA IF NOT EXISTS auth;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid' AND p.pronargs = 0
  ) THEN
    RAISE NOTICE 'auth.uid() already exists - leaving it untouched (Supabase or a prior run)';
    RETURN;
  END IF;

  CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $shim$ SELECT NULL::uuid $shim$;

  COMMENT ON FUNCTION auth.uid() IS
    'RA-7716 shim: no JWT on this database, so this returns NULL and tenant policies are default-deny. Not present on Supabase, where the real auth.uid() is left untouched.';
END
$ra7716$;
