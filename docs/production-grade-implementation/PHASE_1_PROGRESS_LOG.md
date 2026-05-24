# Phase 1 Progress Log

Date: 2026-05-25

## Current Status

Phase 1 is in progress from the clean branch `codex/phase-1-production-readiness-clean` in `/private/tmp/RestoreAssist-phase1-main`.

RestoreAssist is not ship-ready. This log records production-readiness work completed or validated after the branch recovery pass.

## Baseline Confirmed

- Branch: `codex/phase-1-production-readiness-clean`
- Worktree: `/private/tmp/RestoreAssist-phase1-main`
- Phase 0 PR #1176: merged at `8c216f79f6431c2cd2ca6c4a371ff1c5e307e44a`
- Node: `v22.22.3`
- pnpm: `9.15.9`
- Known protected dirty path remains unstaged: `.github/PULL_REQUEST_TEMPLATE.md`

## Completed Tasks

### SEC-001: Supabase RLS P0 Local Validation

Validated the safe-branch RA-4970 artifacts for the production RLS P0:

- `supabase/migrations/20260518_enable_rls_phase_1_close_anon_exposure.sql` exists and enables RLS on the 119 named public tables through an existence-checked helper.
- `.claude/aggregation/supabase/ra-4970-apply-log.md` records three successful production apply/confirmation passes against `udooysjajglluvuxkijp`.
- recorded production post-state is `rls_off=0`, `rls_on=197`, `anon_select_policies=12`, with `0` ERROR-level Supabase security advisor findings after apply.
- `.claude/aggregation/supabase/service-role-audit-2026-05-18.md` documents that browser Supabase usage is storage-only and table access uses Prisma or `SUPABASE_SERVICE_ROLE_KEY`.

Created `docs/production-grade-implementation/RA-4970_RLS_VALIDATION_REPORT.md` to separate the completed local/code validation from the remaining live Supabase revalidation step.

### INF-005: Vercel TLS Env Verification

Verified Vercel TLS bypass risk from the safe worktree without modifying production env values.

Repo inspection found no executable assignment of `NODE_TLS_REJECT_UNAUTHORIZED`, and no setting in `vercel.json`, `.env.example`, `scripts/build.sh`, or GitHub workflows. Two Ascora route comments still document the workaround as a dev/prod option.

Live Vercel env names/scopes were inspected read-only from a temporary directory outside the repo (`/private/tmp/ra-vercel-env-check`) linked to `unite-group/restoreassist`. Result:

- Production: `NODE_TLS_REJECT_UNAUTHORIZED` is present as an encrypted env var, created 56d ago.
- Preview: not present.
- Development: not present.

Created `docs/production-grade-implementation/VERCEL_TLS_ENV_VERIFICATION_REPORT.md`. Priority 2 is now documented as a live production env blocker: remove the production variable or provide audited proof its value is not `0` and harmless. No secrets were pulled or printed into repo docs.

### MOB-002: Mobile Validation Path

Defined and validated the repeatable mobile install/type-check path as a separate package rather than adding `mobile/` to the root pnpm workspace.

Decision: keep mobile outside the root workspace for now because the web app uses React 19 / Next 16 / TypeScript 6-era tooling while mobile uses Expo 52 / React 18 / React Native 0.76 / TypeScript 5.3.

Implemented:

- added `mobile/pnpm-lock.yaml` through `pnpm --dir mobile install --ignore-workspace`
- changed `mobile/tsconfig.json` `ignoreDeprecations` to `5.0` for the mobile package's TypeScript 5.3 compiler
- excluded mobile tests/test mocks/Vitest config from production mobile type-check
- removed a root server type-only import from `mobile/lib/api/byok-vision-client.ts` by defining the mobile response contract locally
- created `docs/production-grade-implementation/MOBILE_VALIDATION_PATH_REPORT.md`

Repeatable commands:

- `pnpm --dir mobile install --ignore-workspace`
- `pnpm --dir mobile --ignore-workspace type-check`
- `cd mobile && pnpm exec vitest run --config vitest.config.ts`

### MOB-001: Offline Mutation Queue Test Coverage

