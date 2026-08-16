---
criterion: F1-monitoring-alerting
status: deferred
verified: 2026-07-05
tracking_ticket: RA-5628
---

# F1 - Monitoring And Alerting (5 pts)

**Status:** DEFERRED (still fail-closed - see PM Decision)
**Tracking:** RA-5628

## Criterion

Monitoring and alerting are configured for auth failures, billing webhook errors, and restore/job workflow failures.

## Live check status, measured 2026-08-16

These are the four scheduled checks that actually run against this product. Status below was read from the GitHub Actions run history on 2026-08-16, not assumed.

| Check | Schedule | Live status | Link |
|---|---|---|---|
| Smoke - Production | every 15 min | **Passing** (5/5 most recent runs green, latest 2026-08-15 23:48 UTC) | https://github.com/CleanExpo/RestoreAssist/actions/workflows/smoke-prod.yml |
| Pilot tester canary | daily 16:00 UTC | **Passing** (5/5 most recent runs green, latest 2026-08-15) | https://github.com/CleanExpo/RestoreAssist/actions/workflows/pilot-canary.yml |
| Supabase advisor gate | weekly, Mon 13:00 UTC | **FAILING - 8 consecutive failures since 2026-06-22** | https://github.com/CleanExpo/RestoreAssist/actions/workflows/supabase-advisor-gate.yml |
| Deepsec weekly scan | weekly, Mon 13:00 UTC | not assessed in this pass | https://github.com/CleanExpo/RestoreAssist/actions/workflows/deepsec-weekly.yml |

### The advisor gate has been dark for eight weeks, and nothing told you

Cause, read from the failing run log (run `31392983620`, 2026-08-10):

```
SUPABASE_ACCESS_TOKEN:
SUPABASE_ACCESS_TOKEN is not set — cannot reach the advisors API. Failing closed.
##[error]Process completed with exit code 1
```

The repository secret `SUPABASE_ACCESS_TOKEN` is empty, so the gate has never reached the Supabase Management API. It fails closed, which is correct behaviour - but it means **the check that watches prod for RLS-disabled public tables and ERROR-level security advisors has not actually looked at prod since 2026-06-22.**

**Second failure, worse than the first:** the workflow's own `Open issue on failure` step **also** exited 1 in that same run. It calls `gh issue create --label "security"`, and the `security` label does not exist in this repository (checked 2026-08-16 against the repo label list - no match). `gh issue create` rejects a non-existent label, so no issue was ever filed. Eight consecutive failures produced **zero** notifications.

This is the exact shape of the gap this criterion is meant to close: a check that cannot run, whose alarm cannot fire. Fixing the secret is founder-only and is written up in **`docs/evidence/release-gate/FOUNDER-ACTIONS.md`**. Creating the missing label is a 30-second fix at https://github.com/CleanExpo/RestoreAssist/labels.

## Signals that exist in code (unchanged, re-confirmed 2026-07-05)

- **Auth failures:** every `LOGIN_FAILED` is a `SecurityEvent` row (`lib/auth.ts`, `lib/security-audit.ts`).
- **Billing webhook errors:** `StripeWebhookEvent.status = 'FAILED'`, plus the daily `reconcile-stripe` and 30-minutely `retry-failed-webhooks` crons as a self-healing backstop.
- **Restore/report workflow failures:** `reportError()` fires on every standards-degradation path (`lib/standards-retrieval.ts`), forwarded via `instrumentation.ts onRequestError`; every `StorageRestoreJob` failure is queryable by `status`.

`docs/runbooks/` holds the exact detection query for each. **None of these is wired to an alert** - someone has to go looking.

## Founder close-out (about 15 minutes)

### Step 1 - restore the dark check (2 min)

Set the `SUPABASE_ACCESS_TOKEN` secret. Exact instructions are in `FOUNDER-ACTIONS.md`. Then create the missing `security` label so the failure notifier can actually file an issue.

### Step 2 - create three Vercel Observability alert rules (10 min)

Vercel dashboard: **https://vercel.com/dashboard** - select the **`restoreassist`** project, then **Observability > Alerts**.
*(Unverified: I could not confirm the team slug for a direct deep link, so this is the dashboard route rather than a one-click URL.)*

| # | Failure class | Signal to alert on | Suggested trigger | Route and SLA |
|---|---|---|---|---|
| 1 | Auth failures | `LOGIN_FAILED` SecurityEvent log line | spike: more than N in 5 min (tune N to baseline) | email → owner, respond within 30 min |
| 2 | Billing webhook errors | **HTTP 500 on `POST /api/webhooks/stripe`** - do **not** write this rule against `StripeWebhookEvent.status = 'FAILED'`, see the warning below | 1 or more in 15 min | email → owner, respond within 1 h |
| 3 | Restore / report workflow failures | `reportError()` via `onRequestError`, plus failed `StorageRestoreJob` | 1 or more in 15 min | email → owner, respond within 1 h |

