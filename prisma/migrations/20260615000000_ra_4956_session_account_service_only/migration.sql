-- RA-4956 follow-up: make NextAuth token tables `Session` and `Account`
-- SERVICE-ONLY (default-deny for the `authenticated` role).
--
-- WHY:
--   The RA-4956 migration (20260614000000) applied `policy_user_owned()` to
--   `Session` and `Account`, giving them userId-scoped `ra4956_*` policies.
--   But these tables hold NextAuth OAuth refresh/access tokens. They must NOT
--   be readable by any `authenticated` (Supabase anon-key) JWT path — they
--   should only ever be touched by server code, which connects as the Postgres
--   superuser (BYPASSRLS) via DATABASE_URL or the service role.
--
-- WHAT:
--   Drop the four ra4956_* policies on each table. RLS stays ENABLED (set by
--   RA-4970), so with no policy the tables are default-deny for anon/authenticated
--   = service-only. Prisma/superuser and SUPABASE_SERVICE_ROLE_KEY are unaffected
--   (both bypass RLS), so NextAuth session/account reads continue to work.
--
-- SAFETY:
--   DROP POLICY IF EXISTS + to_regclass guard => idempotent and env-tolerant
--   (sandbox/dev/prod table sets differ). No data is touched. Reversible by
--   re-running the RA-4956 emitter for these two tables.

BEGIN;

DO $$
DECLARE
  tbl text;
  pol text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['Account', 'Session'] LOOP
    IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN
      RAISE NOTICE 'RA-4956 follow-up: skipped (missing) table %', tbl;
      CONTINUE;
    END IF;
    FOREACH pol IN ARRAY ARRAY['ra4956_select', 'ra4956_insert', 'ra4956_update', 'ra4956_delete'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
    END LOOP;
    RAISE NOTICE 'RA-4956 follow-up: % is now service-only (default-deny for authenticated)', tbl;
  END LOOP;
END
$$;

COMMIT;
