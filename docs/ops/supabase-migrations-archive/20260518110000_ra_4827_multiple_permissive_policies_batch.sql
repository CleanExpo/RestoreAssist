-- RA-4827 perf advisor batch 3: clear multiple_permissive_policies WARNs
-- on HistoricalJob by scoping the service-role policy to the service_role
-- grantee only, instead of leaving it on `{public}` where it stacks
-- permissively against the per-user policies for every action × role
-- combo (28 WARNs total — 7 actions × 4 roles).
--
-- Functional semantics unchanged:
--   - Anon / authenticated queries: per-user policies (historicaljob_*_own)
--     are the only ones that evaluate, since the service-role policy is no
--     longer applied to {public}.
--   - service_role queries: the new policy returns true unconditionally,
--     matching the prior `auth.role() = 'service_role'` check (redundant
--     because Supabase service_role JWTs already bypass RLS at the
--     PostgREST layer, but kept for explicit policy auditability).
--
-- Environment-tolerant: DROP IF EXISTS + CREATE wrapped in to_regclass()
-- existence check. Re-running against any env converges on the same state.

DO $$
BEGIN
  IF to_regclass('public."HistoricalJob"') IS NOT NULL THEN
    DROP POLICY IF EXISTS "historicaljob_service_role_all" ON public."HistoricalJob";
    EXECUTE $sql$
      CREATE POLICY "historicaljob_service_role_all" ON public."HistoricalJob"
        AS PERMISSIVE FOR ALL TO service_role
        USING (true)
        WITH CHECK (true)
    $sql$;
  ELSE
    RAISE NOTICE 'RA-4827: skipped historicaljob_service_role_all rescope — HistoricalJob table missing in this env';
  END IF;
END $$;
