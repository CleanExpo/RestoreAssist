-- P0/P1 security boundary hardening.
--
-- UserInvite contains bearer tokens; EmailConnection contains OAuth access and
-- refresh tokens; EmailAudit contains server delivery records; OAuthStateNonce
-- is replay-prevention state. None is a browser/PostgREST data surface.
--
-- ENABLE RLS is idempotent. The policy inventory is discovered from pg_policy
-- so every existing policy is removed, regardless of its name. With RLS enabled
-- and zero policies, anon/authenticated roles are default-denied while trusted
-- server connections that BYPASSRLS continue to work. No row data is changed.

BEGIN;

ALTER TABLE IF EXISTS public."UserInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."EmailConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."EmailAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."OAuthStateNonce" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_table text;
  policy_name text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'UserInvite',
    'EmailConnection',
    'EmailAudit',
    'OAuthStateNonce'
  ] LOOP
    IF to_regclass(format('%I.%I', 'public', target_table)) IS NULL THEN
      CONTINUE;
    END IF;

    FOR policy_name IN
      SELECT p.polname
        FROM pg_catalog.pg_policy p
        JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = target_table
    LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        policy_name,
        target_table
      );
    END LOOP;
  END LOOP;
END
$$;

COMMIT;
