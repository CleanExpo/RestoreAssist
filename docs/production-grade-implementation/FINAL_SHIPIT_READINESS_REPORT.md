# Final ShipIt Readiness Report

Date: 2026-05-25

Worktree: `/private/tmp/RestoreAssist-phase1-main`

Branch: `codex/phase-1-production-readiness-clean`

Current Phase 2 review branch: `codex/phase-2-ai-workflow-upgrades`

## Executive Decision

RestoreAssist is **NOT currently approved for full production ship**.

Recommended current decision: **DO NOT SHIP** until the Phase 1 manual sign-off items are complete, evidenced, and followed by the final validation gate.

This report does not start `/shipit`. It records the current blocked ship-readiness state.

## Source Reports Read

- `docs/production-grade-implementation/PHASE_1_MANUAL_SIGNOFF_CHECKLIST.md`
- `docs/production-grade-implementation/PHASE_1_COMPLETION_REPORT.md`
- `docs/production-grade-implementation/PHASE_1_PROGRESS_LOG.md`
- `docs/production-grade-implementation/PHASE_1_EXTERNAL_BLOCKER_HANDOFF.md`
- `docs/production-grade-implementation/VERCEL_TLS_ENV_VERIFICATION_REPORT.md`
- `docs/production-grade-implementation/RA-4970_RLS_VALIDATION_REPORT.md`
- `docs/production-grade-implementation/MOBILE_VALIDATION_PATH_REPORT.md`
- `docs/production-grade-implementation/STAGE_2_EXTERNAL_BLOCKER_CLOSURE_PLAN.md`
- `docs/production-grade-implementation/STAGE_2_BLOCKER_CLOSURE_REPORT.md`

## Root Validation Status

Status: conditionally green from the latest recorded broad Phase 1 validation, not sufficient for ship approval by itself.

Latest recorded broad root validation:

- `pnpm exec vitest run`: PASS, 237 files passed / 16 skipped and 1887 tests passed / 81 skipped.
- `pnpm type-check`: PASS.
- `pnpm lint`: PASS with 0 errors and 838 warnings.
- `pnpm build`: PASS.
- `pnpm audit --audit-level=high --prod`: PASS for the high-severity gate, with 3 moderate vulnerabilities reported.
- `git diff --check`: PASS.

Required before ship:

- rerun the full validation gate after public-route decisions and mobile device validation are complete.
- treat any new validation failure as a `DO NOT SHIP` result until fixed or explicitly accepted by release ownership.

## Stage 2 External Blocker Closure Status

Status: some external blockers are now verified or assigned, but RestoreAssist is still not approved for ship.

Stage 2 results:

- Vercel TLS: current live env-name verification confirms `NODE_TLS_REJECT_UNAUTHORIZED` is absent from Production, Preview, and Development; `https://restoreassist.app` returned `HTTP/2 200`.
- Supabase RLS: current live security advisor returned `No issues found`; current public-table aggregate returned `rls_off=0`, `rls_on=198`.
- Supabase anon-policy listing: still assigned as release-day/manual revalidation because a follow-up live policy-list query hit a Supabase temp-role auth circuit breaker.
- Public routes: all 14 warnings remain visible and assigned to product/security owner decisions; no warnings were hidden or suppressed.
- Mobile offline: still assigned as manual simulator/device evidence because this shell lacks `simctl`, `emulator`, `adb`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT`.
- Protected PR template artifact: remains dirty and must still be handled outside this branch.

Current decision impact: Stage 2 improves evidence and assignment clarity, but does not change the recommended current decision: **DO NOT SHIP**.

## Mobile Validation Status

Status: local package validation is green; real simulator/device validation remains incomplete.

Validated standalone mobile path:

- `pnpm --dir mobile install --ignore-workspace`: PASS after network access.
- `pnpm --dir mobile --ignore-workspace type-check`: PASS.
- `cd mobile && pnpm exec vitest run --config vitest.config.ts`: PASS, 2 files / 7 tests.

Open ship-readiness requirement:

- execute `PHASE_1_MANUAL_SIGNOFF_CHECKLIST.md` section 2 on a configured iOS simulator, Android emulator, Expo Go session, or physical device.
- capture evidence for clean launch, offline job/record creation, offline photo/document evidence, interrupted sync, stale processing recovery, online queue replay, server state, local refresh, and duplicate replay safety.

Current decision impact: mobile is not fully ship-validated until the simulator/device evidence exists.

## API Audit Status

Status: audit has 0 errors, but ship approval is blocked by 14 public-route warnings pending product/security sign-off.

Current API audit state:

- routes scanned: 442
- errors: 0
- warnings: 14
- warning category: `public-token-route-review`

The 14 remaining warnings are documented in `PHASE_1_MANUAL_SIGNOFF_CHECKLIST.md` and `API_PUBLIC_ROUTE_EXCEPTION_REVIEW_REPORT.md`.

Required before full ship:

- each public route warning must be approved, fixed, restricted, rate-limited, or documented as an accepted exception.
- every row must have a sign-off owner, recorded decision, and evidence.
- rerun `pnpm exec tsx scripts/audit-api-routes.ts --json` after decisions and any route changes.

## Env Audit Status

Status: green from latest recorded evidence.

Current env audit state:

- `pnpm exec tsx scripts/audit-env.ts --json`: 0 findings, 0 errors, 0 warnings.

Required before ship:

- rerun `pnpm exec tsx scripts/audit-env.ts --json` on release day.
- confirm no executable/deploy config sets `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- confirm no public service-role env names are present.

