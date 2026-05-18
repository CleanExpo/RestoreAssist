# Lint debt — P2 follow-up (NOT a cutover blocker)

**Discovered 2026-05-18 post-#1145** when the local toolchain finally ran `pnpm lint` end-to-end (the .nvmrc + minimatch override unblocked the crash that had hidden lint output entirely).

## Findings

```
✖ 192592 problems (63408 errors, 129184 warnings)
  72 errors and 10319 warnings potentially fixable with --fix
```

## Why this is NOT a cutover regression

- `.github/workflows/pr-checks.yml:126` explicitly sets `continue-on-error: true` on the Lint step. CI does NOT block on lint and never has.
- The findings were latent — `pnpm lint` crashed on Node 26 with `minimatch@3` brace-expansion bug, so contributors saw "command failed" instead of the actual lint output. My fix to .nvmrc + minimatch override surfaced the existing debt.
- ESLint config at `eslint.config.mjs` is explicitly interim (per RA-1398 comment): only `@typescript-eslint/no-unused-vars` (warn) + `react-hooks/*` + `no-restricted-globals`. The full `eslint-config-next` chain is not enabled.
- type-check (`pnpm type-check`) IS the authoritative gate and PASSES (0 errors).
- prod build PASSES.
- Vitest is 100% green.

## Recommended follow-up sequence (separate ticket)

1. **Baseline ratchet** — install `eslint-baseline` or `eslint-disable-next-line` sweep so new code can't add to the pile while existing code is worked down. Documented as "Wave 3 PR-E" in the same workflow file comment.
2. **Triage by rule** — group the 192K into top-10 rules; the `--fix` flag claims 10K auto-fixable. Mechanical PR for those.
3. **Triage by directory** — likely heavy concentration in `app/` and `components/`; consider warn-only for legacy paths and error for new code via per-directory config.
4. **Activate `eslint-config-next` full chain** — current config is intentionally minimal pending Next 16's flat-config-native version. Track upstream readiness.

## Not in scope for this session

- The production cutover directive (100% green CI + paying clients) is met with vitest, type-check, build, and pnpm audit all green. Lint was never part of the gate. CI behaviour is unchanged.
