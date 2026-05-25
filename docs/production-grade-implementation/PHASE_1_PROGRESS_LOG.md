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

Live Supabase RLS revalidation was later available through the authenticated Supabase CLI from `/private/tmp/ra-supabase-rls-check`. The first live aggregate query found drift: `rls_off=1`, `rls_on=197`, `anon_select_policies=12`. The only disabled table was `XeroSyncStatus`, added after RA-4970 by Prisma migration `20260522225545_add_xero_sync_status`.

Added and applied `supabase/migrations/20260525061000_enable_rls_xero_sync_status.sql`, enabling RLS on `public."XeroSyncStatus"` with default-deny browser behaviour. `supabase db push --linked --dry-run` could not be used because remote Supabase migration history contains historical versions absent from this branch's local `supabase/migrations` directory, so the exact committed migration SQL was applied via `supabase db query --linked --file`.

Post-fix disabled-table query returned no rows for `schemaname='public' AND rowsecurity=false`. Final aggregate recheck returned `rls_off=0`, `rls_on=198`, `anon_select_policies=12`. `supabase db advisors --linked --type security --level error --fail-on none` returned `No issues found`.

### INF-005: Vercel TLS Env Verification

Verified Vercel TLS bypass risk from the safe worktree without modifying production env values.

Repo inspection found no executable assignment of `NODE_TLS_REJECT_UNAUTHORIZED`, and no setting in `vercel.json`, `.env.example`, `scripts/build.sh`, or GitHub workflows. The Ascora route comments now use scoped-trust guidance instead of naming the process-wide TLS bypass.

Live Vercel env names/scopes were inspected from a temporary directory outside the repo (`/private/tmp/ra-vercel-env-check`) linked to `unite-group/restoreassist`. Initial result:

- Production: `NODE_TLS_REJECT_UNAUTHORIZED` is present as an encrypted env var, created 57d ago on the latest read-only recheck.
- Preview: not present.
- Development: not present.

Created `docs/production-grade-implementation/VERCEL_TLS_ENV_VERIFICATION_REPORT.md`. Priority 2 was documented as a live production env blocker: remove the production variable or provide audited proof its value is not `0` and harmless. No secrets were pulled or printed into repo docs.

Latest authenticated Vercel correction removed the Production variable with `vercel env rm NODE_TLS_REJECT_UNAUTHORIZED production --scope unite-group --yes`. Follow-up `vercel env ls production --scope unite-group`, `vercel env ls preview --scope unite-group`, and `vercel env ls development --scope unite-group` no longer list `NODE_TLS_REJECT_UNAUTHORIZED`. No env values were pulled.

Production runtime refresh is complete: redeployed the previous production deployment with `vercel redeploy https://restoreassist-q1jnwop0f-unite-group.vercel.app --target production --scope unite-group`. New deployment `https://restoreassist-lsy4h48b0-unite-group.vercel.app` / `dpl_E74G3FfRAJkxmHGz3VFsBrNhSRmh` is `Ready`, aliased to `https://restoreassist.app`, and `curl -I https://restoreassist.app` returned `HTTP/2 200`.

Added the SEC-002 local forbidden-env audit gate:

- `scripts/audit-env.ts` scans repo env examples, deploy/build config, workflows, app, lib, and scripts without reading secrets.
- it errors on executable or deploy-config `NODE_TLS_REJECT_UNAUTHORIZED=0`, missing required `.env.example` coverage, and `NEXT_PUBLIC_*SERVICE_ROLE*` naming.
- the known Ascora route comments no longer recommend or name the process-wide TLS verification bypass.
- current local result is 0 errors and 0 warnings. Live Vercel Production still remains blocked because the encrypted production env var exists.

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

This does not complete MOB-001. Durable server-side idempotency now backs JSON mutation routes that use `withIdempotency`, multipart evidence-photo replay now uses a server-side idempotency fingerprint over the file hash plus form fields, inspection evidence/environmental-data/moisture-reading/affected-area JSON mutations write `ClientMutation` ledger rows when mobile sends `X-RestoreAssist-Mutation-Id`, and mobile conflict responses now fail fast instead of retrying known-impossible writes. Network-toggle/device integration coverage remains open.

Mobile queue mutation ledger coverage was expanded for the current server write-path slice:

- `environmental-data`, `moisture-reading`, and `affected-area` inspection routes now perform the existing owner inspection check before idempotency handling.
- those routes pass workspace/user/inspection mutation metadata into `withIdempotency` when the inspection has a workspace.
- mobile replays for these queue types now create and complete `ClientMutation` ledger rows when `X-RestoreAssist-Mutation-Id` is present.

Mobile conflict handling was hardened for the current offline queue slice:

