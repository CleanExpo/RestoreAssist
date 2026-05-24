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

## Phase 1 Acceptance Criteria Still Open

- Production forbidden-env audit is not yet green.
- First RLS policy group has not been deployed and tested.
- Admin route DB-role revalidation sweep is not complete.
- P0 query/raw SQL/error leakage routes are not fully patched.
- Shared media validator has not been migrated across canonical upload and sketch import.
- Sketch import still needs non-process-local rate limiting and magic-byte validation verification.
- Offline mutation idempotency foundation is client-tested but not yet durable on the server.
- Voice sessions still need durable DB-backed lifecycle persistence.

## Current Blockers

### Mobile type-check environment

Error: mobile full type-check fails.

Cause: `mobile/` is not in the root pnpm workspace and mobile dependencies are not installed in the clean worktree.

Fix: define a mobile dependency/workspace policy or run mobile type-check in its Expo package environment.

Next action: keep mobile queue logic covered by `mobile/vitest.config.ts` while dependency ownership is resolved.

### API route hardening debt

Error: advisory API route scan reports 0 error-severity findings and 76 warnings.

Cause: inherited warning-severity debt remains across public exception reviews and unbounded/shape-incomplete Prisma reads.

Fix: remediate warning groups in small commits and run `pnpm exec tsx scripts/audit-api-routes.ts --json` after each group. Treat public exception warnings as a manual security review checklist before ship.

Next action: continue with warning-severity `findMany` bounds/selects and public exception reviews.

## Ship Readiness

RestoreAssist is not ship-ready.

## Next Safe Action

Continue Phase 1 with narrow API route hardening fixes from the advisory scan, or resume MOB-001 durable server idempotency once database migration ownership is safe.
