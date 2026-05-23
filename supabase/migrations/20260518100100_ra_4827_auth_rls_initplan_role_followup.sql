-- RA-4827 batch-2 followup: the HistoricalJob service-role policy uses
-- auth.role() not auth.uid(), so the batch-2 migration missed it. Same
-- advisor pattern (auth_rls_initplan), same fix shape: wrap in
-- (select ...) for InitPlan caching.
--
-- Environment-tolerant: DROP IF EXISTS + CREATE rather than ALTER, so
-- this migration applies cleanly against envs that don't have the
-- original policy (sandbox, fresh CI shadow DB, etc.). On prod where
-- the policy was directly ALTERed in this session, the DROP+CREATE
-- produces the identical end state.

DO $$
BEGIN
  IF to_regclass('public."HistoricalJob"') IS NOT NULL THEN
    DROP POLICY IF EXISTS "historicaljob_service_role_all" ON public."HistoricalJob";
    EXECUTE $sql$
      CREATE POLICY "historicaljob_service_role_all" ON public."HistoricalJob"
        AS PERMISSIVE FOR ALL TO public
        USING (((select auth.role()) = 'service_role'::text))
    $sql$;
  ELSE
    RAISE NOTICE 'RA-4827: skipped historicaljob_service_role_all — HistoricalJob table missing in this env';
  END IF;
END $$;