## Phase 2 AI Guardrail Status

Status: review-ready for Phase 2 guardrail scope, not ship approval.

Current Phase 2 evidence:

- AI audit command exists: `pnpm audit:ai`.
- PR workflow runs `pnpm audit:ai` after lint and before unit tests.
- AI audit baseline: 88 surfaces / 0 unknown task classes / 5 policy-wrapped surfaces / 66 sensitive external-provider surfaces.
- policy-wrapped surfaces:
  - `lib/services/ai/draft-support-ticket.ts`
  - `lib/services/ai/analyse-support-ticket.ts`
  - `lib/services/ai/generate-interview-question.ts`
  - `lib/services/ai/validate-interview-response.ts`
  - `lib/services/ai/suggest-next-interview-question.ts`
- pure usage metadata helper exists and is tested.

Phase 2 deliberately did not change:

- providers.
- model selection.
- prompts.
- output shapes.
- public-route behavior.
- DB writes.
- provider calls.
- runtime model routing.
- final report generation.
- customer-facing report generation.
- OCR/image workflows.
- RAG/IICRC standards retrieval.
- voice/realtime flows.

Current decision impact: Phase 2 improves reviewability and AI guardrail visibility, but does not remove Phase 1 ship blockers and does not approve production release.

## Supabase RLS Status

Status: currently green for live advisor and table-state evidence; final release-day live revalidation is still required before ship.

Recorded live evidence:

- original RA-4970 RLS closeout existed in the safe branch.
- live revalidation found one drift table, `XeroSyncStatus`.
- `supabase/migrations/20260525061000_enable_rls_xero_sync_status.sql` was added and applied.
- final aggregate recheck returned `rls_off=0`, `rls_on=198`, `anon_select_policies=12`.
- Supabase security advisor recheck returned `No issues found`.
- Stage 2 recheck returned `No issues found`.
- Stage 2 public-table aggregate returned `rls_off=0`, `rls_on=198`.

Remaining live revalidation requirement:

- rerun Supabase security advisor before ship:

```bash
supabase db advisors --linked --workdir /private/tmp/ra-supabase-rls-check --type security --level error --fail-on none --output json
```

- if credentialed DB query access is available, rerun the public-table RLS aggregate and require `rls_off=0`.
- rerun anon-policy listing after the Supabase temp-role auth breaker clears or with approved `SUPABASE_DB_PASSWORD` handling, and confirm anon policies are still limited to the documented public-reference policy set.

Current decision impact: Supabase RLS is not the active blocker, but ship approval still requires final live revalidation evidence.

Rollback notes:

- do not blanket-disable RLS.
- roll forward with corrected policies or table-specific RLS enablement if drift recurs.

## Vercel TLS Status

Status: currently green from latest project env and production runtime evidence; release-day production env decision remains required.

Recorded evidence:

- repo source/config does not execute or document a live TLS bypass.
- `NODE_TLS_REJECT_UNAUTHORIZED` was removed from Vercel Production.
- post-removal Vercel env listings showed `NODE_TLS_REJECT_UNAUTHORIZED` absent from Production, Preview, and Development.
- production was redeployed after removal.
- `https://restoreassist.app` returned `HTTP/2 200`.
- Stage 2 env-name verification confirmed `NODE_TLS_REJECT_UNAUTHORIZED` absent from Production, Preview, and Development.
- Stage 2 production HTTPS check returned `HTTP/2 200`.

Required production env decision:

- confirm `NODE_TLS_REJECT_UNAUTHORIZED` remains absent from Production, Preview, and Development.
- explicitly decide not to re-add process-wide TLS bypass.
- if Ascora or another integration fails TLS verification, roll forward with scoped trust for that integration or temporarily disable the affected integration path.

Final verification commands:

```bash
vercel env ls production --scope unite-group
vercel env ls preview --scope unite-group
vercel env ls development --scope unite-group
curl -I https://restoreassist.app
```

Current decision impact: Vercel TLS is not the active blocker, but ship approval still requires final release-day verification and owner acceptance of the no-global-bypass decision.

