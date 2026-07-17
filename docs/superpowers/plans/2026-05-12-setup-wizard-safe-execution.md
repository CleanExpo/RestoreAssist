# Setup Wizard — Safe Execution Plan (Phases 4-10)

> **Companion to:** `docs/superpowers/plans/2026-05-12-setup-wizard.md` (the 37-task implementation plan)
> **Scope:** How to execute the remaining ~22 tasks (Phases 4 → 10) without breaking production, generating untested code, or creating downstream rework.
> **Status at write time (2026-05-12):** Phases 1-2 shipped, 17 commits on `feat/setup-wizard`. ABR consumer key registration pending (ref `ABNL27826`, GUID ETA ~2026-05-19).

---

## Why this exists

The remaining phases touch production code, migrate live data, and ship a user-facing feature. The cost of getting it wrong is asymmetric: a rushed UI ships and gets rebuilt, a bad migration corrupts production, a missing feature flag exposes half-built work to real users.

This document is the meta-plan. The implementation plan tells you *what* to build; this tells you *how* to build it without breaking things and without generating future cleanup work.

The reader is the controller executing the implementation plan (me, or a future engineer). The reader checks this document **before each phase** and again **after each phase** to confirm the safety hooks ran.

---

## Promotion path (decided 2026-05-12)

`feat/setup-wizard` does NOT PR directly into `main`. Promotion sequence:

1. **Branch:** `feat/setup-wizard` (off `origin/main` — 34 commits at time of writing)
2. **PR target:** `origin/sandbox` (NOT main). Sandbox is currently ~61 commits behind main; before this PR opens, either (a) sandbox is fast-forwarded from main in a separate housekeeping PR, or (b) the setup-wizard PR is structured to include the sandbox catch-up
3. **Verification:** Vercel preview attached to `feat/setup-wizard` confirms compile + deploy
4. **Staging burn-in:** sandbox stays current with new code for 24-48h before any sandbox → main promotion
5. **Production:** sandbox → main merge only after Phase 10 verification gate

Why: increasing risk (Phase 6 middleware is hairy; Phase 7+ UI surfaces real customer code paths). Sandbox isolation keeps production untouched until we've burned-in the work in a sandbox-deploy environment first.

## Foundational gates (must be true before ANY further phase)

These are non-negotiable. Phase 4 does not start until all four are green.

### Gate 1 — Migration A applied to a local dev Postgres

The schema migration in commit `91bf5516` was generated but never applied. Until it runs against a real DB:
- Every API test that touches new models (HydrationJob, AbnLookupCache, OrganizationPricingConfig) will fail
- Backfill behaviour is unverified

**Action:** Apply Migration A to **either** a local Postgres OR an ephemeral test DB (see Test Infrastructure below). Verification command:
```bash
cd /Users/phill-mac/RestoreAssist-setup-wizard
DATABASE_URL=postgres://localhost:5432/restoreassist_dev npx prisma migrate dev
```
Expect: `Following migration have been applied: 20260512000000_setup_wizard_phase_a`.

### Gate 2 — Feature flag wired BEFORE any user-visible code ships

The middleware in Task 18 will redirect every owner/admin user to `/setup` once `setupCompletedAt = null`. If this lands in production without a flag, **every existing user is locked out of their dashboard** because their `Organization.setupCompletedAt` is null.

