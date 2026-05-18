-- RA-4827 batch-2 followup: the HistoricalJob service-role policy uses
-- auth.role() not auth.uid(), so the batch-2 migration missed it. Same
-- advisor pattern (auth_rls_initplan), same fix shape: wrap in
-- (select ...) for InitPlan caching.
--
-- Applied directly to prod 2026-05-18 alongside batch-2. This file keeps
-- the migration history in sync with what's in pg_policies.

ALTER POLICY "historicaljob_service_role_all" ON public."HistoricalJob"
  USING (((select auth.role()) = 'service_role'::text));
