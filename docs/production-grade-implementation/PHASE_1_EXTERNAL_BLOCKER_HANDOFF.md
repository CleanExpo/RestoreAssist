# Phase 1 External Blocker Handoff

Date: 2026-05-25

Worktree: `/private/tmp/RestoreAssist-phase1-main`

Branch: `codex/phase-1-production-readiness-clean`

## Status

Phase 1 local remediation is complete for the currently safe scope, but RestoreAssist is not ship-ready because two external/manual blockers remain.

Do not start `/shipit` until both blockers below are resolved and the full validation gate is rerun from this worktree.

## Current Evidence

- API route audit: `pnpm exec tsx scripts/audit-api-routes.ts --json` scans 442 routes with 0 errors and 14 warnings.
- Remaining API warnings are all `public-token-route-review` and are documented in `API_PUBLIC_ROUTE_EXCEPTION_REVIEW_REPORT.md`.
- Forbidden env audit: `pnpm exec tsx scripts/audit-env.ts --json` reports 0 findings.
- Vercel Production env listing no longer includes `NODE_TLS_REJECT_UNAUTHORIZED`.
- Supabase live security advisor recheck returned `No issues found`.
- Mobile package validation is green with `pnpm --dir mobile --ignore-workspace type-check` and `pnpm --dir mobile exec vitest run --config vitest.config.ts`.
- Full root validation is green as of the latest broad pass: `pnpm exec vitest run`, `pnpm type-check`, `pnpm lint`, `pnpm build`, `pnpm audit --audit-level=high --prod`, and `git diff --check`.

## Blocker 1: Public Route Exception Sign-Off

Error: the advisory API scanner still reports 14 warning-severity `public-token-route-review` findings.

Cause: these routes are unauthenticated by product/platform design, but treating them as ship-safe requires owner acceptance of each exposure model.

Fix: product/security owners must decide one outcome for each route in `API_PUBLIC_ROUTE_EXCEPTION_REVIEW_REPORT.md`:

1. approve the route as an intentional public exception,
2. require bearer-token/session auth or a tighter scoped access mechanism, or
3. remove/disable the feature path.

Acceptance evidence:

- A reviewed approval record names every approved public route.
- Any route requiring auth changes is patched, tested, and reflected in the API audit.
- If exceptions are approved, the approval is encoded in a reviewed exception registry or equivalent signed release artifact.
- `pnpm exec tsx scripts/audit-api-routes.ts --json` is rerun and the remaining warning state is explicitly accepted or reduced.

## Blocker 2: Mobile Device/Emulator Validation

Error: mobile network-toggle/device validation has not been run.

Cause: this shell does not have usable simulator/device tooling. `xcrun simctl list devices available` fails because `simctl` is unavailable, `emulator` and `adb` are not on `PATH`, and no Android SDK path is visible through `ANDROID_HOME` / `ANDROID_SDK_ROOT`.

Fix: run `MOBILE_DEVICE_VALIDATION_BLOCKER_REPORT.md` on a configured iOS simulator, Android emulator, Expo Go session, or physical device pointed at the intended API environment.

Acceptance evidence:

- Screenshot/log showing Settings `Network Status` is `Online` while `/api/health` is reachable.
- Screenshot/log showing offline banner and `Offline` state after airplane-mode/network toggle.
- Evidence that environmental data, moisture reading, and affected-area mutations queue while offline.
- Evidence that queued mutations drain after reconnect without duplicate server rows.
- Evidence that a `409` conflict moves to failed state without repeated replay attempts.

## Next Safe Action

Resolve blocker 1 through product/security route decisions, then resolve blocker 2 on a configured simulator or device. After both are resolved, rerun:

```bash
pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts
pnpm exec tsx scripts/audit-api-routes.ts --json
pnpm exec tsx scripts/audit-env.ts --json
pnpm --dir mobile --ignore-workspace type-check
pnpm --dir mobile exec vitest run --config vitest.config.ts
pnpm type-check
pnpm lint
pnpm exec vitest run
pnpm build
pnpm audit --audit-level=high --prod
git diff --check
```

Do not stage `.github/PULL_REQUEST_TEMPLATE.md`.
