# Mobile Validation Path Report

Date: 2026-05-25

## Scope

Priority 3 Phase 1 production hardening: define and validate a repeatable mobile install/type-check path.

Safe checkout used:

- pwd: `/private/tmp/RestoreAssist-phase1-main`
- branch: `codex/phase-1-production-readiness-clean`

Protected paths were not modified.

## Files And Configs Inspected

- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `mobile/package.json`
- `mobile/tsconfig.json`
- `mobile/tsconfig.base.json`
- `mobile/vitest.config.ts`
- `mobile/app.json`
- `mobile/eas.json`
- `mobile/babel.config.js`
- `mobile/node_modules`

## Decision

Mobile should be validated as a separate package, not added to the root pnpm workspace yet.

Reason:

- Root web app is on React 19 / Next 16 / TypeScript 6-era tooling.
- Mobile Expo app is on Expo 52 / React 18 / React Native 0.76 / TypeScript 5.3.
- Adding `mobile/` to the root workspace would couple incompatible platform dependency graphs and increase root install/build risk.
- The smallest repeatable path is a standalone mobile install using pnpm's `--ignore-workspace` flag.

## Implemented Path

Created a standalone mobile lockfile:

- `mobile/pnpm-lock.yaml`

Narrow config/code fixes:

- `mobile/tsconfig.json`
  - changed `ignoreDeprecations` from `6.0` to `5.0` so the mobile package's declared TypeScript 5.3 compiler accepts the config.
  - excluded `**/__tests__/**`, `test/**`, and `vitest.config.ts` from production mobile type-check. Tests remain covered by the mobile Vitest command.
- `mobile/lib/api/byok-vision-client.ts`
  - removed a type-only import from the root server package via `@/lib/ai/byok-vision-client`.
  - defined the mobile API response contract locally so the mobile package type-check does not depend on root server modules.

## Commands

Initial dependency install:

```bash
pnpm --dir mobile install --ignore-workspace
```

Repeatable mobile production type-check:

```bash
pnpm --dir mobile --ignore-workspace type-check
```

Repeatable mobile offline-sync unit validation:

```bash
cd mobile
pnpm exec vitest run --config vitest.config.ts
```

## Validation Results

- `pnpm --dir mobile install --ignore-workspace`: PASS after network access; created `mobile/pnpm-lock.yaml`.
- `pnpm --dir mobile --ignore-workspace type-check`: PASS.
- `cd mobile && pnpm exec vitest run --config vitest.config.ts`: PASS, 2 files / 7 tests.

## Blockers

None for the standalone mobile validation path.

## Notes

The earlier command `pnpm --dir mobile install` is not sufficient in this repository because pnpm detects the root workspace and installs from the root context. Use `--ignore-workspace` for mobile validation unless/until a deliberate mobile workspace integration is designed.

## Rollback Notes

- Reverting `mobile/pnpm-lock.yaml` returns mobile dependency ownership to the previous undocumented state.
- Reverting the `mobile/tsconfig.json` change makes mobile TypeScript 5.3 reject the config again.
- Reverting the local `S500VisionResult` contract reintroduces a root-server type dependency into the mobile package.

## Next Safe Action

Proceed to Priority 4: remaining API audit warnings. Keep the API audit advisory count visible and reduce warnings in narrow route groups.
