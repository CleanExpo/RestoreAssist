# RA-4970 RLS Validation Report

Date: 2026-05-25

## Scope

Priority 1 Phase 1 production hardening: Supabase RLS P0 validation/fix.

This pass used only the verified safe worktree:

- pwd: `/private/tmp/RestoreAssist-phase1-main`
- branch: `codex/phase-1-production-readiness-clean`

No application code was modified. A narrow Supabase migration was added to repair live RLS drift discovered during revalidation.

## Finding

The Supabase RLS P0 is no longer an unimplemented code change in this branch. The safe worktree contains:

- Migration: `supabase/migrations/20260518_enable_rls_phase_1_close_anon_exposure.sql`
- Apply log: `.claude/aggregation/supabase/ra-4970-apply-log.md`
- Categorisation: `.claude/aggregation/supabase/rls-categorisation.md`
- Service-role audit: `.claude/aggregation/supabase/service-role-audit-2026-05-18.md`

The original apply log records production project `udooysjajglluvuxkijp` post-state after three successful RA-4970 apply/confirmation passes:

- `rls_off=0`
- `rls_on=197`
- `anon_select_policies=12`
- Supabase security advisor: `0` ERROR-level findings after apply

The migration is environment-tolerant and enables RLS on the 119 named public tables, with default-deny behaviour for anon/authenticated roles except the 12 public reference tables that receive explicit `anon_select` policies.

## Local Artifact Validation

- The RA-4970 migration file exists in `supabase/migrations/`.
- The migration uses `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` through an existence-checked helper.
- The migration creates exactly the documented `anon_select` policy shape for public reference tables.
- The service-role audit documents that browser Supabase usage is storage-only and server table access uses Prisma or `SUPABASE_SERVICE_ROLE_KEY`.

## Live Revalidation And Drift Repair

Authenticated Supabase CLI access was available from a temporary workdir outside the repo:

- temp link path: `/private/tmp/ra-supabase-rls-check`
- project: `udooysjajglluvuxkijp`

Initial live smoke query result on 2026-05-25:

```json
{
  "rls_off": 1,
  "rls_on": 197,
  "anon_select_policies": 12
}
```

The single table with RLS disabled was `XeroSyncStatus`, which was added by Prisma migration `20260522225545_add_xero_sync_status` after the original RA-4970 RLS closeout.

Fix added:

- `supabase/migrations/20260525061000_enable_rls_xero_sync_status.sql`

The migration enables RLS on `public."XeroSyncStatus"` only when the table exists. It does not add anon policies, so browser/client access remains default-deny.

The Supabase CLI `db push --linked --dry-run` path could not be used because the remote Supabase migration history contains many historical versions that are not present in this branch's local `supabase/migrations` directory. The exact committed migration SQL was applied with:

```bash
supabase db query --linked \
  --workdir /private/tmp/ra-supabase-rls-check \
  --file /private/tmp/RestoreAssist-phase1-main/supabase/migrations/20260525061000_enable_rls_xero_sync_status.sql \
  --output json
```

Post-fix verification query for disabled RLS tables returned an empty row set:

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname='public' AND rowsecurity=false
ORDER BY tablename;
```

Final live aggregate recheck result:

```json
{
  "rls_off": 0,
  "rls_on": 198,
  "anon_select_policies": 12
}
```

Security advisor recheck:

```text
No issues found
```

Completed live evidence:

- before fix: `rls_off=1`, `rls_on=197`, `anon_select_policies=12`
- drift table identified: `XeroSyncStatus`
- fix applied: `ALTER TABLE public."XeroSyncStatus" ENABLE ROW LEVEL SECURITY` through the committed migration file
- after fix: `rls_off=0`, `rls_on=198`, `anon_select_policies=12`
- security advisor: no ERROR-level findings returned by `supabase db advisors --linked --type security --level error --fail-on none`

## Remaining Blocker

None for Supabase RLS P0.

## Decision

Phase 1 RLS implementation now includes the original RA-4970 closeout plus the `XeroSyncStatus` drift repair. Live RLS aggregate counts and security advisor verification are green.
