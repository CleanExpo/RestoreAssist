# Phase 1 Completion Report

Date: 2026-05-25

## Status

Phase 1 is not complete.

This report exists to prevent an ambiguous completion claim while Phase 1 production-readiness work continues from `codex/phase-1-production-readiness-clean`.

## Completed So Far

- Clean Phase 1 branch established from the merged Phase 0 baseline.
- Billing redirect salvage work preserved on the clean branch.
- Mobile offline queue core preserved on the clean branch.
- Mobile offline queue unit coverage added for persistence, duplicate mutation IDs, idempotency headers, successful replay, retry, and failed queue state.
- Advisory API route production audit gate added for auth/RBAC/query/raw-SQL/error-leakage visibility.
- First API error-leakage hardening pass completed for progress, assessment generation, bulk status, and scopes routes.
- Flagged admin business metrics and impersonation routes now revalidate admin role from DB via `verifyAdminFromDb`.
- Bulk duplicate transaction failures no longer expose exception messages in 500 JSON responses.
- Health routes now use `Prisma.sql` for raw probes, no longer expose migration exception details, and are documented as public monitoring exception candidates in the advisory audit.
- Public directory/checklist/OAuth/observability/setup endpoints are now explicit advisory exception candidates, and mobile beta signup counts require DB-verified admin auth.
- Admin stats and vectorise-jobs raw SQL now use `Prisma.sql`/parameterized Prisma raw APIs; vectorise-jobs fallback 500 response no longer exposes exception messages.
- Runtime DDL paths were removed from admin migrate-v2 and Ascora sync; both now require Prisma migrations to own schema setup.
- Codex Stop hook repaired and trusted with `bash .codex/hooks/stop-verifier.sh`.
- Supabase RLS P0 local/code validation completed from safe-branch RA-4970 artifacts: migration present, production apply log records `rls_off=0`, and post-apply security advisor evidence records 0 ERROR-level findings.
- Checkout correction report committed from the verified safe worktree.
- Vercel TLS env verification completed as a read-only inspection: repo does not execute the bypass directly, but Vercel Production contains `NODE_TLS_REJECT_UNAUTHORIZED`; Preview and Development do not list it. `VERCEL_TLS_ENV_VERIFICATION_REPORT.md` documents the manual removal path.
- Mobile validation path completed as a separate Expo package flow: `pnpm --dir mobile install --ignore-workspace`, `pnpm --dir mobile --ignore-workspace type-check`, and `cd mobile && pnpm exec vitest run --config vitest.config.ts`.
- API audit warning-reduction slice completed: warnings reduced from 76 to 61 by fixing false positives in the audit scanner and bounding high-confidence authenticated list reads.
- API audit bounded bulk/import slice completed: warnings reduced from 61 to 57 by adding request-size limits and explicit Prisma caps for selected bulk/import/list routes.
- API audit bounded detail/helper slice completed: warnings reduced from 57 to 52 by bounding selected detail/helper reads and replacing one full question-table lookup with `findFirst`.
- API audit inspection list slice completed: warnings reduced from 52 to 44 by adding conservative caps to selected inspection-scoped list reads.
- API audit inspection workflow/support-read slice completed: warnings reduced from 44 to 41 by bounding sketch estimate, workflow evidence/exception/step, and client-scoped report ID reads.
- API audit bounded authority/bulk support slice completed: warnings reduced from 41 to 37 by replacing token-signature completion scan with a count and bounding selected authority-form/bulk report reads.
- API audit bounded report bulk/export slice completed: warnings reduced from 37 to 33 by adding explicit caps to selected bulk duplicate/export report reads.
- API audit hydration stream slice completed: warnings reduced from 33 to 32 by bounding setup hydration SSE polling to the three expected organization setup jobs.
- Voice session persistence completed: realtime voice copilot sessions and observations now persist to `VoiceCopilotSession` / `VoiceCopilotObservation` via additive Prisma migration `20260525030000_voice_copilot_sessions`; process-local memory is no longer the source of truth, high-confidence stored observations persist `storedAt`, and ended/expired sessions reject new observations.
- Report generation hardening completed for the current Priority 6 slice: enhanced report generation, PDF parsing, and bulk ZIP export no longer return provider/parser/per-report exception details to clients on failure; diagnostics remain server-side.
- Upload/evidence-chain batch reliability completed for the current Priority 7 slice: partial storage failures no longer shift successful upload metadata onto the wrong EvidenceItem, and per-file storage/DB failures return generic client-safe messages with detailed diagnostics kept server-side.
- Sketch import upload hardening completed for the current Priority 7 slice: Vision sketch import now validates JPEG/PNG magic bytes before the AI call, uses the detected media type instead of the multipart MIME header, and no longer returns API-key/provider detail to clients.
- Sketch import rate-limit consolidation completed for the current Priority 7 slice: Vision import throttling now uses the shared `applyRateLimit` helper keyed by `session.user.id` instead of a route-local module `Map`.
- Auth/RBAC tenancy helper hardening completed for the current Priority 8 slice: shared report and inspection tenancy helpers now revalidate admin bypass from the DB, so stale demoted-admin JWTs no longer grant cross-tenant access.

## Validation Evidence

