-- RA-4956 follow-up: make NextAuth token tables `Session` and `Account`
-- SERVICE-ONLY (default-deny for the `authenticated` role).
--
-- Schema-evidence mirror of
-- prisma/migrations/20260615000000_ra_4956_session_account_service_only/migration.sql.
-- Only the Prisma path is applied in CI (`prisma migrate deploy`); this copy
-- exists so the Supabase migration history reflects the same RLS posture.
--
-- WHY: `Session`/`Account` hold NextAuth OAuth tokens. RA-4956 gave them
-- userId-scoped ra4956_* policies; they must instead be default-deny for
-- authenticated (service-role / superuser only). RLS stays ENABLED (RA-4970),
-- so dropping the policies yields service-only access. Idempotent, no data touched.

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
