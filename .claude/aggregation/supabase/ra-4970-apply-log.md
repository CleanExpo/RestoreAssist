# RA-4970 — Phase-1 RLS migration apply log

**Linear:** [RA-4970](https://linear.app/unite-group/issue/RA-4970)
**Target:** Supabase project `udooysjajglluvuxkijp` (`restoreassist-prod-2026`, region `ap-southeast-2`)
**Migration file:** `supabase/migrations/20260518_enable_rls_phase_1_close_anon_exposure.sql`
**Authorized by:** Phill McGurk via literal trigger phrase `Apply RA-4970 migration to udooysjajglluvuxkijp` (chat, 2026-05-18).

## What this migration does

Closes the PostgREST anon-endpoint exposure surfaced by Supabase security advisor on 2026-05-18: 119 prod tables in `public` schema had Row Level Security disabled, meaning the anon key shipped to every browser had read/write access to every row.

Three actions in one transaction:
1. `ALTER TABLE public.<x> ENABLE ROW LEVEL SECURITY` on 119 tables (default-deny for anon + authenticated).
2. `CREATE POLICY "anon_select" ... USING (true)` on 12 public-reference tables that need to stay browser-readable.
3. Wrapped in `pg_temp` helpers (`enable_rls_if_exists`, `create_anon_select_if_exists`) using `to_regclass` so missing tables silently emit `RAISE NOTICE` instead of erroring — lets the same migration apply against sandbox/dev/prod with different table sets.

The Prisma server-side path (`DATABASE_URL` → `postgres` superuser, BYPASSRLS) and the service-role key path (`SUPABASE_SERVICE_ROLE_KEY`) both bypass RLS, so server code is unaffected. Audit at `.claude/aggregation/supabase/service-role-audit-2026-05-18.md`.

## Apply timeline (versioned in `supabase_migrations.schema_migrations`)

| version | name | status |
|---|---|---|
| `20260518071306` | `ra_4970_enable_rls_phase_1_close_anon_exposure` | success — initial apply |
| `20260518080157` | `ra_4970_enable_rls_phase_1_close_anon_exposure_reapply` | success — idempotent re-apply per trigger |
| `20260518080604` | `ra_4970_enable_rls_phase_1_close_anon_exposure_confirm` | success — explicit confirmation pass |

Source of timeline: `SELECT version, name FROM supabase_migrations.schema_migrations WHERE name LIKE 'ra_4970%' ORDER BY version DESC` against project `udooysjajglluvuxkijp` 2026-05-18.

## Pre-state (before first apply, 2026-05-18 ~06:50 UTC)

Query: `SELECT COUNT(*) FILTER (WHERE rowsecurity=false), COUNT(*) FILTER (WHERE rowsecurity=true) FROM pg_tables WHERE schemaname='public'`

```
rls_off=119   rls_on=78   anon_select_policies=0
```

`get_advisors` (security) reported 212 total lints:
- 128 ERROR-level — of which **119 were `rls_disabled_in_public`**
- 27 WARN
- 57 INFO

## Post-state (after first apply, verified 2026-05-18 ~06:53 UTC)

Same query against the same project:

```
rls_off=0     rls_on=197  anon_select_policies=12
```

12 `anon_select` policy rows in `pg_policies` cover exactly these tables (from `SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='anon_select' ORDER BY tablename`):

1. `AbnLookupCache`
2. `AppRelease`
3. `AuthorityFormTemplate`
4. `BuildingCode`
5. `Citation`
6. `CostDatabase`
7. `IicrcChunk`
8. `InsurancePolicyRequirement`
9. `RegulatoryDocument`
10. `RegulatorySection`
11. `ScopePricingDatabase`
12. `WaterDamageClassification`

`get_advisors` (security) post-apply:
- 0 ERROR-level (delta: −128)
- 27 WARN
- 164 INFO (mostly `rls_enabled_no_policy` — intentional: service-role bypass means no anon policy required)
- **Total: 191** (delta: −21)

## Post-state (after final confirmation re-apply, 2026-05-18 08:06 UTC)

Same query, third pass:

```
rls_off=0     rls_on=197  anon_select_policies=12     tables_named_in_migration=119   public_ref_tables_with_anon_select_target=12
```

Idempotent re-apply confirmed — no state drift between apply versions.

## Rollback procedure (if ever needed)

The migration only flips metadata flags (`rowsecurity`) and creates 12 policies. No data mutated. Rollback is mechanical:

```sql
BEGIN;

-- 1. Drop the 12 anon_select policies (no data impact)
DROP POLICY IF EXISTS "anon_select" ON public."AbnLookupCache";
DROP POLICY IF EXISTS "anon_select" ON public."AppRelease";
DROP POLICY IF EXISTS "anon_select" ON public."AuthorityFormTemplate";
DROP POLICY IF EXISTS "anon_select" ON public."BuildingCode";
DROP POLICY IF EXISTS "anon_select" ON public."Citation";
DROP POLICY IF EXISTS "anon_select" ON public."CostDatabase";
DROP POLICY IF EXISTS "anon_select" ON public."IicrcChunk";
DROP POLICY IF EXISTS "anon_select" ON public."InsurancePolicyRequirement";
DROP POLICY IF EXISTS "anon_select" ON public."RegulatoryDocument";
DROP POLICY IF EXISTS "anon_select" ON public."RegulatorySection";
DROP POLICY IF EXISTS "anon_select" ON public."ScopePricingDatabase";
DROP POLICY IF EXISTS "anon_select" ON public."WaterDamageClassification";

-- 2. Disable RLS on the 119 tables (full list in migration file). Loop variant:
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'AssessmentGeneration','ScrapingProviderConnection','OrganizationPricingConfig',
    -- ... (the full 119 — copy from supabase/migrations/20260518_enable_rls_phase_1_close_anon_exposure.sql)
    'Organization'
  ] LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
```

Not anticipated to be needed — server-side code paths verified pre-apply at `.claude/aggregation/supabase/service-role-audit-2026-05-18.md` to bypass RLS via `postgres` user (Prisma) and `SUPABASE_SERVICE_ROLE_KEY` (Supabase JS client). Browser code does not read these tables via the anon key.

## Smoke-test reproduction

Anyone with project access can independently re-verify the post-state at any time:

```bash
# Via Supabase MCP:
mcp__claude_ai_Supabase__execute_sql \
  --project_id udooysjajglluvuxkijp \
  --query "SELECT COUNT(*) FILTER (WHERE rowsecurity=false) AS rls_off,
                  COUNT(*) FILTER (WHERE rowsecurity=true) AS rls_on,
                  (SELECT COUNT(*) FROM pg_policies
                   WHERE schemaname='public' AND policyname='anon_select') AS anon_select_policies
           FROM pg_tables WHERE schemaname='public';"
```

Expected: `rls_off=0, rls_on=197, anon_select_policies=12`.

```bash
mcp__claude_ai_Supabase__get_advisors --project_id udooysjajglluvuxkijp --type security
```

Expected: `0` lints with `level=ERROR` (down from `128` pre-apply).

## Related

- Parent epic: [RA-4956](https://linear.app/unite-group/issue/RA-4956)
- Parent advisor audit: [RA-4827](https://linear.app/unite-group/issue/RA-4827) — 82 perf advisors still open as separate cleanup
- Bucket categorisation: `.claude/aggregation/supabase/rls-categorisation.md`
- Service-role audit: `.claude/aggregation/supabase/service-role-audit-2026-05-18.md`
