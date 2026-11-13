-- RLS for the two tables V1 P1/P5 added without it (audit-rls-coverage:
-- JobAppointment, ReportShareAccess). Founder instruction 16/10/2026.
--
-- JobAppointment: tenant isolation via the inspection, the same predicate as
-- MoistureReading (RLS batch 4): an authenticated caller sees appointments on
-- inspections they own. Writes have no client policy, so they are denied to
-- client roles; the app writes through its own server connection.
--
-- ReportShareAccess: rows carry bearer share tokens. Like UserInvite and
-- EmailConnection (20260825135000_service_only_security_boundaries) it is not
-- a browser/PostgREST surface: RLS on, no policy, so anon and authenticated
-- are default-denied and only trusted server connections read it.
--
-- The application connects as the table owner, and owners bypass RLS (no
-- table uses FORCE ROW LEVEL SECURITY), so application behaviour is unchanged.
-- auth.uid() exists on every database by now (RA-7716 shim; NULL off Supabase,
-- which makes the policy deny). The policy is only created where the
-- authenticated role exists, so the migration applies on any Postgres.

ALTER TABLE IF EXISTS public."JobAppointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ReportShareAccess" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public."JobAppointment"') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE NOTICE 'JobAppointment or role authenticated missing; owner policy not created';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "job_appointment_owner_select" ON public."JobAppointment";
  CREATE POLICY "job_appointment_owner_select"
    ON public."JobAppointment"
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public."Inspection" i
        WHERE i.id = "JobAppointment"."inspectionId"
          AND i."userId" = (select auth.uid())::text
      )
    );
END
$$;
