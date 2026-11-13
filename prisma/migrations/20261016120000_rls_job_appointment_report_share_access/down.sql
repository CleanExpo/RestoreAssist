-- Reverses 20261016120000_rls_job_appointment_report_share_access/migration.sql.
-- Restores the prior posture: RLS off on both tables, no policy. No row data changes.

DROP POLICY IF EXISTS "job_appointment_owner_select" ON public."JobAppointment";
ALTER TABLE IF EXISTS public."JobAppointment" DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ReportShareAccess" DISABLE ROW LEVEL SECURITY;
