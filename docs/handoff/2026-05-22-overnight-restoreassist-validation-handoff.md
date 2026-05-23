# RestoreAssist Overnight Validation Handoff — 2026-05-22

Generated: 2026-05-22 23:01:51 EAST
Operator: Hermes / Unite-Group Nexus Hub
Project: RestoreAssist

## Executive summary

RestoreAssist is back to a usable developer baseline for TypeScript and local dev startup.

Green:
- `pnpm install` repaired from a corrupted Windows/pnpm state.
- `pnpm prisma:generate` passes.
- `pnpm type-check` passes.
- Targeted lint for touched Xero sync-status files passes.
- `pnpm dev` is running and listening on port 3000.

Not green:
- Full `pnpm lint` now runs correctly, but fails on existing source lint debt: 154 errors and 812 warnings.
- Browser/root route `http://localhost:3000/` returns HTTP 500 with `TypeError: Invalid URL` during SSR.
- Prisma validation requires `DIRECT_URL`; with dummy local URLs injected, schema validates successfully.

## What was fixed

### 1. Dependency environment repair

Root cause was not normal TypeScript failure at first. The local dependency graph was corrupted:
- `node_modules/.modules.yaml` was missing.
- top-level pnpm links and `.bin` shims were missing/incomplete.
- pnpm virtual-store payloads had truncated/corrupt packages.
- Git-Bash/MSYS-created links were incompatible with Windows Node resolution.
- pnpm global store `D:\.pnpm-store\v3` had corrupt cached package metadata/payloads.

Actions:
- Switched install execution to PowerShell for Windows-native pnpm linking.
- Pruned and replaced corrupt pnpm store.
- Reinstalled with conservative concurrency:
  - `--child-concurrency=1`
  - `--network-concurrency=1`
  - `--ignore-scripts` during repair
- Confirmed `.modules.yaml` restored.

### 2. Xero sync-status Prisma/type drift

Files involved:
- `app/api/integrations/xero/sync-status/route.ts`
- `lib/integrations/xero/sync-status-runner.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260522225545_add_xero_sync_status/migration.sql`

Fixes:
- Added `XeroSyncStatus` Prisma model.
- Added `User.xeroSyncStatuses` relation.
- Added migration for `XeroSyncStatus` table, unique key, indexes, and FK.
- Removed invalid `status === "LIFETIME"` comparison; lifetime access is represented by `user.lifetimeAccess`.

### 3. ESLint dependency/runtime issue

`pnpm lint` initially crashed with:
- `TypeError: expand is not a function`

Root cause:
- Global override forced `brace-expansion >=2.0.3`.
- `minimatch@3.1.5` expects the CommonJS v1 function API.
- pnpm resolved `brace-expansion@5.0.5`, creating runtime incompatibility.

Fix:
- Added scoped override in `package.json` and lockfile:
  - `minimatch@3.1.5>brace-expansion: 1.1.12`

### 4. ESLint generated artifact scope

Full lint was scanning generated/archive folders, especially `.claude` with ~77,414 lintable JS/TS files.

Fix:
- Updated `eslint.config.mjs` ignores:
  - `.claude/**`
  - `.hermes/**`
  - `.superpowers/**`
  - `storybook-static/**`
  - `distribution/**`

## Validation results

### Passing

- `pnpm prisma:generate`
  - Exit: 0

- `pnpm type-check`
  - Exit: 0
  - Command reached real TypeScript check and passed: `tsc --noEmit`.

- Targeted lint on touched Xero files:
  - `pnpm exec eslint app/api/integrations/xero/sync-status/route.ts lib/integrations/xero/sync-status-runner.ts`
  - Exit: 0

- Prisma schema structural validation:
  - `pnpm exec prisma validate`
  - Requires `DATABASE_URL` and `DIRECT_URL` in shell.
  - With dummy local PostgreSQL URLs injected: schema valid.

### Failing / blocked

- `pnpm lint`
  - Exit: 1
  - Now runs correctly after ignore/dependency fixes.
  - Current baseline: 966 total problems:
    - 154 errors
    - 812 warnings
  - Dominant categories:
    - `preserve-caught-error`
    - `no-useless-assignment`
    - `no-useless-escape`
    - `no-control-regex`
    - `no-empty`
    - `no-async-promise-executor`
    - many unused-var warnings

- `pnpm dev`
  - Running and listening on port 3000.
  - Root route `http://localhost:3000/` returns HTTP 500.
  - Captured SSR error from returned Next error page:
    - `TypeError: Invalid URL`
    - stack points into SSR bundled dependency parseUrl.
  - Recommendation: next lane should inspect env URL values and app-level URL construction (`NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `VERCEL_URL`, auth/provider config). This is runtime config/code, not a TypeScript compile failure.

## Active processes

- `pnpm dev`
  - Session: `proc_1d910fa7b8fe`
  - Status at handoff: running
  - Port: 3000 listening

Full lint process completed and is no longer running.

## Changed files from this repair

Intentional repair changes:
- `package.json`
- `pnpm-lock.yaml`
- `eslint.config.mjs`
- `prisma/schema.prisma`
- `prisma/migrations/20260522225545_add_xero_sync_status/migration.sql`
- `app/api/integrations/xero/sync-status/route.ts`

Note: the working tree already contained other modified/untracked RestoreAssist files before/around this repair. Do not assume all dirty files are from this validation lane.

## Recommended next lane for Margot / Senior PM

Priority 1 — runtime boot:
- Fix `TypeError: Invalid URL` on `/` so dev homepage returns 200.
- Start by validating local env URL variables:
  - `NEXTAUTH_URL`
  - `NEXT_PUBLIC_APP_URL`
  - `VERCEL_URL`
  - any provider/client base URLs parsed during module evaluation.

Priority 2 — lint debt triage:
- Do not attempt all 154 errors as one PR.
- Split into 4 safe PRs:
  1. regex cleanup: `no-useless-escape` and `no-control-regex`
  2. empty/useless assignment cleanup: `no-empty`, `no-useless-assignment`
  3. caught-error preservation: add `{ cause }` to wrapped errors where appropriate
  4. unused-var warning reduction only after errors are cleared

Priority 3 — database alignment:
- Apply/check migration for `XeroSyncStatus` in the target dev database.
- Confirm `DIRECT_URL` is present in local env or documented dev bootstrap.

## Labour / cost accounting

Estimated active operator time: 3.75 hours
Benchmark: $85 AUD/hr
Estimated labour value: $318.75 AUD

## Board/Margot decision

Recommendation: proceed with runtime boot fix next before lint debt cleanup. Type-check is green, dependency state is repaired, and lint is now a real baseline debt list rather than a broken toolchain. The highest business value is getting local dev homepage to HTTP 200, then burning down lint errors in isolated PRs.
