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

## Files Changed

- `mobile/lib/sync/__tests__/engine.test.ts`
- `mobile/test/expo-sqlite-mock.ts`
- `mobile/vitest.config.ts`
- `mobile/tsconfig.base.json`
- `mobile/tsconfig.json`
- `scripts/audit-api-routes.ts`
- `scripts/__tests__/audit-api-routes.test.ts`

## Validation Run

- `pnpm exec vitest run --config vitest.config.ts` from `mobile/`: PASS, 1 file / 3 tests
- `pnpm exec vitest run scripts/__tests__/audit-api-routes.test.ts`: PASS, 1 file / 5 tests
- `pnpm exec tsx scripts/audit-api-routes.ts --json`: PASS, scanned 442 routes with 99 advisory findings
- `pnpm type-check`: PASS
- `pnpm lint`: PASS with 0 errors and 840 warnings
- `git diff --check`: PASS

## Failing Or Blocked Checks

### Mobile full type-check

Error: `pnpm exec tsc --noEmit -p mobile/tsconfig.json` fails.

Cause: mobile package dependencies are not installed in this worktree because `mobile/` is not part of `pnpm-workspace.yaml`; TypeScript cannot resolve `expo-router`, `react-native`, Expo modules, or `expo-sqlite` type declarations.

Fix: add a dedicated, lockfile-backed mobile install/workspace strategy or run mobile type-check in the Expo/mobile package environment where those dependencies are installed.

Next action: keep Phase 1 web validation authoritative for this branch and use the mobile-specific Vitest config for queue logic until mobile dependency ownership is resolved.

### API route audit inherited findings

Error: advisory API route scan reports 31 error-severity findings and 68 warning-severity findings.

Cause: the current codebase still contains inherited API production risks across unauthenticated route candidates, admin routes without DB-role revalidation, unsafe/raw SQL patterns, unbounded `findMany` candidates, and `error.message` JSON responses.

Fix: remediate route groups in narrow commits, then run the scanner without `--strict` to verify count reduction; only enable `--strict` once the inherited error count is zero.

Next action: start with the error-severity API findings that map directly to Phase 1 critical gaps: admin DB-role revalidation, public health/OAuth/mobile route auth decisions, unsafe raw SQL, and 500 response leakage.

## Unresolved Risks

- MOB-001 is only partially covered. The client queue exists and now has tests, but server replay is not yet backed by durable database idempotency.
- `ClientMutation` and `FieldCaptureEvent` Prisma models are still absent.
- Process-local idempotency in `lib/idempotency.ts` is not sufficient for multi-instance/serverless offline replay guarantees.
- Full mobile type-check is blocked by dependency/workspace ownership.
- API route audit is advisory only. It has identified inherited route-hardening debt but has not remediated those routes yet.
- Protected `.github/PULL_REQUEST_TEMPLATE.md` case-collision dirtiness remains visible and must not be staged with Phase 1 work.

## Rollback Notes

- The new mobile Vitest config and tests are additive and can be reverted without changing runtime behavior.
- `mobile/tsconfig.json` now extends a local `mobile/tsconfig.base.json` so tests can transform TypeScript without relying on an uninstalled `expo/tsconfig.base` package in this worktree.

## Next Safe Action

Continue Phase 1 by remediating the advisory API audit error findings in narrow route groups, or return to MOB-001 durable idempotency once a safe database migration path is available.