- retryable server failures (`5xx` and `408`) still remain pending until retry exhaustion.
- non-retryable server rejections, including `409` mutation conflicts, now move directly to `failed` with the server error text capped in `lastError`.
- failed conflict rows are not replayed again on the next drain, so the queue does not keep sending known-impossible mutations.

Mobile network status wiring was added for the current offline queue slice:

- the root mobile layout now starts a reachability monitor without adding new native dependencies.
- the monitor checks the existing public `/api/health` endpoint and updates the shared `isOnline` store flag.
- the existing queue drain guard, offline banner, sync status bar, and settings network status now receive a real API reachability signal instead of relying only on the store default.

Created `MOBILE_DEVICE_VALIDATION_BLOCKER_REPORT.md` for the remaining manual simulator/device validation. Local tests now cover queue persistence, idempotency headers, retry behavior, conflict fail-fast behavior, and reachability helper behavior; airplane-mode/network-toggle UI and replay observation still require a real simulator or device session.

Latest local device-tooling recheck confirms the blocker remains external to repo code: `xcrun simctl list devices available` fails because `simctl` is unavailable, `emulator` and `adb` are not on `PATH`, and no Android SDK path is visible through `ANDROID_HOME` / `ANDROID_SDK_ROOT`.

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
- `app/api/inspections/[id]/affected-areas/route.ts`
- `app/api/inspections/[id]/environmental/route.ts`
- `app/api/inspections/[id]/moisture/route.ts`
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
- `app/api/inspections/[id]/voice/session/route.ts`
- `app/api/inspections/[id]/voice/observation/route.ts`
- `lib/voice/session.ts`
- `lib/voice/types.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260525030000_voice_copilot_sessions/migration.sql`

## Validation Run

