# RA-4970 RLS Validation Report

Date: 2026-05-25

## Scope

Priority 1 Phase 1 production hardening: Supabase RLS P0 validation/fix.

This pass used only the verified safe worktree:

- pwd: `/private/tmp/RestoreAssist-phase1-main`
- branch: `codex/phase-1-production-readiness-clean`

No application code was modified.

## Finding

The Supabase RLS P0 is no longer an unimplemented code change in this branch. The safe worktree contains:

- Migration: `supabase/migrations/20260518_enable_rls_phase_1_close_anon_exposure.sql`
- Apply log: `.claude/aggregation/supabase/ra-4970-apply-log.md`
- Categorisation: `.claude/aggregation/supabase/rls-categorisation.md`
- Service-role audit: `.claude/aggregation/supabase/service-role-audit-2026-05-18.md`

The apply log records production project `udooysjajglluvuxkijp` post-state after three successful RA-4970 apply/confirmation passes:

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

## Remaining Blocker

Error: Live Supabase revalidation was not run in this turn.

Cause: No Supabase MCP/project credential tool is available in the current toolset, and the user explicitly asked not to continue unsafe checkout work.

Fix: Re-run the smoke queries in `.claude/aggregation/supabase/ra-4970-apply-log.md` against project `udooysjajglluvuxkijp` using the authenticated Supabase tool or dashboard SQL editor.

Next action: Confirm `rls_off=0`, `rls_on=197`, `anon_select_policies=12`, and `0` ERROR-level security advisor findings with live Supabase access. Then proceed to Priority 2: Vercel production TLS env verification.

## Decision

Phase 1 can move past local RLS code/documentation implementation because the migration and production apply evidence are present. Live Supabase revalidation remains a credentials/tooling verification step, not an application-code blocker.
