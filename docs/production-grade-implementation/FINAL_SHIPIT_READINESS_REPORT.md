# Final ShipIt Readiness Report

Date: 2026-05-25

Worktree: `/private/tmp/RestoreAssist-phase1-main`

Branch: `codex/phase-1-production-readiness-clean`

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

## Supabase RLS Status

Status: currently green from latest live evidence; final release-day live revalidation is still required before ship.

Recorded live evidence:

- original RA-4970 RLS closeout existed in the safe branch.
- live revalidation found one drift table, `XeroSyncStatus`.
- `supabase/migrations/20260525061000_enable_rls_xero_sync_status.sql` was added and applied.
- final aggregate recheck returned `rls_off=0`, `rls_on=198`, `anon_select_policies=12`.
- Supabase security advisor recheck returned `No issues found`.

Remaining live revalidation requirement:

- rerun Supabase security advisor before ship:

```bash
supabase db advisors --linked --workdir /private/tmp/ra-supabase-rls-check --type security --level error --fail-on none --output json
```

- if credentialed DB query access is available, rerun the public-table RLS aggregate and require `rls_off=0`.

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

Status: open blocker.

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

## Public Route Exception Sign-Off Requirement

Status: open blocker.

All 14 remaining API audit warnings are `public-token-route-review`. They are not audit errors, but they are unauthenticated/public surfaces that require owner decisions before a full ship claim.

Required evidence:

- each route in `PHASE_1_MANUAL_SIGNOFF_CHECKLIST.md` has a named sign-off owner.
- each route has a decision: approve, fix, restrict, rate-limit, or document exception.
- accepted exceptions are recorded in a reviewed approval artifact or exception registry.
- required fixes/restrictions are implemented and validated.
- API audit is rerun after decisions and any code/config changes.

Current decision impact: full production ship is blocked until this sign-off is complete.

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

