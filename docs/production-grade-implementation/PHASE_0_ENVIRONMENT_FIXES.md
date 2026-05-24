# Phase 0: Environment Fixes

Date: 2026-05-24  
Goal: make the repository safely verifiable before touching core production behavior.

## Scope

Phase 0 is deliberately small. It exists to make every later fix measurable.

Included backlog tasks:

- ENV-001: Restore Package Manager Verification Path
- ENV-002: Make Type/Lint/Test Gates Authoritative
- ENV-003: Clarify Deploy Ownership
- ENV-004: Add Phase-0 Static Audit Scripts
- SHIP-001: Release Gate Checklist Automation

## Blockers

### Package Manager Unavailable

Error: `pnpm` and `corepack` are unavailable in the current shell.  
Cause: Node is installed, but pnpm/corepack shims are not on PATH.  
Fix: Restore pnpm availability outside the repo dependency graph. Preferred path: enable/install pnpm matching `packageManager: pnpm@9.15.9`, document the command in the developer bootstrap, then rerun `pnpm type-check`.

Acceptance:

- `which pnpm` returns a path.
- `pnpm --version` returns `9.15.9` or an approved compatible version.
- `pnpm type-check` runs from `/Users/phillmcgurk/RestoreAssist`.
- No `npm install`, `yarn`, or `bun` is used for repo dependencies.

### Soft Build Gates

Error: `next.config.mjs` allows TypeScript and ESLint failures during build.  
Cause: Historical strictness drift made Next build unreliable as a quality gate.  
Fix: Keep build ignores temporarily only if needed, but make CI separately hard-fail on `pnpm type-check`, `pnpm lint`, smoke tests, env audit, and route audit.

Acceptance:

- CI has explicit type/lint/test jobs.
- Production deploy path documents which checks are blocking.
- Any remaining `ignoreBuildErrors` and `ignoreDuringBuilds` have a removal task and owner.

## Execution Steps

1. Restore pnpm/corepack availability.
2. Run baseline:
   - `git status --short`
   - `pnpm type-check`
   - `pnpm lint`
   - `npx vitest run`
3. Record failures without broad refactors.
4. Add `scripts/audit-env.ts`, `scripts/audit-api-routes.ts`, and `scripts/audit-rls.ts` as advisory scripts.
5. Wire advisory scripts into CI as non-blocking first pass if baseline failures are high.
6. Update `docs/RELEASE_GATE.md` to include the final blocking gate sequence.
7. Clarify deploy ownership: Vercel Git deploy vs GitHub Actions.

## Test Requirements

- Package manager smoke:
  - `pnpm --version`
  - `pnpm type-check`
- Existing quality gates:
  - `pnpm lint`
  - `npx vitest run`
  - smoke tests where env allows
- New static scripts:
  - env audit detects forbidden `NODE_TLS_REJECT_UNAUTHORIZED`
  - route audit detects missing auth/admin/query/error/raw SQL patterns
  - RLS audit reports policy coverage or missing connectivity/config

## Acceptance Criteria

Phase 0 is complete when:

- A developer can run the same commands locally that CI runs.
- CI/deploy ownership is documented.
- Release gate doc lists every required check.
- Static audits exist and produce actionable output.
- No production code behavior changes were made except necessary CI/config/docs.

## Rollback

- Revert CI workflow edits independently if they block emergency deploys.
- Keep static audit scripts advisory until the baseline is triaged.
- Do not revert package manager restoration unless it breaks the repo's pnpm-only rule.

## Out of Scope

- Visual redesign.
- AI provider migration.
- Offline sync implementation.
- RLS policy deployment.
- Report/handoff redesign.