The existing mobile offline queue core now has focused unit coverage for the first production-safety invariants:

- queued mutations persist in the local SQLite-backed queue abstraction
- duplicate mutation IDs return the existing queued row instead of creating another entry
- replay sends both `Idempotency-Key` and `X-RestoreAssist-Mutation-Id`
- successful replay removes the queued row and increments refresh state
- retryable server failures stay pending until the retry limit
- exhausted retries move the row to failed and surface failed queue count

This does not complete MOB-001. Server-side durable idempotency via `ClientMutation`/`FieldCaptureEvent`, route integration, conflict handling, and network-toggle/device integration coverage remain open.

### API-001: Advisory API Route Production Audit Gate

Added an advisory scanner for `app/api/**/route.ts` so Phase 1 can keep auth/RBAC/query/raw-SQL/error-leakage risk visible while routes are remediated in small commits.

The scanner currently checks:

- non-exempt API routes without `getServerSession`, `getToken`, or `verifyAdminFromDb`
- admin routes that do not revalidate role from DB with `verifyAdminFromDb`
- Prisma `findMany` calls without a nearby explicit `take`
- unsafe raw SQL methods or untagged raw SQL template usage
- JSON 500 responses that appear to expose `error.message`
- public token route candidates that need explicit token/rate-limit/audit review

The gate is advisory by default and only fails when invoked with `--strict`. This avoids blocking the clean Phase 1 branch on known inherited debt while giving the remaining route-hardening work a repeatable target.

Initial scan result from `pnpm exec tsx scripts/audit-api-routes.ts --json`:

- Routes scanned: 442
- Findings: 99
- Errors: 31
- Warnings: 68

Follow-up hardening pass:

- tightened the scanner to avoid counting safe generic-500 ternaries as leaks
- replaced direct 500 body exception/service messages in the first route group with generic client responses
- switched the remaining flagged admin role-claim checks to `verifyAdminFromDb`
- replaced the bulk duplicate transaction 500 body with a generic client message
- converted health raw SQL checks to `Prisma.sql`, removed migration exception detail leakage, and classified documented public health monitor endpoints as exception candidates
- classified documented public directory/checklist/OAuth/observability/setup endpoints as exception candidates and protected the mobile beta signup count endpoint with DB-verified admin auth
- converted admin stats and vectorise-jobs raw SQL to `Prisma.sql`/parameterized Prisma raw APIs, and removed vectorise-jobs fallback 500 message leakage
- retired the gated admin runtime-DDL endpoint with a migrations-only `410` response and removed Ascora sync's auto-DDL bootstrap in favor of migration verification
- current scan result: 442 routes, 76 findings, 0 errors, 76 warnings

## Files Changed