- `pnpm install --frozen-lockfile`: PASS during branch recovery
- `pnpm prisma:generate`: PASS during branch recovery
- `pnpm type-check`: PASS
- `pnpm lint`: PASS with 0 errors and 840 warnings
- `pnpm exec vitest run`: PASS during branch recovery
- `pnpm build`: PASS during branch recovery
- `pnpm audit --audit-level=high --prod`: PASS for high-severity gate during branch recovery; 3 moderate vulnerabilities reported
- `pnpm exec vitest run --config vitest.config.ts` from `mobile/`: PASS, 1 file / 3 tests
- `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts`: PASS, 1 file / 6 tests
- `pnpm exec tsx scripts/audit-api-routes.ts --json`: PASS, scanned 442 routes with 0 error-severity and 76 warning-severity advisory findings after retiring runtime DDL paths
- `git diff --check`: PASS
- RLS validation slice rerun after `RA-4970_RLS_VALIDATION_REPORT.md`: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 76 findings / 0 errors / 76 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- Vercel TLS env verification slice: `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- Mobile validation path slice: `pnpm --dir mobile install --ignore-workspace` PASS after dependency installation, `pnpm --dir mobile --ignore-workspace type-check` PASS, `cd mobile && pnpm exec vitest run --config vitest.config.ts` PASS with 1 file / 3 tests.
- API audit warning-reduction slice: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 61 warnings / 0 errors before final validation.
- API audit bounded bulk/import slice: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 57 warnings / 0 errors before final validation.
- API audit bounded detail/helper slice: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 52 warnings / 0 errors before final validation.
- API audit inspection list slice: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 44 warnings / 0 errors before final validation.
- API audit inspection workflow/support-read slice: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 41 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- API audit bounded authority/bulk support slice: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 37 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- API audit bounded report bulk/export slice: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 33 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- API audit hydration stream slice: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 32 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- Voice session persistence slice: `pnpm prisma:generate` PASS, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 32 warnings / 0 errors, `git diff --check` PASS, `pnpm exec vitest run` PASS with 206 files / 1817 tests passed and 16 files / 81 tests skipped, `pnpm build` PASS, `pnpm audit --audit-level=high --prod` PASS for high-severity gate with 3 moderate vulnerabilities reported.
- Report generation hardening slice: `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 32 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `git diff --check` PASS.
- Upload/evidence-chain batch slice: `pnpm exec vitest run app/api/inspections/[id]/evidence/batch/__tests__/route.test.ts` PASS with 1 file / 1 test, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 32 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `git diff --check` PASS.
- Sketch import upload hardening slice: `pnpm exec vitest run app/api/inspections/[id]/sketches/import-from-image/__tests__/route.test.ts` PASS with 1 file / 1 test, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 32 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `git diff --check` PASS.
- Sketch import rate-limit consolidation slice: `pnpm exec vitest run app/api/inspections/[id]/sketches/import-from-image/__tests__/route.test.ts` PASS with 1 file / 2 tests, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 32 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `git diff --check` PASS.
- Auth/RBAC tenancy helper slice: `pnpm exec vitest run lib/auth/__tests__/assert-tenancy.test.ts` PASS with 1 file / 17 tests, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 32 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `git diff --check` PASS.

## Phase 1 Acceptance Criteria Still Open

- Production forbidden-env audit is not yet green: Vercel Production lists `NODE_TLS_REJECT_UNAUTHORIZED`.
- Live Supabase RLS revalidation still needs an authenticated check against project `udooysjajglluvuxkijp`, but the RA-4970 migration and production apply evidence are present in this branch.
- Admin route DB-role revalidation sweep is not complete.
- P0 query/raw SQL/error leakage routes are not fully patched; API audit currently reports 0 errors and 32 warnings.
- Shared media validator has not been migrated across canonical upload and sketch import.
- Shared route rate limiting still uses in-memory process state, including the sketch import route now that it uses `applyRateLimit`; a distributed backend is still required for multi-instance/serverless enforcement.
- Offline mutation idempotency foundation is client-tested and mobile package type-check is now repeatable, but server replay is not yet backed by durable database idempotency.

## Current Blockers

### Live Supabase RLS revalidation

Error: live Supabase revalidation was not run in this turn.

Cause: no Supabase MCP/project credential tool is available in the current toolset.

Fix: re-run the smoke queries in `.claude/aggregation/supabase/ra-4970-apply-log.md` against project `udooysjajglluvuxkijp`.

Next action: confirm `rls_off=0`, `rls_on=197`, `anon_select_policies=12`, and `0` ERROR-level security advisor findings with live Supabase access.

### Vercel production TLS bypass

Error: `NODE_TLS_REJECT_UNAUTHORIZED` exists in the Vercel Production environment.

Cause: historical Ascora self-signed/non-standard certificate workaround was documented as a production env option and appears to have been applied.

Fix: remove `NODE_TLS_REJECT_UNAUTHORIZED` from Vercel Production unless an owner provides audited proof that the encrypted value is not `0` and harmless. Prefer a scoped Ascora TLS trust strategy over process-wide certificate verification bypass.

Next action: run `vercel env rm NODE_TLS_REJECT_UNAUTHORIZED production --scope unite-group` from the linked temp directory or Vercel dashboard, then confirm `vercel env ls production --scope unite-group` no longer lists it.

### API route hardening debt

Error: advisory API route scan reports 0 error-severity findings and 32 warnings.

Cause: inherited warning-severity debt remains across public exception reviews and heavier Prisma reads that need route-specific product/security decisions before applying caps or pagination.

Fix: remediate warning groups in small commits and run `pnpm exec tsx scripts/audit-api-routes.ts --json` after each group. Treat public exception warnings as a manual security review checklist before ship.

Next action: continue with warning-severity `findMany` bounds/selects where semantics are clear, then review public exception candidates for expiry, rate limit, scope, and audit events.

## Ship Readiness

RestoreAssist is not ship-ready.

## Next Safe Action

Continue with Priority 7 upload/evidence-chain reliability, while leaving the remaining 32 API audit warnings documented for product/security review. Continue only from `/private/tmp/RestoreAssist-phase1-main` and do not stage `.github/PULL_REQUEST_TEMPLATE.md`.
