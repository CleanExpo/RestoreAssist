-- RA-4956 RLS harness — Supabase compatibility shim for a PLAIN Postgres.
--
-- The RA-4956 / RA-4970 migrations are written for Supabase, which provides:
--   * an `auth` schema with `auth.uid()` reading the request JWT claims,
--   * an `authenticated` role and an `anon` role,
--   * a `service_role`,
--   * the GUC `request.jwt.claims` (set per request by PostgREST/GoTrue).
--
-- A `supabase db start` stack provides these natively — in that case this
-- shim is a near no-op (CREATE ... IF NOT EXISTS guards make it safe to run).
-- Against a disposable bare `postgres:16` container it manufactures the
-- minimum surface the policies need, so the SAME real migration file can run
-- unmodified and be exercised for actual row isolation.

-- ── Roles ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- BYPASSRLS mirrors Supabase: service role sees everything.
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

-- ── auth schema + auth.uid() ────────────────────────────────────────────────
-- Supabase's auth.uid() = (current_setting('request.jwt.claims')::json->>'sub').
-- We replicate it exactly so the policies' `auth.uid()::text` resolves to the
-- JWT subject we set per "request" via `set local request.jwt.claims`.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json ->> 'sub',
    ''
  )::uuid
$$;

-- Some Supabase policies also reference auth.jwt(); provide it for parity.
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
