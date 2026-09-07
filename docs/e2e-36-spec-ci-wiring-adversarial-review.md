# Independent review — e2e 36-spec CI wiring

**Reviewer:** Cursor (Composer), fresh session · **Engine recorded:** Cursor (Codex slot until 2026-09-12)  
**Subject:** `feat/e2e-wire-36-specs-20260907` at merge `b9bf1dd66` + HEAD workflow/gates  
**Verdict:** **FAIL** — not blocking on path rewrite or job-level `continue-on-error`; blocking on CI self-skips that leave load-bearing security assertions unexecuted while the step and coverage claim can still look successful.

## Coverage of this review

Examined ~100% of the five attack surfaces named in the brief:

| Surface | What was read / probed |
|---|---|
| Path rewrite | Pre-merge list at `388342776` vs HEAD `Run remaining E2E` (36/36 basenames identical); each path `test -f` on disk |
| Discarded `security.spec.ts` | Full diff: `b9bf1dd66^1:docs/archive/playwright-e2e/security.spec.ts` (468 lines) vs HEAD `e2e/security.spec.ts` (540 lines); dangling-symbol search |
| False-green job constructs | Full `.github/workflows/sketch-e2e.yml`; no `continue-on-error`; post-step `if: always()` upload only |
| Self-skips in the 36 | `rg test.skip\|test.fixme\|test.fail` under `e2e/` scoped to the named files; workflow `env:` checked for each gate variable |
| Coverage gates | Full `scripts/ci/check-e2e-coverage.mjs`, `e2e-coverage.mjs`, `verify-workflow-claims.sh`, `e2e-coverage-manifest.txt`; `pr-checks.yml` wiring; executable probes of `mentionsSpec` / `grep -qF "/$spec"` |

Not examined: live Playwright run on CI, product routes behind the specs, whether the job completes within `timeout-minutes: 25`.

---

## Findings

### P0 — Cross-tenant and admin security describes never run in this job

**File / lines:**  
- `.github/workflows/sketch-e2e.yml` env block L52–63 (only `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` / `ALLOW_TEST_HELPERS`) and seed step L108–109 (single `seed-e2e-user.ts` invocation)  
- `e2e/security.spec.ts` L167–175 (describe 2 skip), L484–488 (describe 6 skip)

**What breaks:** The #2178 cross-tenant isolation tests and the admin-route 403 tests are skipped. Playwright treats skips as non-failures, so those assertions contribute neither red nor proof. The coverage manifest still records `security.spec.ts` as `workflow:sketch-e2e.yml` (executed by a named mechanism).

**Trigger:** Run the Sketch E2E job as written. `E2E_USER_B_*` and `E2E_USER_C_*` are unset; seed creates one ADMIN tenant only. Describe 2 and describe 6 skip with stated reasons. The step can still exit 0 for those tests.

**Merge note:** Discarding this branch’s archive `security.spec.ts` made describe 6 *worse* for CI. The discarded file signed in as `NON_ADMIN_EMAIL` via `/api/test/sign-in-as` (runnable under `ALLOW_TEST_HELPERS: "true"` already present in the workflow). Main’s survivor requires `E2E_USER_C_*`, which #2188 taught the seed script to support but never wired into this workflow. Describe 2 needed `E2E_USER_B_*` on both sides — merge did not introduce that hole, but wiring this file into CI without seeding B leaves the P0 guard dark.

No dangling references to discarded symbols (`NON_ADMIN_EMAIL` etc.) remain elsewhere.

---

### P1 — Env-gated skips in the newly named 36 fire under this CI env without anyone noticing

**File / lines:** as below. Every listed skip carries a string reason visible in the Playwright report; the failure mode is that a green/skipped line is easy to miss next to a green job, not that the reason is blank.

| Spec | Lines | Condition true in this workflow? | Reason stated? |
|---|---|---|---|
| `e2e/security.spec.ts` | 152 | Yes — `CRON_SECRET` unset | Yes — `"CRON_SECRET env var not set"` |
| `e2e/security.spec.ts` | 167–175 | Yes — no `E2E_USER_B_*` | Yes |
| `e2e/security.spec.ts` | 399–402 | Yes — no `E2E_LOW_CREDIT_EMAIL` | Yes |
| `e2e/security.spec.ts` | 440–443 | Yes — no `E2E_CANCELED_EMAIL` | Yes |
| `e2e/security.spec.ts` | 484–488 | Yes — no `E2E_USER_C_*` | Yes |
| `e2e/help/article-detail.spec.ts` | 4–7 | Yes — no `CLOUDINARY_URL` | Yes |
| `e2e/help/public-mirror.spec.ts` | 3–6 | Yes — no `CLOUDINARY_URL` | Yes |
| `e2e/invite-tech-google-oauth.spec.ts` | 3–6 | Yes — no `GOOGLE_CLIENT_ID` | Yes |
| `e2e/stripe-payment-intent-webhook.spec.ts` | 115–121 | Yes — no `STRIPE_WEBHOOK_SECRET` | Yes |

**What breaks:** Entire files or describes are recorded as skipped. Job exit can still be 0 for those tests. Manifest and workflow naming still claim the specs are “run”.

