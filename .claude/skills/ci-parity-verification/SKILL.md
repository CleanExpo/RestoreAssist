---
name: ci-parity-verification
description: Catch the "green locally, red in CI" failure class BEFORE pushing. Use whenever you are about to claim tests pass, before a PR, or when CI "Quality Checks" fails on a test that passed (or was skipped) on your machine — especially anything under lib/setup, app/api/setup, app/api/webhooks/stripe, app/api/oauth, or DB-touching code.
automation: manual
intents: ci, testing, vitest, verification, prisma, database
---

# CI Parity Verification

A focused playbook for the single most common red-CI surprise on RestoreAssist:
**a local `vitest run` prints all-green, you push, and CI's "Quality Checks" goes red.**

> Golden rule: **A local test run is NOT authoritative if any suite is skipped.**
> `vitest` prints a skip count — if it is non-zero in your changed area, you have
> NOT verified those tests. Treat that as "unknown", never as "pass".

## Why this keeps happening (the mechanism)

16+ test files gate themselves with:

```ts
describe.skipIf(!process.env.DATABASE_URL)("...", () => { ... })
```

- **On your laptop** there is usually no `DATABASE_URL`, so these suites **silently skip**.
  `vitest run` reports them as skipped (not failed) and exits 0 → looks green.
- **In CI** the `pgvector/pgvector:pg16` Postgres service sets `DATABASE_URL`, so the
  exact same suites **run for real** — and can fail.

So the bug was always there; your local run just never executed it. Common triggers:

- A `vi.mock(...)` is **hoisted** to the top of the file and unintentionally poisons a
  sibling DB-gated suite (the 2026-06 `sample_report_render` failure — an always-throw
  pdf-lib mock turned a green-expecting check red).
- An API/envelope refactor changes a shape the DB-gated suite asserts (the `nir-data`
  error-envelope failure).
- A new migration or Prisma field the DB-gated suite depends on.

## The protocol (do this BEFORE claiming green)

1. **Scope-check.** Did your change touch any test file, `lib/setup/**`,
   `app/api/setup/**`, `app/api/webhooks/**`, `app/api/oauth/**`, Prisma, or a shared
   `vi.mock`? If yes, env-gated suites are in play.

2. **List the gap.** Run the static guard — no DB needed, instant:

   ```bash
   pnpm test:parity            # all env-gated suites + what will skip here
   pnpm test:parity --changed  # only suites your branch touched
   ```

   It prints exactly which files will *skip locally but run in CI*.

3. **Close the gap.** Run the gated suites the CI way (real Postgres, real migrations):

   ```bash
   pnpm test:db                # full suite against an ephemeral pgvector DB
   pnpm test:db lib/setup      # or scope it to the area you touched
   ```

   `test:db` mirrors `.github/workflows/pr-checks.yml` exactly (same image, auth-schema
   stub, CONCURRENTLY pre-resolve, `migrate deploy`) and runs `test:parity --strict`
   first, so a pass here genuinely matches CI.

4. **If Docker is unavailable**, you cannot reproduce CI locally. Do **not** claim the
   DB-gated suites pass. Say explicitly which suites are unverified-locally and gate
   completion on the actual CI run (`gh pr checks <n>` / `gh run view <id> --log-failed`).

## When CI is already red on a "passed-locally" test

1. Get the **real** assertion, not the log noise — DB-gated suites print intentional
   `stderr` (injected errors). Filter it:

   ```bash
   gh run view <run-id> --log-failed | \
     grep -E "FAIL|AssertionError|Test Files|Tests " | \
     grep -v "setup-check\|prisma:error"
   ```

2. Reproduce locally with the DB: `pnpm test:db <path-to-suite>`.
3. Fix, then re-run `pnpm test:db <suite>` to confirm green before pushing.

## Guardrails

- Don't "fix" a red DB-gated suite by adding `.skip` — that re-hides the bug.
- A hoisted `vi.mock` is file-global. If a suite needs a module to throw, gate it behind
  a `vi.hoisted()` flag the throwing suite toggles, so sibling suites keep the real impl.
- Keep the CONCURRENTLY-migration list in `scripts/ci/test-with-db.sh` in sync with
  `pr-checks.yml` when migrations are added.

## Files

- `scripts/ci/check-test-parity.mjs` — static detector (`pnpm test:parity`).
- `scripts/ci/test-with-db.sh` — CI-parity runner (`pnpm test:db`).
- `.github/workflows/pr-checks.yml` — the gate this skill mirrors.