- `mobile/lib/sync/__tests__/engine.test.ts`
- `mobile/test/expo-sqlite-mock.ts`
- `mobile/vitest.config.ts`
- `mobile/tsconfig.base.json`
- `mobile/tsconfig.json`
- `scripts/audit-api-routes.ts`
- `scripts/__tests__/audit-api-routes.test.ts`
- `app/api/progress/[reportId]/init/route.ts`
- `app/api/progress/[reportId]/route.ts`
- `app/api/progress/[reportId]/transition/route.ts`
- `app/api/inspections/[id]/assessments/[type]/generate/route.ts`
- `app/api/reports/bulk-status/route.ts`
- `app/api/scopes/route.ts`
- `app/api/admin/business-metrics/route.ts`
- `app/api/admin/impersonate/route.ts`
- `app/api/admin/impersonate/log/route.ts`
- `app/api/admin/impersonate/stop/route.ts`
- `app/api/reports/bulk-duplicate/route.ts`
- `app/api/health/route.ts`
- `app/api/health/migrations/route.ts`
- `app/api/mobile/beta-signup/route.ts`
- `app/api/admin/stats/route.ts`
- `app/api/inspections/[id]/vectorise-jobs/route.ts`
- `app/api/admin/migrate-v2/route.ts`
- `app/api/ascora/sync/route.ts`
- `docs/production-grade-implementation/CHECKOUT_STATE_REPORT.md`
- `docs/production-grade-implementation/RA-4970_RLS_VALIDATION_REPORT.md`
- `docs/production-grade-implementation/VERCEL_TLS_ENV_VERIFICATION_REPORT.md`
- `docs/production-grade-implementation/MOBILE_VALIDATION_PATH_REPORT.md`
- `docs/production-grade-implementation/PHASE_1_PROGRESS_LOG.md`
- `docs/production-grade-implementation/PHASE_1_COMPLETION_REPORT.md`
- `mobile/lib/api/byok-vision-client.ts`
- `mobile/tsconfig.json`
- `mobile/pnpm-lock.yaml`
- `app/api/addons/check-pending/route.ts`
- `app/api/addons/purchases/route.ts`
- `app/api/authority-forms/templates/route.ts`
- `app/api/claims/templates/route.ts`
- `app/api/contractors/certifications/route.ts`
- `app/api/contractors/service-areas/route.ts`
- `app/api/form-templates/route.ts`
- `app/api/insurer-profiles/route.ts`
- `app/api/pricing-config/route.ts`
- `app/api/scope-templates/route.ts`
- `app/api/team/assignees/route.ts`
- `app/api/clients/bulk-delete/route.ts`
- `app/api/integrations/oauth/[provider]/clients/route.ts`
- `app/api/integrations/oauth/[provider]/jobs/route.ts`
- `app/api/portal/invitations/route.ts`
- `app/api/authority-forms/[id]/signatures/route.ts`
- `app/api/claims/analyses/latest/route.ts`
- `app/api/forms/interview/answer/route.ts`
- `app/api/inspections/[id]/activity/route.ts`
- `app/api/inspections/[id]/audit/route.ts`
- `app/api/inspections/[id]/apply-checklist/route.ts`
- `app/api/inspections/[id]/circuit-assessment/route.ts`
- `app/api/inspections/[id]/contents-pack-out/route.ts`
- `app/api/inspections/[id]/evidence/qa-scores/route.ts`
- `app/api/inspections/[id]/evidence/route.ts`
- `app/api/inspections/[id]/photos/route.ts`
- `app/api/inspections/[id]/psychrometric/route.ts`
- `app/api/inspections/[id]/sketches/route.ts`
- `app/api/inspections/[id]/sketches/estimate/route.ts`
- `app/api/inspections/[id]/workflow/route.ts`
- `app/api/inspections/route.ts`
- `app/api/authority-forms/sign/[token]/route.ts`
- `app/api/reports/[id]/authority-forms/route.ts`
- `app/api/reports/bulk-delete/route.ts`
- `app/api/reports/bulk-status/route.ts`
- `app/api/reports/bulk-duplicate/route.ts`
- `app/api/reports/bulk-export-excel-list/route.ts`
- `app/api/reports/bulk-export-excel/route.ts`
- `app/api/reports/bulk-export-zip/route.ts`
- `app/api/setup/hydrate/stream/route.ts`

## Validation Run