**Trigger:** Default `sketch-e2e.yml` env as committed. No extra secrets.

Also present (always skip / expected-fail, reasons in source comments or titles — not env-conditional, but still silent relative to a pass):

- `test.fixme()`: `setup-abr-unreachable`, `setup-resume`, `setup-website-failure`, `help/dropdown-open`, `help/search-cmd-k`, `invite-tech-happy-path`, `job-close-preconditions`, `tech-banner-auto-dismiss`, `tech-evidence-capture-no-modal`, `health.spec.ts`  
- Unconditional `test.skip("…", async …)`: `setup-no-abn`, `setup-skip-manual`, `setup-technician-gate` (title is the only reader-facing reason; TODO above explains)  
- `test.fail()`: `ios-billing-gates` (2), `billing.spec.ts` (2) — expected failure scores green until the product flips

---

### P1 — `verify-workflow-claims.sh` is not a second CI gate

**File / lines:** `scripts/ci/verify-workflow-claims.sh` (entire script); `.github/workflows/pr-checks.yml` L325 runs only `check-e2e-coverage.mjs --summary`; repo-wide search finds no other caller of `verify-workflow-claims`.

**What breaks:** The script’s own header claims it asserts the same obligation “a second time, by a different route.” In CI that second route never runs. Only `mentionsSpec` in `check-e2e-coverage.mjs` is live.

**Trigger:** Land a PR that breaks a workflow claim in a way only the shell script would catch (see next finding). `pr-checks` still greens if `check-e2e-coverage.mjs` is happy.

---

### P2 — `verify-workflow-claims.sh` can still pass on a longer nested path

**File / lines:** `scripts/ci/verify-workflow-claims.sh` L45 — `grep -qF "/$spec"`

**What breaks:** A claim for `billing/cancel-flow.spec.ts` is satisfied by a workflow line that only names `e2e/vendor/billing/cancel-flow.spec.ts`, because `"/billing/cancel-flow.spec.ts"` is a substring. Probed: `grep -qF` returns match; `mentionsSpec(..., 'billing/cancel-flow.spec.ts', ['e2e'])` correctly returns false.

**Trigger:** Manifest claims `billing/cancel-flow.spec.ts` → `workflow:sketch-e2e.yml`; workflow run step names only a deeper path containing `/billing/cancel-flow.spec.ts`. Shell script exits 0; `check-e2e-coverage.mjs` would still FALSE CLAIM if it were the only check — but if someone relied on the shell script alone (or ran it in isolation), it lies.

The leading-slash fix correctly closes the live `health.spec.ts` ⊂ `crm-health.spec.ts` hole (probed: crm-only file does not match `/health.spec.ts`).

Stale comment at L37 (“path under docs/archive/playwright-e2e”) is documentation drift only — not a failure path.

---

## Attack surfaces with no blocking finding

### 1. Path rewrite — clean

All 36 paths in HEAD `Run remaining E2E` exist on disk. Basename set equals the pre-merge `docs/archive/playwright-e2e/…` list from commit `388342776` (36 = 36, empty symmetric difference). No corrupted substitution; none deleted-without-move under a different name among the 36.

### 2. Discarded branch `security.spec.ts` — no dangling refs; value lost is CI executability of admin tests

Same 16 test titles on both sides. Main is *stronger* on cross-tenant preconditions (fail instead of `test.skip(true, …)` when create fails) and on the real NextAuth cookie helper. What was lost that matters: on-demand non-admin via `sign-in-as`, and `test.fail()` markers on the two known `POST /api/contractors/reviews` 500s (without those markers the remaining step goes honestly red if those tests run — not a false green). No other file imports discarded symbols.

### 3. Job false-green constructs — none found

- No `continue-on-error` on any step.  
- `Upload Playwright report` uses `if: always()` only — does not override a failed test step.  
- Preceding step failure skips later steps; job is red.  
- `concurrency: cancel-in-progress: true` cancels superseded runs; cancelled ≠ success.  
- A red Playwright exit fails the step and the job.

The false-green path that remains is Playwright skip/`fixme` exit 0 (findings above), not Actions swallowing.

### 5. `check-e2e-coverage.mjs` — no live false-green found in the attack classes named

Probed: sibling basename containment, cross-directory basename, YAML comment mentions, empty discovery (exit 2), A1 producer failure (throws, exit 2), `pathToFileURL` main-guard (documented). `mentionsSpec` equality matching holds for the cases that previously greened wrong claims. It still cannot see self-skips inside a named file — that is outside its contract; it proves naming, not assertion execution.

---

## Summary

| Severity | Count | Most serious |
|---|---|---|
| P0 | 1 | Cross-tenant + admin security describes skip in CI while the file is claimed executed |
| P1 | 2 | Env-gated skips across the 36 under this workflow env; `verify-workflow-claims` unwired |
| P2 | 1 | Nested-path substring hole in the unwired shell verifier |

**Nothing blocking on the blind path rewrite or on Actions-level swallow of a red spec.**  
**Blocking concern:** wiring `security.spec.ts` (and several credential-gated specs) into CI without provisioning the env those describes require — worsened for admin tests by taking main’s survivor over the branch’s `sign-in-as` non-admin path.
