# Test suite audit — 2026-05-18

Branch: `main` · HEAD: `813e8be4` · vitest 4.1.6 · pnpm

## Headline

- **Vitest:** 220 test files / 1858 tests · **200 files passed, 20 files failed** · **1784 tests passed, 25 tests failed, 49 skipped**
- **Failure shape:** 10 files have actual test-level `× failed` markers (15 individual test failures). 10 files failed at the **suite level** (`beforeAll`/`beforeEach` Prisma init crashed; all child tests silently marked "skipped"). The 49 "skipped" in the headline = 39 from suite-level Prisma init + 9 in `checks.test.ts` + 1 from `lib/__tests__/api-error-message.test.ts` skip.
- **Playwright `@smoke`:** **Skipped.** Local dev server not running (`curl localhost:3000` → no response). The audit prompt allows skipping with a note. Two `@smoke`-tagged spec files exist: `e2e/pilot-workflow.spec.ts`, `e2e/setup-storage-google-drive.spec.ts`.

## Top-of-report flags

There is **no confirmed real production bug** in this run. The two assertion-failures that *look* like real bugs at first glance both decode to **assertion drift** when the prod code is read:

1. `middleware-hard-paywall.test.ts > redirects expired TRIAL user` → middleware deliberately disabled (line 174-181 of `middleware.ts`, SP-3 T15 hotfix: Prisma cannot run on edge runtime). The hard-paywall is now enforced in route handlers, not middleware. Test was not updated.
2. `middleware-setup-gate.test.ts > allows unauthenticated requests through` → middleware now redirects unauth users to `/login` (P1 #16, `middleware.ts:145-159`). Test predates that gate.

Both are intentional production changes the test suite has not absorbed. Flagging them as **Assertion drift**, not real bugs.

If the production-cutover gate requires the hard-paywall to fire on the edge again, the prod fix is to stamp trial state on the JWT in `jwt()` (lib/auth.ts) and read it from `token`, not from Prisma — but that's a feature decision, not a test bug.

## Failures by bucket

### Real bug (priority 1) — none

No failure in this run is caused by production code being wrong.

### Mock-shape break (priority 2) — 5 tests across 3 files

Root cause: `beforeEach(() => vi.restoreAllMocks())` does **not** drain `mockResolvedValueOnce` queues or `.mock.calls` history for raw `vi.fn()` mocks in vitest 4. This is documented in user-memory (`reference_vitest_mockonce_queue.md`): the fix is `vi.mocked(fn).mockReset()` per-mock, or switching to `vi.clearAllMocks()` + `vi.resetAllMocks()`. Every failure in this bucket has the pattern: the *result* assertion passes (control flow IS correct in prod code), but the `expect(mockFn).not.toHaveBeenCalled()` fails because call records from prior tests in the same file are still in the mock.

- `lib/ai/__tests__/model-router-route-basic.test.ts:71` — `enforces credit gate when bypassCreditGate is not set and user has 0 credits` — `result === null` passes, but `mockCallGemma.not.toHaveBeenCalled()` fails: 2 prior calls leaked from tests 1 + 2 in same file.
- `lib/setup/__tests__/checks-live-probes.test.ts:179` — `yellow when no Xero integration is connected` — status assertion passes, but `mocks.getValidXeroAccessToken.not.toHaveBeenCalled()` fails: 1 prior call with `"int1"` leaked.
- `lib/setup/__tests__/checks-live-probes.test.ts:249` — `yellow when no provider connections exist` — same shape; `mocks.validateProviderKey.not.toHaveBeenCalled()` fails: 1 leaked call.
- `lib/setup/__tests__/checks-live-probes.test.ts:304` — `skips DISABLED connections — treats as no connection (yellow)` — same shape; `mocks.validateProviderKey.not.toHaveBeenCalled()` fails: 2 leaked calls.

### Assertion drift (priority 3) — 2 tests across 2 files

Prod code intentionally changed; tests not updated.

- `lib/__tests__/middleware-hard-paywall.test.ts:60` — `redirects expired TRIAL user to /billing/upgrade?reason=trial-expired` — expects 307, gets 200. Hard-paywall middleware deliberately disabled in SP-3 T15 hotfix (`middleware.ts:174-181`) because Prisma cannot run on edge runtime. Trial enforcement moved to route handlers + server components. Either update the test to `expect 200` (acknowledging the disable) or restore the hard-paywall by reading from JWT claims.
- `lib/__tests__/middleware-setup-gate.test.ts:119` — `allows unauthenticated requests through (setup gate path)` — expects status NOT 307; gets 307. Middleware now redirects unauth users to `/login` (P1 #16, `middleware.ts:145-159`). Test description (“setup gate path”) is stale — the setup gate IS skipped for unauth, but the login-redirect gate fires immediately after. Update the test to either expect the `/login` redirect, or mark the path as not requiring login.

### PrismaClientInit / DB-required (CI-only, no unit-test action) — 18 tests across 13 files

Root cause: `DATABASE_URL` env var not set when vitest runs locally. These files exercise real Prisma against a Postgres instance. They were authored as integration tests and the file-level docstring on `lib/__tests__/trial-handling-derived-flags.test.ts` says explicitly *"Requires a live DB connection (uses real Prisma)"*. They're CI-only.

**Files with `× failed` markers (5 files, 13 tests):**
- `lib/__tests__/trial-handling-derived-flags.test.ts` (5/5 failed) — `prisma.user.create` at line 16.
- `lib/billing/__tests__/subscription-event.test.ts` (3/3 failed) — `prisma.user.create` at line 17.
- `app/api/webhooks/stripe/__tests__/subscription-lifecycle.test.ts` (3/3 failed) — `prisma.user.create` at lines 16/35/56.
- `app/api/webhooks/stripe/__tests__/checkout-completed.test.ts` (2/2 failed) — `prisma.user.create` at line 16.
- `scripts/__tests__/backfill-setup-wizard.test.ts` (3/3 failed) — `prisma.organizationPricingConfig.deleteMany` at line 8.
- `scripts/__tests__/grandfather-existing-orgs.test.ts` (3/3 failed) — `prisma.organization.deleteMany` at line 7.

**Files that crashed at the suite level (10 files; child tests show as "skipped" because beforeAll threw):**
- `lib/setup/__tests__/checks.test.ts` (18 tests, 9 already explicitly skipped, beforeAll crashed) — `prisma.user.create` at line 24.
- `app/api/setup/state/__tests__/route.test.ts` (7 tests) — `prisma.user.create` at line 15.
- `app/api/oauth/google-drive/callback/__tests__/route.test.ts` (5 tests) — `prisma.user.create` at line 60.
- `app/api/oauth/google-drive/start/__tests__/route.test.ts` (3 tests) — `prisma.user.create` at line 45.
- `app/api/oauth/google-drive/status/__tests__/route.test.ts` (4 tests) — `prisma.user.create`.
- `app/api/setup/checks/__tests__/route.test.ts` (3 tests) — `prisma.user.create`.
- `app/api/setup/hydrate/__tests__/route.test.ts` (6 tests) — `prisma.user.create` at line 51.
- `app/api/setup/hydrate/stream/__tests__/route.test.ts` (3 tests) — `prisma.user.create` at line 15.
- `app/api/setup/pricing/__tests__/route.test.ts` (5 tests) — `prisma.user.create` at line 13.
- `app/api/setup/activate/__tests__/route.test.ts` (4 tests) — `prisma.user.create` at line 19.

The error in every case is identical: `error: Environment variable not found: DATABASE_URL` raised from `schema.prisma:11`. These tests will pass in CI when `DATABASE_URL` is wired up to a test Postgres. They should either (a) move under an `integration/` glob excluded from default `pnpm test`, or (b) be skipped via `describe.skipIf(!process.env.DATABASE_URL)`.

### Flaky / order-dependent — 0 confirmed

The mock-shape-break failures all reproduce in isolation when running just the failing file, so they are deterministic within their file. They would pass if the failing test were the first test in the file — that fits "order-dependent" — but the root cause is the vitest 4 mock-API change, so they are filed under **Mock-shape break** for actionability.

### Other — none

## Auxiliary noise (non-failing but worth knowing)

- `An update to FeatureHealthCard inside a test was not wrapped in act(...)` — `components/setup/__tests__/FeatureHealthCard.test.tsx` and `components/setup/__tests__/PricingCard.test.tsx` emit React `act()` warnings. Tests pass; warnings only.
- `[Cache] StandardsFolder Analysis: Cache MISS (no cache used)` — expected stdout from `lib/services/ai/standards/__tests__/analyze-standards-folder.test.ts`. Not a failure.
- `npm warn using --force Recommended protections disabled.` and the `module.register()` DeprecationWarning — runner-level, not test-level.

## Recommended fix order

1. **Mock-shape break (5 tests)** — single PR, mechanical, no prod-code risk, immediately reduces failing-test count from 25 → 20. Per `reference_vitest_mockonce_queue.md`: replace `vi.restoreAllMocks()` with explicit `vi.mocked(fn).mockReset()` for each declared mock in `beforeEach`, OR add `vi.clearAllMocks()` alongside `vi.restoreAllMocks()`. Three files: `model-router-route-basic.test.ts`, `checks-live-probes.test.ts`, and check that no other `*.test.ts` in the repo uses the same idiom.
2. **Assertion drift (2 tests)** — engineering judgement required.
   - `middleware-hard-paywall`: decide whether to (a) update the test to assert the intentional `200` (with comment pointing to SP-3 T15 hotfix), or (b) restore the hard-paywall in middleware via JWT-claim-based trial state. (a) is correct for cutover; (b) is the right long-term fix.
   - `middleware-setup-gate`: update the test to either move the assertion to a public path (e.g., `/`) that doesn't require login, or assert the `/login` redirect explicitly.
3. **PrismaClientInit (18 tests / 13 files)** — gate cutover decision: do we run these in CI against a test Postgres, or move them under an excluded `integration/` glob? Either is correct; the current state (they fail every local `pnpm test`) is the wrong middle ground. Recommend: tag with `describe.skipIf(!process.env.DATABASE_URL)` so local dev sees green and CI runs them when `DATABASE_URL` is wired up.
4. **Playwright `@smoke`** — start `pnpm dev` in a separate process and re-run `npx playwright test --grep @smoke --reporter=line` before cutover sign-off. Not done in this audit per the prompt's fallback.

## Cutover gate verdict

Per the production-cutover rubric: **20 failing files, 0 real bugs**. The failures decompose into one mock-API regression (vitest 4) and one set of intentionally-orphaned tests (Prisma init + 2 stale middleware assertions). None blocks a production cutover from a *correctness* standpoint, but the CI signal is currently uninformative — fix order #1 + #3 before cutover so a green suite means "no regressions". The two assertion-drift tests are signal worth keeping until a decision is made on the hard-paywall and unauth-redirect flows.