- `pnpm exec vitest run --config vitest.config.ts` from `mobile/`: PASS, 1 file / 3 tests
- `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts`: PASS, 1 file / 6 tests
- `pnpm exec tsx scripts/audit-api-routes.ts --json`: PASS, scanned 442 routes with 76 advisory findings and 0 error findings after retiring runtime DDL paths
- `pnpm type-check`: PASS
- `pnpm lint`: PASS with 0 errors and 840 warnings
- `git diff --check`: PASS
- RLS validation slice rerun after `RA-4970_RLS_VALIDATION_REPORT.md`: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 76 findings / 0 errors / 76 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- Vercel TLS env verification slice: `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- Mobile validation path slice: `pnpm --dir mobile install --ignore-workspace` PASS after network access, `pnpm --dir mobile --ignore-workspace type-check` PASS, `cd mobile && pnpm exec vitest run --config vitest.config.ts` PASS with 1 file / 3 tests.
- API audit warning-reduction slice: starting audit 442 routes / 76 warnings / 0 errors. Warning categories were `prisma-findmany-take` and `public-token-route-review`. The scanner now checks the full `findMany(...)` call instead of a 25-line window, with regression coverage for large include/select blocks. Added explicit caps to high-confidence authenticated list routes and replaced one existence-only integration lookup with `findFirst`. Ending audit: 442 routes / 61 warnings / 0 errors.
- API audit bounded bulk/import slice: added request-size limits and matching Prisma `take` caps for client bulk-delete, external integration client/job imports, and portal invitation listing. Ending audit: 442 routes / 57 warnings / 0 errors before final validation.
- API audit bounded detail/helper slice: capped authority-form signatures and latest claim-analysis detail reads, changed interview answer question lookup from `findMany` to `findFirst`, and bounded inspection activity/audit helper reads. Ending audit: 442 routes / 52 warnings / 0 errors before final validation.
- API audit inspection list slice: added conservative per-inspection caps for checklist application, circuit assessments, contents pack-out items, evidence/QA/photo lists, psychrometric readings, and sketches. Ending audit: 442 routes / 44 warnings / 0 errors before final validation.
- API audit inspection workflow/support-read slice: capped sketch estimate floor reads, workflow evidence/exception/step reads, and client-scoped report ID lookup feeding the paginated inspection list. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 41 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- API audit bounded authority/bulk support slice: replaced token-signing completion scan with an unsigned-signature count, capped report authority-form listing, bounded bulk-status notification report lookup, and added a 100-report bulk-delete request cap with a matching Prisma `take`. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 37 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- API audit bounded report bulk/export slice: added explicit Prisma `take` caps for bulk duplicate, Excel export, Excel URL-list export, and ZIP export reads, plus a 100-report request cap for the Excel URL-list route. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 33 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- API audit hydration stream slice: added deterministic ordering and an explicit 3-job cap to setup hydration SSE polling. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 32 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.

## Failing Or Blocked Checks

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

### API route audit inherited findings

Error: advisory API route scan reports 0 error-severity findings and 32 warning-severity findings.

Cause: error-severity auth/raw-SQL/500-leak findings have been remediated or classified as documented public exception candidates. Recent slices removed false positives and high-confidence unbounded list/import/detail/workflow/bulk support/export reads, but warning-severity inherited debt remains across public exception reviews and heavier Prisma `findMany` candidates that need route-specific product/security decisions.

Fix: continue remediating warning groups in narrow commits, then run the scanner without `--strict` to verify count reduction. `--strict` can now be considered for error-severity findings only, but warnings still need manual review before ship.

Next action: review the remaining warning-severity public exceptions and heavier `findMany` candidates, then decide which warnings become strict ship gates.

## Unresolved Risks

- MOB-001 is only partially covered. The client queue exists and now has tests, but server replay is not yet backed by durable database idempotency.
- `ClientMutation` and `FieldCaptureEvent` Prisma models are still absent.
- Process-local idempotency in `lib/idempotency.ts` is not sufficient for multi-instance/serverless offline replay guarantees.
- Mobile validation is now repeatable as a standalone Expo package path, but mobile is intentionally not part of root workspace validation yet.
- API route audit is advisory only. It has identified inherited route-hardening debt and these slices reduced warnings from 76 to 32, but remaining public/token and heavier query warnings still need review.
- Protected `.github/PULL_REQUEST_TEMPLATE.md` case-collision dirtiness remains visible and must not be staged with Phase 1 work.

## Rollback Notes

- `mobile/pnpm-lock.yaml` can be reverted to return mobile dependency ownership to the previous undocumented state.
- Reverting the `mobile/tsconfig.json` and `mobile/lib/api/byok-vision-client.ts` changes reintroduces the TypeScript 5.3 config error and root-server type dependency that blocked standalone mobile type-check.

## Next Safe Action

Continue Priority 4 with route-specific review of the remaining 32 API audit warnings. Remaining Prisma warnings are mostly aggregate, sync, invoice-sequence recovery, webhook signature resolution, or pilot-readiness summaries that require route-specific product/security decisions before applying caps. Keep using `/private/tmp/RestoreAssist-phase1-main` only, and do not stage `.github/PULL_REQUEST_TEMPLATE.md`.
