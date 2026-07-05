---
criterion: F1-monitoring-alerting
status: deferred
verified: 2026-07-05
tracking_ticket: RA-5628
---

# F1 - Monitoring And Alerting (5 pts)

**Status:** DEFERRED (still fail-closed — see PM Decision)
**Tracking:** RA-5628
**Verified by:** Claude (RA-4956/RA-6999 category-F evidence pass, 2026-07-05)

## Criterion

Monitoring and alerting are configured for auth failures, billing webhook errors, and restore/job workflow failures.

## Resolution (2026-07-06, RA-6928)

The documentation-drift gap flagged below (Sentry SDK vs `docs/compliance/OBSERVABILITY-SETUP.md`) is resolved: the Sentry SDK was vestigial — it crept back into the repo via a later bundle PR after being deliberately removed once (commit `cbb626b3`), nothing in app code ever called `captureException`/`Sentry.*`, and the DSN was never confirmed set in production. The founder confirmed Sentry is not used. `@sentry/nextjs`, the three `sentry.*.config.ts` files, and `lib/sentry-scrub.ts` have been removed; `instrumentation.ts` keeps the Vercel-native Node instrumentation + `onRequestError` (now forwarding to `reportError()`), and the `lib/connections/status.ts` "sentry" connector reports that Sentry is not part of the stack. `docs/compliance/OBSERVABILITY-SETUP.md` is the single, now-uncontested SSOT for this app's error/observability stack.

This does not change the underlying gap below: the required signals exist in code, but no alert-routing layer (Vercel Observability alert rules) has been confirmed configured. The stack decision is no longer open — only the alert-rule + on-call wiring remains.

## Current evidence (re-audited 2026-07-05, code-level, no dashboard access; stack-decision superseded 2026-07-06 — see Resolution above)

What actually exists in the repo today, read directly rather than assumed:

- **Failure classes named in this criterion already emit structured, alertable signals in code**:
  - Auth failures: every `LOGIN_FAILED` is a `SecurityEvent` row (`lib/auth.ts`, `lib/security-audit.ts`).
  - Billing webhook errors: `StripeWebhookEvent.status = 'FAILED'` (schema) plus daily `reconcile-stripe` and 30-minutely `retry-failed-webhooks` crons as a self-healing backstop.
  - Restore/report workflow failures: `reportError()` fires on every standards-degradation path (RA-6934, `lib/standards-retrieval.ts`) and every `StorageRestoreJob` failure is queryable by `status`.
  - See `docs/runbooks/` (new, this evidence batch) for the exact detection query against each of these signals.
- **None of the above is wired to an alert.** No evidence exists — in this repo or in Vercel — of a configured alert rule, on-call rotation, or paging policy on any of these signals. Today, someone must go looking (via the queries in `docs/runbooks/`) to discover a problem; nothing pushes the signal to a human.

## Required to mark PASS

- Configure and screenshot a Vercel Observability alert rule for: auth-failure spikes, Stripe/billing webhook failures, and restore/report workflow failures — each routed to a real destination (email/Slack/on-call), with an owner and expected response SLA attached.
- Run or document a recent alert test (deliberately trigger one of the three classes in a non-prod environment and confirm the alert fires and reaches its destination).

## PM Decision

Keep this criterion fail-closed. The underlying application code emits the right signals for all three named failure classes (confirmed by direct code read, 2026-07-05) and those signals are now documented with exact detection queries in `docs/runbooks/`, but no alert-routing layer sits on top of them. Do not mark PASS on the strength of signals existing in code — the criterion requires alert rules, not signal presence.