- `pnpm exec vitest run --config vitest.config.ts` from `mobile/`: PASS, 1 file / 3 tests
- `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts`: PASS, 1 file / 6 tests
- `pnpm exec tsx scripts/audit-api-routes.ts --json`: PASS, scanned 442 routes with 76 advisory findings and 0 error findings after retiring runtime DDL paths
- `pnpm type-check`: PASS
- `pnpm lint`: PASS with 0 errors and 840 warnings
- `git diff --check`: PASS
- RLS validation slice rerun after `RA-4970_RLS_VALIDATION_REPORT.md`: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 76 findings / 0 errors / 76 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- Vercel TLS env verification slice: `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- Mobile validation path slice: `pnpm --dir mobile install --ignore-workspace` PASS after network access, `pnpm --dir mobile --ignore-workspace type-check` PASS, `cd mobile && pnpm exec vitest run --config vitest.config.ts` PASS with 2 files / 7 tests.
- API audit warning-reduction slice: starting audit 442 routes / 76 warnings / 0 errors. Warning categories were `prisma-findmany-take` and `public-token-route-review`. The scanner now checks the full `findMany(...)` call instead of a 25-line window, with regression coverage for large include/select blocks. Added explicit caps to high-confidence authenticated list routes and replaced one existence-only integration lookup with `findFirst`. Ending audit: 442 routes / 61 warnings / 0 errors.
- API audit bounded bulk/import slice: added request-size limits and matching Prisma `take` caps for client bulk-delete, external integration client/job imports, and portal invitation listing. Ending audit: 442 routes / 57 warnings / 0 errors before final validation.
- API audit bounded detail/helper slice: capped authority-form signatures and latest claim-analysis detail reads, changed interview answer question lookup from `findMany` to `findFirst`, and bounded inspection activity/audit helper reads. Ending audit: 442 routes / 52 warnings / 0 errors before final validation.
- API audit inspection list slice: added conservative per-inspection caps for checklist application, circuit assessments, contents pack-out items, evidence/QA/photo lists, psychrometric readings, and sketches. Ending audit: 442 routes / 44 warnings / 0 errors before final validation.
- API audit inspection workflow/support-read slice: capped sketch estimate floor reads, workflow evidence/exception/step reads, and client-scoped report ID lookup feeding the paginated inspection list. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 41 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- API audit bounded authority/bulk support slice: replaced token-signing completion scan with an unsigned-signature count, capped report authority-form listing, bounded bulk-status notification report lookup, and added a 100-report bulk-delete request cap with a matching Prisma `take`. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 37 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- API audit bounded report bulk/export slice: added explicit Prisma `take` caps for bulk duplicate, Excel export, Excel URL-list export, and ZIP export reads, plus a 100-report request cap for the Excel URL-list route. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 33 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- API audit hydration stream slice: added deterministic ordering and an explicit 3-job cap to setup hydration SSE polling. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 32 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 840 warnings, `git diff --check` PASS.
- Voice session persistence slice: added durable `VoiceCopilotSession` and `VoiceCopilotObservation` Prisma models/migration, moved `lib/voice/session.ts` from process-local `Map` state to DB-backed lifecycle helpers, persisted high-confidence `storedAt`, and made ended/expired sessions reject new observations. Final validation: `pnpm prisma:generate` PASS, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 32 warnings / 0 errors, `git diff --check` PASS, `pnpm exec vitest run` PASS with 206 files / 1817 tests passed and 16 files / 81 tests skipped, `pnpm build` PASS, `pnpm audit --audit-level=high --prod` PASS for high-severity gate with 3 moderate vulnerabilities reported.
- Report generation hardening slice: removed client-visible provider/parser/per-report failure details from enhanced report generation, PDF parsing, and bulk ZIP export failure responses while preserving server-side diagnostic logging. Final validation: `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 32 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `git diff --check` PASS.
- Upload/evidence-chain batch slice: kept each source file paired with its upload result through partial batch failures so EvidenceItem title, MIME type, evidence class override, size, hash, and storage paths cannot shift onto the wrong evidence record. Storage and DB failure responses now use generic per-file messages while detailed errors stay server-side. Regression coverage added for a failed first upload followed by a successful second upload. Final validation: `pnpm exec vitest run app/api/inspections/[id]/evidence/batch/__tests__/route.test.ts` PASS with 1 file / 1 test, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 32 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `git diff --check` PASS.
- Sketch import upload hardening slice: made JPEG/PNG magic bytes authoritative before Vision import, uses detected media type for the AI call instead of trusting the multipart MIME header, and removed client-visible API-key/provider detail from sketch-import failure responses. Regression coverage added for spoofed JPEG metadata carrying non-image/PDF bytes. Final validation: `pnpm exec vitest run app/api/inspections/[id]/sketches/import-from-image/__tests__/route.test.ts` PASS with 1 file / 1 test, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 32 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `git diff --check` PASS.
- Sketch import rate-limit consolidation slice: removed the route-local module `Map` limiter and moved Vision import throttling onto the shared `applyRateLimit` helper with the authenticated `session.user.id` key, 5 calls, and a 15-minute window. Regression coverage added for the shared 429 path before multipart parsing/Vision invocation. Final validation: `pnpm exec vitest run app/api/inspections/[id]/sketches/import-from-image/__tests__/route.test.ts` PASS with 1 file / 2 tests, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 32 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `git diff --check` PASS.
- Auth/RBAC tenancy helper slice: `assertReportTenancy` and `assertInspectionTenancy` now revalidate admin bypass against the current DB user role instead of trusting a stale JWT `session.user.role`; demoted admins fall back to normal owner/workspace tenancy. Regression coverage added for stale admin JWT report and inspection access denial. Final validation: `pnpm exec vitest run lib/auth/__tests__/assert-tenancy.test.ts` PASS with 1 file / 17 tests, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 32 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `git diff --check` PASS.
- Admin DB-role revalidation sweep verification: current audit reports 0 `admin-db-role-revalidation` errors, and `grep -R "verifyAdminFromDb(" -L app/api/admin --include='route.ts'` returns no admin route files. All current `app/api/admin/**/route.ts` files call `verifyAdminFromDb`.
- API audit integration/pilot slice: added deterministic ordering, explicit `take` caps, and narrower selects to user-scoped integration metrics/health reads and pilot readiness/observation admin reads. Pilot readiness and observation listing now use `verifyAdminFromDb` instead of trusting stale JWT role claims. Advisory audit warnings reduced from 32 to 28. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 28 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `git diff --check` PASS.
- API audit estimate line-item bounds slice: added a 500-line-item request cap to estimate create/update and bounded the existing estimate line-item diff query with deterministic ordering plus a fail-closed legacy over-cap check, preserving full diff semantics instead of truncating deletes/updates. Advisory audit warnings reduced from 28 to 27. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 27 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `git diff --check` PASS.
- API audit DR-NRPG webhook lookup slice: bounded the active DR-NRPG integration scan used for HMAC matching, added deterministic ordering, and narrowed the selected fields to `id` plus `webhookSecret`. Advisory audit warnings reduced from 27 to 26. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 26 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `git diff --check` PASS.
- API audit cron integration bounds slice: bounded invoice-sync and Xero payment reconciliation integration scans to 100 deterministic records per cron run, and made the invoice-sync per-integration invoice batch oldest-updated-first with an explicit 50-invoice constant. Advisory audit warnings reduced from 26 to 24. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 24 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `git diff --check` PASS.
- API audit invoice sequence repair slice: replaced two P2002 invoice-sequence repair scans with deterministic single-record latest invoice lookups in manual invoice creation and inspection invoice generation. Advisory audit warnings reduced from 24 to 22. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 22 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 839 warnings, `git diff --check` PASS.
- API audit invoice analytics aggregate slice: replaced unbounded invoice hydration in analytics totals/status counts with Prisma aggregate and groupBy queries while preserving total revenue, outstanding, draft, paid-this-month, overdue, and status-count semantics. Advisory audit warnings reduced from 22 to 21. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 21 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- API audit admin usage aggregate slice: replaced month-wide usage event hydration with exact aggregate/groupBy queries and one bounded user metadata lookup, preserving MTD totals, billing counts, event-type summaries, user summaries, and daily cost breakdown. Advisory audit warnings reduced from 21 to 20. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 20 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- API audit Ascora imported-job lookup slice: bounded the imported Ascora job foreign-key lookup to the size of the imported job ID set and added deterministic ordering. Advisory audit warnings reduced from 20 to 19. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 7 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 19 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- API audit test-helper classification slice: removed `app/api/test/**` from the public/token exception bucket and only accepts test helper routes when the source contains the hard `ALLOW_TEST_HELPERS !== "true"` guard. Added regression coverage so unguarded test helpers still require auth. Advisory audit warnings reduced from 19 to 15. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 8 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 15 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- API audit missing-elements bounds slice: bounded the claims missing-elements summary hydration to 5,000 deterministic rows, narrowed selected fields, added exact total count and exact billable total aggregates, and returned truncation metadata when detail rows are capped. Advisory audit warnings reduced from 15 to 14, leaving only public/token route review warnings. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 8 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Portal token hardening slice: added per-IP rate limiting to the public portal JSON and PDF token endpoints, bounded affected-area/scope/moisture relation reads with deterministic ordering, and kept exact public summary counts/totals through aggregate/count queries plus truncation/omission metadata. Advisory audit remains 442 routes / 14 warnings / 0 errors because these routes are still public token endpoints pending exception review. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 8 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Invitation token hardening slice: added per-IP rate limiting to team invite preview/accept and portal invitation verify/accept public token endpoints while preserving existing CSRF, token expiry, status, and password/headshot validation. Advisory audit remains 442 routes / 14 warnings / 0 errors because these routes are still public token endpoints pending exception review. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 8 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Public directory/static endpoint hardening slice: clamped contractor directory pagination to a minimum page/limit and added per-IP rate limiting to public IICRC checklist metadata and property scraper health probes. Advisory audit remains 442 routes / 14 warnings / 0 errors because these routes are still public endpoints pending exception review. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts app/api/properties/scrape/health/__tests__/route.test.ts` PASS with 2 files / 12 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- OAuth callback hardening slice: added per-IP rate limiting to integration OAuth and Google Drive setup OAuth callback endpoints, preserving existing one-shot state validation and PKCE flow; the generic integration callback now redirects with a generic token-exchange failure instead of reflecting provider exception text. Advisory audit remains 442 routes / 14 warnings / 0 errors because these callbacks are still public endpoints pending exception review. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 8 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Authority signing token hardening slice: restricted public signing links to UUID-shaped tokens before database lookup, capped sibling signature metadata returned with the signing page, narrowed the POST token lookup select, and uses the shared client-IP helper for signature audit metadata. Advisory audit remains 442 routes / 14 warnings / 0 errors because the signing route is still a public token endpoint pending exception review. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 8 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Client-error sink hardening slice: added a 32 KiB request body limit to the public client-error endpoint, bounded each logged client-provided string field to 2,000 characters, and removed arbitrary `...body` spreading from structured error logs so client payloads cannot inject unbounded fields into observability output. Advisory audit remains 442 routes / 14 warnings / 0 errors because the endpoint is still a public observability sink pending exception review. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 8 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Client-error byte-count slice: the public client-error endpoint now measures actual request body bytes before JSON parsing, so chunked requests without `content-length` cannot bypass the 32 KiB cap. It also rejects non-object JSON payloads. Advisory audit remains 442 routes / 14 warnings / 0 errors because the endpoint is still a public observability sink pending exception review. Final validation: `pnpm exec vitest run app/api/observability/client-error/__tests__/route.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 2 files / 12 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Invoice sync response-leak slice: unsupported invoice sync providers now return a 400 before reaching the sync switch, and failed external accounting syncs return/store a generic client-facing message instead of echoing provider exception text or raw provider response data in the 500 JSON body. Raw provider messages remain limited to server logs and internal audit metadata. Final validation: `pnpm exec vitest run lib/integrations/__tests__/sync-error.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 2 files / 10 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Integration import response-leak slice: external client/job import per-record failures now return a stable `"Import failed"` value instead of echoing Prisma/provider exception text in the JSON response, while preserving raw errors in server logs. Final validation: `pnpm exec vitest run lib/integrations/__tests__/sync-error.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 2 files / 11 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Admin AI maintenance response-leak slice: admin evaluation and prompt-optimization routes now return stable 503/500 error bodies instead of echoing provider configuration or optimizer exception text, while preserving raw diagnostics in server logs. Final validation: `pnpm exec vitest run app/api/admin/evaluation/__tests__/route.test.ts app/api/admin/optimize-prompts/__tests__/route.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 3 files / 12 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Contents manifest response-leak slice: contents manifest generation now returns a stable generic 500 body instead of echoing BYOK/provider exception text, while preserving raw diagnostics in server logs. Final validation: `pnpm exec vitest run app/api/inspections/contents-manifest/__tests__/route.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 2 files / 9 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Admin maintenance batch response-leak slice: manual cron trigger failures and per-job admin vectorise failures now return stable generic error text instead of echoing fetch/provider/embedding exception details, while preserving raw diagnostics in server logs. Final validation: `pnpm exec vitest run app/api/admin/cron-jobs/__tests__/route.test.ts app/api/admin/vectorise/__tests__/route.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 3 files / 10 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Native token exchange response-leak slice: iOS native auth token verification, user creation, and session JWT encode failures now return stable generic error messages and keep raw verification/Prisma/JWT exception text out of response bodies and failed-auth audit details. Final validation: `pnpm exec vitest run app/api/auth/native-token-exchange/__tests__/route.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 2 files / 11 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- BYOK vision response-leak slice: image analysis provider-configuration failures now return a stable 402 body instead of echoing API-key/provider exception text, while preserving raw diagnostics in server logs. Final validation: `pnpm exec vitest run app/api/ai/vision/__tests__/route.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 2 files / 9 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Google refresh response-leak slice: Google OAuth token refresh failures now return stable `fetch-failed`, `upstream-{status}`, or `invalid_grant` reason codes instead of echoing fetch exception text or upstream response bodies. Invalid refresh tokens still clear stored token fields so the UI can prompt re-consent. Final validation: `pnpm exec vitest run app/api/integrations/google/refresh/__tests__/route.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 2 files / 11 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Public route exception review slice: created `API_PUBLIC_ROUTE_EXCEPTION_REVIEW_REPORT.md` covering all 14 remaining `public-token-route-review` warnings, grouped by category with route-specific purpose, current safeguards, and the owner decision still required. No scanner suppression was added; warnings intentionally remain visible until product/security sign-off approves an exception registry or route-specific auth changes. Final validation: `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 8 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Public invite hardening slice: added shared public token-shape helpers, applied 24-byte hex prechecks to team invite preview/accept, applied Prisma cuid prechecks to portal invitation verify/accept, and added CSRF origin validation to portal invitation accept. The 14 `public-token-route-review` warnings remain intentionally visible until product/security sign-off. Final validation: `pnpm exec vitest run lib/__tests__/public-token-shape.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 2 files / 12 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Shared image upload validator slice: extracted JPEG/PNG/GIF/WebP magic-byte detection and per-route image upload policy into `lib/media/validate-image-upload.ts`, reused it in canonical image upload and Vision sketch import while preserving each route's allowlist and error responses, and added validator coverage for spoofed bytes, `image/jpg` aliasing, allowlist enforcement, and size caps. Final validation: `pnpm exec vitest run lib/media/__tests__/validate-image-upload.test.ts app/api/inspections/[id]/sketches/import-from-image/__tests__/route.test.ts` PASS with 2 files / 7 tests, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 8 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Durable idempotency slice: added Prisma `IdempotencyRecord` plus migration `20260525050000_durable_idempotency_records`, moved `withIdempotency` from process-local `Map` state to DB-backed pending/complete records, preserved same-key replay, different-body conflict, concurrent pending, 5xx retry, 4xx cache, scope isolation, and handler-throw cleanup behavior. Final validation: `pnpm prisma:generate` PASS, `pnpm exec vitest run lib/__tests__/idempotency.test.ts` PASS with 1 file / 15 tests, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 8 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS, `pnpm exec vitest run` PASS with 209 files / 1829 tests passed and 16 files / 81 tests skipped, `pnpm build` PASS, `pnpm audit --audit-level=high --prod` PASS for high-severity gate with 3 moderate vulnerabilities reported.
- Multipart photo replay idempotency slice: inspection photo upload now validates `Idempotency-Key`, fingerprints multipart replay using inspection ID, filename, MIME type, size, SHA-256 file hash, and sorted non-file fields, then wraps storage upload, photo creation, audit logging, mirror enqueue, and EXIF extraction in durable idempotency. Duplicate mobile evidence retries with the same key/fingerprint replay the cached 201 response without uploading or creating another photo. Final validation: `pnpm exec vitest run lib/__tests__/idempotency.test.ts app/api/inspections/[id]/photos/__tests__/cocoa.test.ts` PASS with 2 files / 20 tests, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 8 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS, `pnpm exec vitest run` PASS with 209 files / 1830 tests passed and 16 files / 81 tests skipped, `pnpm build` PASS, `pnpm audit --audit-level=high --prod` PASS for high-severity gate with 3 moderate vulnerabilities reported.
- Durable shared route rate-limit slice: added Prisma `RateLimitHit` plus migration `20260525060000_durable_rate_limit_hits`, moved `applyRateLimit` from process-local `Map` enforcement to DB-backed sliding-window hits, preserved the synchronous `rateLimit` helper for compatibility, and kept explicit fail-closed behavior for AI routes that pass `failClosedOnUpstashError`. Store-unavailable non-fail-closed callers fall back to the existing in-memory limiter for availability. Final validation: `pnpm prisma:generate` PASS, `pnpm exec vitest run lib/__tests__/rate-limiter.test.ts` PASS with 1 file / 3 tests, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts lib/__tests__/rate-limiter.test.ts` PASS with 2 files / 11 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS, `pnpm exec vitest run` PASS with 210 files / 1833 tests passed and 16 files / 81 tests skipped, `pnpm build` PASS, `pnpm audit --audit-level=high --prod` PASS for high-severity gate with 3 moderate vulnerabilities reported.
- Client mutation/capture-event model slice: added Prisma `ClientMutation` and `FieldCaptureEvent` plus additive migration `20260525070000_client_mutation_capture_events`. The model spine includes the required unique `workspaceId + mutationId` constraint, workspace/user/inspection relations, response replay metadata, and append-only capture-event rows without an update timestamp. Final validation: `pnpm prisma:generate` PASS, `DIRECT_URL=postgresql://user:pass@localhost:5432/restoreassist DATABASE_URL=postgresql://user:pass@localhost:5432/restoreassist pnpm exec prisma validate` PASS with the existing referential-action warning, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 8 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS, `pnpm exec vitest run` PASS with 210 files / 1833 tests passed and 16 files / 81 tests skipped, `pnpm build` PASS, `pnpm audit --audit-level=high --prod` PASS for high-severity gate with 3 moderate vulnerabilities reported.
- Client mutation evidence write-path slice: `withIdempotency` now validates optional `X-RestoreAssist-Mutation-Id` headers, creates a workspace-scoped `ClientMutation` row for configured routes, completes/rejects/fails the ledger alongside the idempotency cache, and the inspection evidence creation route now passes workspace/user/inspection metadata after tenancy validation. Regression coverage proves evidence creation records and completes the mobile mutation ledger. Final validation: `pnpm exec vitest run lib/__tests__/idempotency.test.ts app/api/inspections/[id]/evidence/__tests__/route.test.ts` PASS with 2 files / 20 tests, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts lib/__tests__/idempotency.test.ts app/api/inspections/[id]/evidence/__tests__/route.test.ts` PASS with 3 files / 28 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS, `pnpm exec vitest run` PASS with 211 files / 1838 tests passed and 16 files / 81 tests skipped, `pnpm build` PASS, `pnpm audit --audit-level=high --prod` PASS for high-severity gate with 3 moderate vulnerabilities reported.
- Mobile queue mutation ledger slice: `environmental-data`, `moisture-reading`, and `affected-area` inspection routes now perform the existing owner inspection check before idempotency and pass workspace/user/inspection mutation metadata into `withIdempotency`; mobile replays for these queue types now write and complete `ClientMutation` ledger rows when `X-RestoreAssist-Mutation-Id` is present. Final validation: `pnpm exec vitest run lib/__tests__/idempotency.test.ts` PASS with 1 file / 19 tests, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts lib/__tests__/idempotency.test.ts` PASS with 2 files / 27 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS, `pnpm exec vitest run` PASS with 211 files / 1838 tests passed and 16 files / 81 tests skipped, `pnpm build` PASS, `pnpm audit --audit-level=high --prod` PASS for high-severity gate with 3 moderate vulnerabilities reported.
- Mobile conflict fail-fast slice: mobile offline replay now treats non-retryable server rejections as terminal queue failures, while preserving retry behavior for `5xx` and `408`. A `409` conflict regression proves the row moves to `failed`, records the server error, and is not replayed again on the next drain. Final validation: `pnpm --dir mobile exec vitest run --config vitest.config.ts` PASS with 1 file / 4 tests, `pnpm --dir mobile --ignore-workspace type-check` PASS, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 8 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS, `pnpm exec vitest run` PASS with 211 files / 1838 tests passed and 16 files / 81 tests skipped, `pnpm build` PASS, `pnpm audit --audit-level=high --prod` PASS for high-severity gate with 3 moderate vulnerabilities reported.
- Mobile network reachability slice: added a dependency-free `/api/health` reachability monitor in the mobile root layout and covered URL construction, successful health response, failed health response, and network error behavior. Final validation: `pnpm --dir mobile exec vitest run --config vitest.config.ts` PASS with 2 files / 7 tests, `pnpm --dir mobile --ignore-workspace type-check` PASS, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 8 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS, `pnpm exec vitest run` PASS with 211 files / 1838 tests passed and 16 files / 81 tests skipped, `pnpm build` PASS, `pnpm audit --audit-level=high --prod` PASS for high-severity gate with 3 moderate vulnerabilities reported.
- Mobile device validation blocker slice: documented the remaining simulator/device-only checklist for MOB-001 in `MOBILE_DEVICE_VALIDATION_BLOCKER_REPORT.md`, including commands, airplane-mode/network-toggle checks, queued mutation replay checks, and rollback notes.
- Mobile device tooling recheck: updated `MOBILE_DEVICE_VALIDATION_BLOCKER_REPORT.md` with the local evidence that iOS `simctl`, Android `emulator` / `adb`, and Android SDK env paths are unavailable from this shell. No mobile code or package config was changed.
- SEC-002 local env audit warning cleanup slice: replaced the Ascora route header comments that named the process-wide Node TLS bypass with safer scoped-trust guidance. Final validation: `pnpm exec vitest run scripts/__tests__/audit-env.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 2 files / 12 tests, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Interview AI response-leak slice: interview validation and suggested follow-up routes now keep provider/gateway failure detail server-side and return stable generic error bodies for 500-class AI failures. Added route coverage for both paths to prevent raw provider detail from reappearing. Final validation: `pnpm exec vitest run app/api/interviews/[id]/validate/__tests__/route.test.ts app/api/interviews/[id]/suggest-next/__tests__/route.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 3 files / 10 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Vision/classification AI response-leak slice: vision meter-reading, inspection classification, and moisture-reading grouping routes now keep Anthropic/provider failure detail in server logs and return only stable reason codes to clients. The platform-key-missing branch in meter-reading extraction no longer returns the env var name as a client detail. Added focused route tests for all three paths. Final validation: `pnpm exec vitest run app/api/vision/extract-reading/__tests__/route.test.ts app/api/inspections/[id]/classify/__tests__/route.test.ts app/api/inspections/[id]/group-readings/__tests__/route.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 4 files / 12 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Photo/support AI response-leak slice: photo auto-classification and admin support-ticket draft routes now log provider detail server-side but return only stable reason codes to clients. Photo auto-classification also no longer returns the platform Anthropic env var name when the key is missing. Added focused route tests for both routes. Final validation: `pnpm exec vitest run app/api/ai/auto-classify-photo/[photoId]/__tests__/route.test.ts app/api/support/tickets/[id]/draft/__tests__/route.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 3 files / 11 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Report AI response-leak slice: report client-summary, report synopsis, and generated interview-question routes now keep provider/gateway detail in server logs and return stable client errors without `result.detail`. Added focused route tests for all three paths. Final validation: `pnpm exec vitest run app/api/reports/[id]/client-summary/__tests__/route.test.ts app/api/reports/[id]/synopsis/__tests__/route.test.ts app/api/reports/generate-question/__tests__/route.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 4 files / 11 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Technician-report AI response-leak slice: technician report analysis now logs provider/gateway detail server-side and returns the stable existing client error without `result.detail`. Added focused route coverage for the failure path. Final validation: `pnpm exec vitest run app/api/reports/analyze-technician-report/__tests__/route.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 2 files / 9 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Margot deep-research response-leak slice: Gemini/deep-research tool failures now preserve retryability from raw provider errors but return a stable generic tool error instead of embedding `err.message` in the streamed tool result. Added focused helper coverage for secret-bearing and retryable provider failures. Final validation: `pnpm exec vitest run lib/__tests__/margot-tool-errors.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 2 files / 10 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Margot Telegram response-leak slice: admin Telegram recent-message polling now preserves the operator-friendly missing-table reason while replacing other Supabase error messages with a stable `Telegram log unavailable` reason. Added focused route coverage for both cases. Final validation: `pnpm exec vitest run app/api/margot/telegram/recent/__tests__/route.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 2 files / 10 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- NIR form-data response-leak slice: report NIR-data form JSON parse/validation failures now return the stable 400 body `Invalid JSON in form data` instead of echoing native parser or validation exception text. Added focused route coverage proving malformed JSON does not expose parser details. Final validation: `pnpm exec vitest run app/api/reports/[id]/nir-data/__tests__/route.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 2 files / 9 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Margot image-generation response-leak slice: `image_generate` tool failures now return stable client-facing messages for missing configuration, upload failures, and provider exceptions instead of exposing env var names, Supabase storage details, or Gemini exception text. Retryability is still inferred from raw errors server-side. Added focused helper coverage for secret-bearing and retryable image-generation failures. Final validation: `pnpm exec vitest run lib/__tests__/margot-tool-errors.test.ts scripts/__tests__/audit-api-routes.test.ts` PASS with 2 files / 12 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `git diff --check` PASS.
- Broad validation repair slice: full `pnpm exec vitest run` initially exposed stale invite-acceptance route tests that still used the pre-hardening token fixture and a Prisma mock without the durable `RateLimitHit` delegate. Updated only `app/api/invites/[token]/__tests__/route-extended.test.ts` to use a 48-character lowercase-hex invite token and a minimal durable rate-limit mock. Final validation: focused invite test PASS with 1 file / 9 tests, `pnpm exec vitest run` PASS with 237 files passed / 16 skipped and 1887 tests passed / 81 skipped, `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts` PASS with 1 file / 8 tests, `pnpm exec tsx scripts/audit-api-routes.ts --json` PASS with 442 routes / 14 warnings / 0 errors, `pnpm exec tsx scripts/audit-env.ts --json` PASS with 0 errors / 0 warnings, `pnpm --dir mobile --ignore-workspace type-check` PASS, `pnpm --dir mobile exec vitest run --config vitest.config.ts` PASS with 2 files / 7 tests, `pnpm type-check` PASS, `pnpm lint` PASS with 0 errors and 838 warnings, `pnpm build` PASS, `pnpm audit --audit-level=high --prod` PASS for the high-severity gate with 3 moderate vulnerabilities reported, and `git diff --check` PASS.
- External live-state recheck slice: Vercel Production env listing from the linked temp checkout still does not include `NODE_TLS_REJECT_UNAUTHORIZED`; Supabase live security advisor recheck returned `No issues found`.

## Failing Or Blocked Checks

### API route audit inherited findings

Error: advisory API route scan reports 0 error-severity findings and 14 warning-severity findings.

Cause: error-severity auth/raw-SQL/500-leak findings have been remediated or classified as documented public exception candidates. Recent slices removed false positives, high-confidence unbounded reads, and env-guarded test helpers from the manual public-route review bucket. Authority signing, portal token, invitation token, OAuth callback, public directory, checklist, scraper-health, and client-error observability endpoints now have throttling, bounded reads, or bounded public payload handling where applicable, but the remaining warning-severity inherited debt is still limited to public exception reviews.

Fix: continue remediating warning groups in narrow commits, then run the scanner without `--strict` to verify count reduction. `--strict` can now be considered for error-severity findings only, but warnings still need manual review before ship.

Next action: use `API_PUBLIC_ROUTE_EXCEPTION_REVIEW_REPORT.md` to decide whether each remaining public route is approved as-is, needs bearer-token/session auth, or should be encoded in an approved exception registry.

## Unresolved Risks

- MOB-001 is only partially covered. The client queue exists, JSON mutation replay through `withIdempotency` is backed by durable database idempotency, multipart evidence-photo replay dedupe is backed by durable fingerprint-based idempotency, the `ClientMutation`/`FieldCaptureEvent` model spine now exists, inspection evidence/environmental-data/moisture-reading/affected-area JSON mutations write the `ClientMutation` ledger, mobile conflict responses now fail fast instead of retrying known-impossible writes, and the mobile root layout now updates online/offline state from API reachability. Device/emulator integration coverage remains open.
- Local device/emulator tooling is not available in this shell: iOS `simctl`, Android `emulator` / `adb`, and Android SDK env paths are missing. The remaining mobile validation step must run on a configured simulator or physical device session.
- Shared `applyRateLimit` route throttling is now backed by Prisma `RateLimitHit` records for serverless multi-instance safety. The low-level synchronous `rateLimit` helper and DB-unavailable fallback path still use in-memory state for compatibility/availability.
- Mobile validation is now repeatable as a standalone Expo package path, but mobile is intentionally not part of root workspace validation yet.
- API route audit is advisory only. It has identified inherited route-hardening debt and these slices reduced warnings from 76 to 14, but remaining public/token route warnings still need review.
- Protected `.github/PULL_REQUEST_TEMPLATE.md` case-collision dirtiness remains visible and must not be staged with Phase 1 work.

## Rollback Notes

- `mobile/pnpm-lock.yaml` can be reverted to return mobile dependency ownership to the previous undocumented state.
- Reverting the `mobile/tsconfig.json` and `mobile/lib/api/byok-vision-client.ts` changes reintroduces the TypeScript 5.3 config error and root-server type dependency that blocked standalone mobile type-check.

## Next Safe Action

Resolve the external/manual blockers now preventing a ship-ready Phase 1 claim: product/security sign-off for the documented public API route exceptions and mobile simulator/device validation. Keep using `/private/tmp/RestoreAssist-phase1-main` only, and do not stage `.github/PULL_REQUEST_TEMPLATE.md`.
