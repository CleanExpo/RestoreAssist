# Phase 0 Completion Report

Date: 2026-05-24  
Status: CI FIX IN PROGRESS. Local Phase 0 validation passed on Node 22.22.3; first PR run exposed that Node 20.18.0 is not a reliable validation runtime for the current Vitest/jsdom dependency graph.

## Scope

Phase 0 was limited to local and CI validation reliability. No Phase 1 production feature implementation was started.

## Environment Verification

| Check | Result |
|---|---|
| Node requirement | PASS for validation on Node `v22.22.3`. `package.json` still allows `20.x || 22.x`, but Phase 0 validation is pinned to Node 22 because CI Node 20 failed unit-test worker startup. |
| CI Node pin | FIXED AFTER FIRST CI RUN. PR and release gates read `.nvmrc`, now `22.22.3`, instead of duplicating a loose `20`. |
| npm | Available as `10.9.8`; used only for global tooling repair, not repo dependencies. |
| corepack | Restored and available at `/Users/phillmcgurk/.local/bin/corepack`, version `0.35.0`. |
| pnpm | Restored and available at `/Users/phillmcgurk/.local/bin/pnpm`, version `9.15.9`. |
| Package manager | PASS. `packageManager` is `pnpm@9.15.9`; `pnpm-lock.yaml` is present. |
| Other lockfiles | PASS. No `package-lock.json`, `yarn.lock`, `bun.lockb`, or `bun.lock` found. |

## Package Manager Fix

Error:  
`pnpm` and `corepack` were unavailable in the default shell.

Cause:  
Global npm tooling installed under `/Users/phillmcgurk/.hermes/node/bin`, while the shell PATH resolved tools from `/Users/phillmcgurk/.local/bin`.

Fix:  
Installed global tooling outside repo dependency management with `npm install -g corepack@latest pnpm@9.15.9`, then symlinked `corepack`, `pnpm`, and `pnpx` into `/Users/phillmcgurk/.local/bin`.

Next action:  
Use `scripts/bootstrap-restoreassist-env.sh` or `scripts/bootstrap-restoreassist-env.ps1` on new machines so the PATH/tooling mismatch is detected and repaired repeatably.

## Baseline Command Results

| Command | Status | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile` | PASS | Lockfile install completed and Prisma client generated. |
| `pnpm prisma:generate` | PASS | Prisma Client v6.19.3 generated. |
| `pnpm type-check` | PASS | Authoritative TypeScript check returned exit 0. |
| `pnpm lint` | PASS | Exit 0 with 840 warnings and 0 errors. Warning debt remains non-blocking but visible. |
| `pnpm exec vitest run` | PASS | 205 test files passed, 16 skipped; 1810 tests passed, 81 skipped. |
| `pnpm build` with preview-style env | PASS | Build completed after replacing build-script `npx prisma` calls with `pnpm exec prisma`. |
| `pnpm audit --audit-level=high --prod` | PASS | Exit 0; found 3 moderate vulnerabilities below the high gate. |
| `scripts/bootstrap-restoreassist-env.sh` | PASS | Completed install, Prisma generate, type-check, lint, and unit tests. |

## Non-Blocking Findings

Error:
GitHub PR Quality Gates failed at `pnpm exec vitest run` on Node 20.18.0 with `ERR_REQUIRE_ESM` from `html-encoding-sniffer` requiring `@exodus/bytes/encoding-lite.js` while starting jsdom-related Vitest fork workers.

Cause:
The CI runtime came from `.nvmrc` (`20.18.0`), while the locally passing baseline used Node 22.22.3. Node 20 cannot reliably execute the current Vitest/jsdom dependency graph.

Fix:
Pinned `.nvmrc` to `22.22.3` and updated bootstrap scripts to require Node 22 for Phase 0 validation parity.

Next action:
Re-run PR Quality Gates and confirm install, Prisma generate, type-check, lint, unit tests, build, audit, and pgvector migration drift pass under Node 22.

Error:  
`pnpm install`, `pnpm exec vitest run`, and audit commands warn: `using --force I sure hope you know what you are doing`.

Cause:  
`.npmrc` contains `force=true`.

Fix:  
No Phase 0 change applied because the frozen install currently passes and changing dependency conflict behavior may alter resolution. Treat removal of `force=true` as a separate dependency hygiene task.

Next action:  
Before release hardening, test removing `force=true` in a dedicated branch with `pnpm install --frozen-lockfile`, `pnpm type-check`, `pnpm lint`, `pnpm exec vitest run`, and `pnpm build`.

Error:  
`pnpm build` emits Next.js warnings for unsupported `next.config.mjs` `eslint`, deprecated `middleware` convention, one dynamic server usage warning, and invalid help fixture frontmatter.

Cause:  
The app is on Next.js 16.2.6 while some configuration/content patterns still reflect older conventions or test fixture content.

Fix:  
No Phase 0 code change applied because the build exits 0 and the objective was environment reliability.

Next action:  
Track these as Phase 1 or ship-readiness cleanup items after the validation environment is stable.

Error:  
Local Prisma migration drift was not run against a local database.

Cause:  
The drift gate needs a pgvector-capable Postgres instance and Supabase auth stub setup.

Fix:  
The PR workflow already provisions `pgvector/pgvector:pg16`, stubs `auth.uid()`, and now runs migration commands through `pnpm exec prisma`.

Next action:  
Phase 1 may start only after the updated CI PR gate confirms migration drift passes.

## Files Created Or Updated

| File | Purpose |
|---|---|
| `scripts/bootstrap-restoreassist-env.sh` | Repeatable macOS/Linux bootstrap and local validation script. |
| `scripts/bootstrap-restoreassist-env.ps1` | Repeatable Windows PowerShell bootstrap and local validation script. |
| `.github/workflows/pr-checks.yml` | Uses `.nvmrc`, frozen pnpm install, pnpm-only validation commands, blocking lint, unit tests, build, audit, and migration drift. |
| `scripts/build.sh` | Replaced `npx prisma` calls with `pnpm exec prisma`. |
| `docs/RELEASE_GATE.md` | Documents the bootstrap script and pnpm-based test commands. |
| `docs/production-grade-implementation/PHASE_0_COMPLETION_REPORT.md` | This completion report. |

## CI Validation Gate

The PR gate now requires:

1. `pnpm install --frozen-lockfile`
2. `pnpm prisma:generate`
3. Supabase `auth.uid()` stub setup for CI Postgres
4. Pre-resolved Supabase-only concurrent-index migrations
5. `pnpm type-check`
6. `pnpm lint`
7. `pnpm exec vitest run`
8. `pnpm build`
9. `pnpm audit --audit-level=high --prod`
10. `pnpm exec prisma migrate deploy`
11. `pnpm exec prisma migrate status`

## Phase 1 Entry Criteria

Phase 1 can safely start when:

1. Local `scripts/bootstrap-restoreassist-env.sh` or `scripts/bootstrap-restoreassist-env.ps1` passes.
2. `pnpm`, `corepack`, and Node 22.x are available.
3. `pnpm-lock.yaml` is authoritative and no competing lockfiles exist.
4. `pnpm type-check`, `pnpm lint`, `pnpm exec vitest run`, and `pnpm build` pass locally or in CI.
5. The updated PR gate passes on GitHub, including pgvector migration drift.
6. Any Phase 1 branch starts from this known validation baseline.

## Next Safe Action

Open a PR with the Phase 0 environment/CI changes and wait for the updated PR Quality Gates workflow to pass. After that, start Phase 1 critical production gaps from `PHASE_1_CRITICAL_PRODUCTION_GAPS.md`.