**Action:** Add `SETUP_WIZARD_ENABLED` env var (server-side; not `NEXT_PUBLIC_` because we don't want clients to know the gate exists). Middleware short-circuits when `process.env.SETUP_WIZARD_ENABLED !== 'true'`. Default: false in production, true on Preview, true locally.

This is a **new sub-task** to add to Task 18 (middleware). Track explicitly:

```typescript
// middleware.ts — first check before any setup gating
const SETUP_ENABLED = process.env.SETUP_WIZARD_ENABLED === 'true';
if (!SETUP_ENABLED) return NextResponse.next();
// ... rest of setup gate ...
```

A separate one-shot backfill (a "migration C" later) flips existing organizations' `setupCompletedAt` to `now()` so they are treated as already-completed and never see the wizard. Add this to the implementation plan as **new Task 18.5**: "Mark all existing Organizations as setup-complete to grandfather them in."

### Gate 3 — Per-task commit cadence working

Phase 1 confirmed the per-task commit policy works (17 commits, each cleanly mappable to a task). Maintain this. If a phase produces zero commits, something is wrong.

### Gate 4 — User signs off on the Phase 4 kickoff

I do not start Phase 4 without explicit user confirmation. The pause points in this doc are real pauses; not "I'll continue if you don't object".

---

## Test infrastructure decision

Phases 5-9 all need a real Postgres to test against. There are three viable patterns. Pick one **before Phase 4** and stick with it.

### Option A — Local Postgres on a dedicated test schema (Recommended)

```bash
createdb restoreassist_setup_test
cd /Users/phill-mac/RestoreAssist-setup-wizard
echo "DATABASE_URL=postgres://localhost:5432/restoreassist_setup_test" > .env.test.local
DOTENV_CONFIG_PATH=.env.test.local npx prisma migrate deploy
```

Then `vitest` runs against `restoreassist_setup_test` via a `vitest.config.ts` that loads `.env.test.local`. Tests `deleteMany()` between cases — safe, because the DB is dedicated.

**Pros:** Fast (~1s per test), no Docker overhead, persists between runs so you can inspect data after a failure.
**Cons:** Requires Postgres installed locally. New dev needs setup.

### Option B — Ephemeral Postgres via Docker Compose

```yaml
# docker-compose.test.yml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["55432:5432"]
    environment:
      POSTGRES_PASSWORD: test
      POSTGRES_DB: test
```

Start before tests, stop after. CI-friendly because it spins up per-job.

**Pros:** Reproducible, no shared state, no host dependency.
**Cons:** ~5s startup, requires Docker, harder to inspect post-failure (container gone).

### Option C — Defer all DB tests to CI; rely on type-check locally

Skip DB-level tests during dev; let CI catch issues. Riskier — bugs slip through because they only surface at CI time.

**Pros:** No local setup at all.
**Cons:** Slow feedback loop, harder to debug.

### Decision criteria

- If you have Postgres running locally already → **Option A**
- If you don't and want zero-setup → **Option B**
- Don't pick C unless time is critical

Whichever option lands, document it in the worktree as `.env.test.local.example` and add `pnpm test:db` to `package.json` that does setup → migrate → vitest → teardown.

---

## Migration & deployment timeline

The sequence below assumes Phase 4 starts today and the user has registered for ABR (waiting on GUID).

| When | What | Where | Why |
|---|---|---|---|
| Phase 4 start | Apply Migration A | Local test DB | Phase 5 tests need it |
| Phase 5 done | Push `feat/setup-wizard` to GitHub | origin/feat-setup-wizard | Trigger Vercel Preview deploy |
| Phase 5 done | Set `SETUP_WIZARD_ENABLED=true` on Preview env | Vercel project settings | Preview can exercise the gate |
| Phase 5 done | Apply Migration A to Preview's Postgres | Vercel/Supabase Preview branch DB | API routes need the new schema |
| Phase 7 done | Manual UI walkthrough via Chrome MCP | Preview URL | Ship-gate before merge |
| Phase 9 done | All 7 E2E pass against Preview | CI | Last regression check |
| Phase 10 | Merge to `main` | origin/main | Auto-deploys to staging |
| Phase 10 +24h | Apply Migration A to STAGING Postgres | Staging DB | Confirm migration in real env |
| Phase 10 +24h | Set `SETUP_WIZARD_ENABLED=true` on staging | Vercel staging env | Internal test cohort |
| Phase 10 +48h | Apply Migration A to PROD Postgres | Production DB | After staging burn-in |
| Phase 10 +48h | New Task 18.5 (grandfather backfill) on PROD | Production DB | Existing users keep dashboard access |
| Phase 10 +72h | Flip `SETUP_WIZARD_ENABLED=true` on PROD | Vercel prod env | Live to all new signups |
| Months later | Migration B (drop deprecated User.business* + CompanyPricingConfig) | All DBs | After confirming new code paths exclusive |

Each transition between rows is a **discrete decision point**. Do not auto-progress. The user signs off at each.

---

## Phase-by-phase safety hooks

These are the **only** things that change between phases. Everything in the implementation plan stays the same — these hooks wrap it.

### Phase 4 — `lib/setup/checks.ts` (1 task, low risk)

**Pre-phase:** Gates 1-4 green. `pnpm test` runs clean against Phase 1+2 work.

**During:** Capability checks make real calls (Gemma, Prisma, Cloudinary). Each check must catch all errors and never throw — a broken capability check should return `{ status: 'red' }`, never crash the route.

**Post-phase:**
- [ ] `pnpm type-check` clean
- [ ] `npx vitest run lib/setup/__tests__/checks.test.ts` — all pass
- [ ] No new lint warnings

**Pause:** No. Tiny task, low risk, batched with Phase 5 prep.

### Phase 5 — API routes (5 tasks, MEDIUM risk)

**Pre-phase:**
- [ ] Test DB chosen and `prisma migrate deploy` runs cleanly against it
- [ ] Decision: are we using SSE or polling for `/api/setup/hydrate/stream`? (Plan says SSE; verify Vercel Fluid Compute supports it for the route's duration)

**During:** **Every** API route must satisfy CLAUDE.md rules verbatim — I list the checklist here verbatim, not summarised:

| Rule | Check on every route |
|---|---|
| #1 | `await getServerSession(authOptions)` — no exceptions for /api/setup/* (except `hydrate/stream` if SSE auth pattern differs) |
| #2 | `session.user.id` for identity, NOT `session.user.email` |
| #4 | `select`/`include` explicit; `take` set on all `findMany` |
| #6 | `Prisma.sql` for any raw query (none expected here) |
| #7 | 500s return `{ error: 'Internal server error' }`; log internally with `console.error` |
| #8 | Subscription gate: setup routes use `routeBasic({ bypassCreditGate: true })` — verified by Task 11 (already done) |
| #9 | Atomic credit deduction (N/A — wizard doesn't charge credits) |
| #10 | Rate limit using `session.user.id` (not IP). Decision: add a per-route limit (e.g., 60 req/min for `state` and `checks`, 6 req/min for `hydrate`, 2 req/min for `activate`) |
| #18 | Response shape `{ data }` or `{ error }` |

**Post-phase:**
- [ ] All 5 routes have unit/integration tests
- [ ] Push to `origin/feat-setup-wizard` and wait for Vercel Preview deploy green
- [ ] `curl` smoke against Preview: `/api/setup/state` returns 401 unauthenticated, 200 with cookies
- [ ] CLAUDE.md rules checklist above completed for each route (don't rush)

**Pause:** YES. Substantial server-side surface. User reviews before UI starts. Show Preview URL.

### Phase 6 — Middleware + register cleanup (2 tasks, HIGH risk)

**This is the highest-risk phase in the entire build.** Middleware bugs lock users out of the product.

> **Next.js 16 update (discovered 2026-05-12 during Phase 5 smoke test):** Next.js 16.2.4 emits a deprecation warning that `middleware.ts` is being replaced by a `proxy.ts` convention. Phase 6 must implement the gate as `proxy.ts` (or whatever the current canonical name is when you start the task), NOT `middleware.ts`. See https://nextjs.org/docs/messages/middleware-to-proxy. The existing `middleware.ts` file in this repo still works in 16.x but will break in 17. Decision: ship the setup gate in the new convention to avoid double rework. The implementation plan's Task 18 file path needs adjusting at execution time.

**Pre-phase:**
- [ ] `SETUP_WIZARD_ENABLED=false` confirmed on Production env
- [ ] Task 18.5 (grandfather backfill) added to the implementation plan and scheduled for the same commit as the middleware

**During:**
- Middleware change is **two parts in ONE commit**:
  - The new setup gate code
  - The `SETUP_WIZARD_ENABLED` flag check **before** the new gate
- Manual test: temporarily set `SETUP_WIZARD_ENABLED=false`, sign in to local dev, confirm `/dashboard` loads (no redirect). Then set to `true`, sign in again, confirm redirect to `/setup`.
- Sample-seed removal in `/api/auth/register`: must not break any existing test. Grep first:
  ```bash
  grep -rn "isSample" app/ lib/ --include="*.ts" --include="*.tsx"
  ```
  Any test that asserts `isSample === true` after register must be updated to assert it after `/api/setup/activate` instead.

**Post-phase:**
- [ ] Flag toggle works locally in both directions
- [ ] Existing E2E tests for signup/login/dashboard still pass (`npx playwright test e2e/auth.spec.ts` if it exists)
- [ ] Push to Preview; verify with flag ON and OFF
- [ ] Sample-data assertions in existing tests resolve cleanly

**Pause:** YES. Don't proceed to UI until middleware is verified in BOTH flag states.

### Phase 7 — UI components (~8 tasks, MEDIUM risk)

**Pre-phase:**
- [ ] Phase 5 API routes deployed to Preview and working
- [ ] Chrome MCP available for verification

**During:**
- **Brand compliance every component (CLAUDE.md rule #17):**
  - Navy `#1C2E47`, warm `#8A6B4E`, light `#D4A574`, dark bg `#050505`
  - Use `bg-[#1C2E47]` or Tailwind aliases if defined; never hardcoded non-brand colours
- **Component compliance (rule #16):** shadcn/ui only. No custom dialogs/buttons/inputs. If a need arises that shadcn doesn't cover, STOP and add it to shadcn first.
- **Accessibility (review dim #9):** every interactive element has `aria-label` or visible label; tab order is sensible; modals trap focus; colour contrast WCAG AA (extract-colors already enforces this on logos).
- **No global state pollution:** Zustand store lives in `components/setup/store.ts` and is NOT imported from outside `components/setup/`. Don't leak setup state into the rest of the app.

**Post-phase:**
- [ ] Each card renders cleanly in all 5 states (pending/running/ready/error/manual) — verified via Chrome MCP screenshot
- [ ] Full /setup page walkthrough on Preview with a test ABN (sandbox-known) — captured as screen recording or screenshots
- [ ] Mobile/tablet/desktop viewport tested (`mcp__chrome-devtools__resize_page`)
- [ ] Zero console errors during the happy path

**Pause:** YES. UI is the most visible surface. User reviews screenshots before E2E starts.

### Phase 8 — Delete legacy onboarding routes (1 task, LOW risk if Phase 6 was right)

**Pre-phase:**
- [ ] Phase 6 confirmed working in production with flag OFF (delete shouldn't touch users currently)
- [ ] grep confirms zero external references:
  ```bash
  grep -rn "dashboard/onboarding\|/api/onboarding/first-run\|/api/onboarding/status" \
    app/ components/ lib/ middleware.ts --include="*.ts" --include="*.tsx"
  ```

**During:** Delete in a single commit. Also delete any tests in `e2e/` or `__tests__/` that referenced these routes.

**Post-phase:**
- [ ] `pnpm type-check` clean (no orphaned imports)
- [ ] `pnpm build` succeeds (Next.js catches missing routes)

**Pause:** No.

### Phase 9 — E2E + visual regression (8 tasks, MEDIUM risk)

**Pre-phase:**
- [ ] ABR GUID received and added to Vercel envs (Preview + Staging)
- [ ] `ABR_BASE_URL` env switch tested manually with `curl`

**During:** Run each E2E scenario locally against Preview before adding to CI. Flaky tests are worse than no tests.

**Post-phase:**
- [ ] All 7 E2E scenarios green 3x in a row (no flakes)
- [ ] Visual regression baselines committed; diff = 0 on re-run
- [ ] CI workflow includes the new specs

**Pause:** Yes — final review before Phase 10.

### Phase 10 — Verification Gate

Per `.claude/rules/verification-gate.md`. The user runs through the manual checklist on staging, signs off, then we ship.

---

## Anti-rework checklist (the cheap-to-prevent, expensive-to-fix list)

Things that, if forgotten, force a rewrite or hotfix. **Check these before claiming a task done.**

### Server-side

- [ ] Every API route uses `getServerSession` exactly once at the top
- [ ] Every `findMany` has explicit `select` + `take`
- [ ] No `error.message` ever in a 500 response body
- [ ] Rate limit key uses `session.user.id`, not IP
- [ ] Errors caught + logged via `console.error` (no swallowed errors)
- [ ] Response shape: `{ data: ... }` for success, `{ error: '...' }` for failure
- [ ] HTTP status codes are correct (200 success, 201 create, 202 accepted async, 401 unauth, 403 forbidden, 404 not found, 422 validation, 500 internal)

### Schema & data

- [ ] All migrations additive; drops deferred to a clearly-labelled Migration B
- [ ] New `findUnique` queries on new columns use `@unique` indexes (already done for `Organization.abn`)
- [ ] Backfill is idempotent and no-clobber
- [ ] Sample data isolated by `isSample: true`

### UI

- [ ] shadcn/ui components only (no custom form controls)
- [ ] Brand colours from CLAUDE.md
- [ ] aria-labels on every icon button
- [ ] Mobile breakpoint tested (375px)
- [ ] No `<img>`; use `next/image`
- [ ] No `console.log` left behind
- [ ] No `// TODO` without a Linear ticket reference

### Tests

- [ ] Every API test uses a per-test transaction OR `deleteMany` cleanup
- [ ] No test depends on test-order
- [ ] E2E tests use Chrome MCP-friendly selectors (`getByRole`, `getByLabel`, not class selectors)
- [ ] Visual regression tests have a `_visual` flag to seed state deterministically

### Process

- [ ] Each task = one commit; commit message references the task number
- [ ] Pre-commit hooks not skipped (`--no-verify` is forbidden per CLAUDE.md)
- [ ] `pnpm-lock.yaml` always committed with `package.json` (pnpm-only repo)
- [ ] No `.env*` files committed (gitignored; verify with `git status` before committing)
- [ ] PR description references the spec + plan paths

### Deployment

- [ ] Feature flag (`SETUP_WIZARD_ENABLED`) gates everything
- [ ] Migration applied to staging 24h before production
- [ ] Grandfather backfill runs the same window as the migration (existing users marked setup-complete)
- [ ] Rollback plan: flip flag to false; users see the old dashboard again (no data loss)

---

## Pause points (where I stop for explicit user sign-off)

I do not auto-advance past these. The user types "continue" or similar.

1. **Before Phase 4** — confirm Gates 1-4 + test DB chosen
2. **Between Phase 5 and Phase 6** — API routes verified on Preview, before middleware risk
3. **Between Phase 6 and Phase 7** — middleware verified in both flag states
4. **Between Phase 7 and Phase 8** — UI verified via Chrome MCP screenshots
5. **Between Phase 9 and Phase 10** — all E2E green, before staging migration
6. **Before each production action** — migration apply, flag flip, deletion

That's 6 pauses across Phases 4-10. Average phase length: ~3-4 tasks. Total wall-clock estimate: 1-2 weeks across multiple sessions.

---

## Rollback plan (the "if it breaks" runbook)

### If the middleware locks users out

1. Set `SETUP_WIZARD_ENABLED=false` on the affected Vercel env (Preview, staging, or prod). Takes effect in ~30s.
2. Users immediately get their dashboard back.
3. Diagnose offline.

### If Migration A causes problems

Migration A is additive. There is no scenario where it corrupts data — only where new columns are NULL where they shouldn't be. If the new wizard breaks, flip the feature flag to false; the new columns are unused.

### If the backfill writes wrong data

Migration A's columns are all nullable. Run `UPDATE Organization SET <field> = NULL WHERE <field> = '<bad value>'` to revert. Then fix the backfill and re-run (it's idempotent).

### If an integration breaks (Xero, Google Drive, etc.)

Integrations live in existing settings UI. The wizard's section ⑤ is OPTIONAL — failing the integration just leaves it as [AMBER] not connected. No blocking.

### If the AI hydration breaks

Gemma down → Section ① flips to manual; user fills in by hand. Wizard still completes. The "Skip to manual" escape hatch covers this.

### If everything breaks

Revert the merge commit on `main`:
```bash
git revert <merge-sha>
git push origin main
```
Vercel auto-deploys the revert. Migration A stays applied (additive, harmless). Users go back to the old `/dashboard/onboarding` checklist — which still exists until Phase 8 deletes it. **This means Phase 8's deletion is the no-going-back point.** Defer Phase 8 until production has been live for at least 7 days with no issues.

---

## Output of this plan

A single trackable workstream with:
- A migrations applied table (per environment)
- A feature flag state table (per environment)
- A pause-point log (when, who signed off)
- Anti-rework checklist embedded in every PR description

A clean Phase 10 sign-off requires all three boards to show green.

---

## Anti-pattern catalogue (things we WILL NOT do)

- Apply a migration directly to production without staging burn-in
- Ship a middleware change without a feature flag
- Delete a route before confirming zero callers
- Mock the database in API tests (CLAUDE.md prior incident: mocks passed, prod migration failed)
- Skip pre-commit hooks
- Mix package managers (pnpm only)
- Re-run a phase without first marking the prior phase's task complete
- Trust an implementer's self-report without spec compliance review
- Trust a spec compliance review without code quality review
- Promote work to staging on a Friday afternoon