Rollback notes:

- do not re-add `NODE_TLS_REJECT_UNAUTHORIZED`.
- use scoped trust, upstream certificate repair, or temporary feature disablement if an integration fails.

## Mobile Offline Simulator/Device Requirement

Status: open blocker assigned to manual simulator/device validation.

Local test coverage proves the queue and replay invariants in unit/integration scope, but it does not prove real mobile network behavior.

Required evidence:

- clean app launch on target device/simulator.
- online status while `/api/health` is reachable.
- offline banner/status after network toggle.
- offline job/record creation.
- offline photo/document evidence capture or explicit unsupported-path evidence for document capture.
- interrupted sync state.
- stale processing recovery after restart/backgrounding.
- replay when online.
- server state showing exactly one record/evidence item per intended mutation.
- local app refresh showing server-confirmed state.
- duplicate replay does not corrupt data or create duplicate rows.

Current decision impact: full production ship is blocked until this evidence is attached or a business owner explicitly accepts shipping with this external blocker.

Stage 2 tooling result:

- `xcrun simctl list devices available` failed because `simctl` is unavailable.
- `emulator` and `adb` are not on `PATH`.
- `ANDROID_HOME` and `ANDROID_SDK_ROOT` are empty.

## Public Route Exception Sign-Off Requirement

Status: open blocker assigned to product/security decisions.

All 14 remaining API audit warnings are `public-token-route-review`. They are not audit errors, but they are unauthenticated/public surfaces that require owner decisions before a full ship claim.

Required evidence:

- each route in `PHASE_1_MANUAL_SIGNOFF_CHECKLIST.md` has a named sign-off owner.
- each route has a decision: approve, fix, restrict, rate-limit, or document exception.
- accepted exceptions are recorded in a reviewed approval artifact or exception registry.
- required fixes/restrictions are implemented and validated.
- API audit is rerun after decisions and any code/config changes.

Current decision impact: full production ship is blocked until this sign-off is complete.

Stage 2 classification result:

- 10 routes are classified as intentional public-route candidates pending owner approval.
- 4 routes require explicit product/security or operations/security decision because their public exposure policy may need stronger auth, bearer-token monitoring auth, or tighter exception documentation.
- no public-route behavior was changed in Stage 2 because the remaining warnings are acceptance decisions, not obvious code-only defects.

## Protected PR Template Artifact

Status: protected case-collision artifact remains dirty and must not be touched by Phase 1 work.

Current known status:

- `.github/PULL_REQUEST_TEMPLATE.md` appears as a modified path in `git status`.
- It is treated as a protected PR template case-collision artifact.
- It must not be staged, committed, reverted, cleaned, or edited as part of Phase 1 ship-readiness work.

Current decision impact: this artifact is not a Phase 1 application-readiness blocker by itself, but it is a release-process hazard if accidentally staged.

## Final Ship Decision Options

### 1. SHIP

Use only if all of the following are true:

- all public-route exception rows are approved, fixed, restricted, rate-limited, or documented with accepted exceptions.
- mobile offline simulator/device validation evidence is complete.
- Vercel TLS release-day verification passes.
- Supabase RLS release-day live revalidation passes.
- env audit release-day verification passes.
- full root and mobile validation gates pass after all sign-off decisions.
- protected `.github/PULL_REQUEST_TEMPLATE.md` remains unstaged.

Current status: **not available**.

### 2. SHIP WITH KNOWN EXTERNAL BLOCKERS

Use only if all of the following are true:

- a business owner explicitly accepts the unresolved public-route and/or mobile-device risk.
- the unresolved blocker list is attached to the release record.
- rollback owner and monitoring owner are named.
- `/shipit` is not represented as fully green.
- final validation is rerun and any failures are accepted in writing by release ownership.

Current status: **not recommended**.

### 3. DO NOT SHIP

Use if any of the following are true:

- any public-route decision remains pending.
- mobile offline simulator/device validation evidence is missing.
- Vercel TLS final verification fails or the production env decision is unresolved.
- Supabase RLS final live revalidation fails or cannot be completed.
- env audit final verification fails.
- full validation gate fails.
- protected PR template artifact is accidentally staged.

Current status: **recommended current decision**.

## Recommended Current Decision

**DO NOT SHIP** until the manual sign-off items are complete.

Immediate next actions:

1. Complete public-route product/security sign-off for the 14 remaining warnings.
2. Complete mobile offline simulator/device validation and attach evidence.
3. Rerun Vercel TLS, Supabase RLS, and env audit release-day checks.
4. Rerun the full validation gate from `PHASE_1_EXTERNAL_BLOCKER_HANDOFF.md`.
5. Confirm `.github/PULL_REQUEST_TEMPLATE.md` remains unstaged.