Wiring note: rule 3 can match the `reportError()` output directly, because `onRequestError` already surfaces it to Vercel logs. Rule 1 is a database-row signal - if it does not already emit a Vercel-visible log line at the failure point, add a `logger.error` at that site. That is a small code follow-up and does not block creating the rule.

### Warning: the obvious rule for billing webhooks would never fire

An earlier draft of this document told you to alert on `StripeWebhookEvent.status = 'FAILED'`. **That rule would sit silent through the common failure.** From `app/api/webhooks/stripe/route.ts:659-687`:

- On a webhook processing failure, the `catch` block writes the row `status: "FAILED"` and returns HTTP 500. **No `console.error` is emitted on that path.**
- The two `console.error` calls in that block sit inside the `.catch()` attached to the audit write. They fire **only when the `status: "FAILED"` update itself also fails** - the rare double failure.

So on an ordinary single webhook failure the only Vercel-observable signal is the **HTTP 500** on that route. The database row changes, but Vercel Observability cannot see the database.

Two acceptable options - pick one deliberately:

- **Option A (no code change):** alert on HTTP 500 for path `/api/webhooks/stripe`. Works today.
- **Option B (small code change first):** add a `logger.error` immediately after the `status: "FAILED"` write, then alert on that log line. Better long-term, because the alert then carries the Stripe event ID and the error message. If you pick B, make the code change **before** creating the rule, or the rule matches nothing.

This is the same failure class as the advisor gate above: a notifier wired to a signal that never arrives. It was only caught because someone tried to actually fire it, which is what Step 3 forces.

### Step 3 - prove the rule actually fires (5 min)

Creating a rule is not evidence it works. Run this against **sandbox only**. Never against prod.

**3a. Install and point the Stripe CLI at the sandbox** (one-time)

```bash
stripe login
stripe listen --forward-to https://restoreassist-sandbox.vercel.app/api/webhooks/stripe
```

Leave that running. It prints a `whsec_...` signing secret.

**3b. Confirm the happy path first (the positive control)**

In a second terminal:

```bash
stripe trigger customer.subscription.deleted
```

The `stripe listen` window should show `[200]`. This proves the endpoint is reachable and correctly signed **before** you deliberately break anything.

To be precise about what this rules out, because it is not what you might assume: a **wrong or malformed signature returns 400, never 500** (`route.ts:108-116`), as does a missing `stripe-signature` header (`route.ts:88-93`). So a bad secret cannot masquerade as a processing failure. What the control *does* rule out is the one non-processing 500 on this route: if `STRIPE_WEBHOOK_SECRET` is **unset** on the sandbox, the route returns **500** "Webhook secret not configured" (`route.ts:96-104`) before any handler runs. A green 200 here proves the secret is configured, so the 500 you provoke in 3c is genuinely a processing failure and not a config gap.

**3c. Induce a real failure**

The handler only 500s when processing genuinely throws, so induce a fault in the sandbox's database connection:

1. Vercel dashboard → project `restoreassist` → **Settings > Environment Variables**.
2. For the **Preview/sandbox** environment only, change `DATABASE_URL` to an unreachable host (append `-broken` to the hostname).
3. Redeploy the sandbox.
4. Run `stripe trigger customer.subscription.deleted` again.
5. The `stripe listen` window should now show **`[500]`**.

**Honest caveat about what this reproduces.** Breaking `DATABASE_URL` takes out the database entirely, so the `status: "FAILED"` audit write in the `catch` block fails too. That means **both** `console.error` lines *do* fire here - you are reproducing the rare double-failure, not the ordinary single-failure case described in the Warning above. That is fine for this purpose: it still emits the HTTP 500 that rule 2 matches, so it proves the rule fires. But do not conclude from a successful test that the log-line signal is generally available - on an ordinary single webhook failure it is not, which is the entire reason rule 2 targets the 500.

**3d. Confirm the alert landed, then revert**

Check that rule 2 fired and the email arrived. Then **immediately restore the original `DATABASE_URL`** and redeploy. Record the revert in your evidence.

If the alert does not arrive within the rule's window, the rule is misconfigured - that is the finding, and it is exactly what this step exists to surface.

**Prefer not to touch `DATABASE_URL`?** Alternative with no env change: in **https://dashboard.stripe.com/test/webhooks**, open the sandbox endpoint, select a past event and click **Resend**, then read the response code Stripe records. This confirms the endpoint's current status code but will show `200` on a healthy system, so it demonstrates observability without proving the alert fires. Option 3c is the one that actually tests the alarm.

<!-- PASTE EVIDENCE HERE: 3 screenshots of the configured rules, the alert-test result, and confirmation that the advisor gate went green on its next run -->

## PM Decision

Keep this criterion fail-closed. Do not mark PASS on the strength of signals existing in code, or of the two passing smoke checks - the criterion requires alert **rules**, and one of the four live checks is currently dark with a broken notifier.

To mark PASS: set `status: pass` and `verified: <YYYY-MM-DD>` only after the three rules exist, the alert test is documented, and the advisor gate has gone green at least once. Commit the same day.
