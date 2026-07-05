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

## Current evidence (re-audited 2026-07-05, code-level, no dashboard access)

What actually exists in the repo today, read directly rather than assumed:

- **Sentry SDK is wired**, not merely referenced: `sentry.server.config.ts`, `sentry.client.config.ts`, `sentry.edge.config.ts` all call `Sentry.init(...)` when a DSN is present, wired through `instrumentation.ts`. `lib/sentry-scrub.ts` strips secret query params from spans/errors before send. `@sentry/nextjs@^10.63.0` is a real `package.json` dependency.
- **`docs/compliance/OBSERVABILITY-SETUP.md` documents a different, older architecture** ("Vercel-native observability... no third-party error-tracking SaaS", RA-1349) than what the codebase currently ships (Sentry SDK, wired later per the `sentry.*.config.ts` file headers: "Wave 4 PR-L of the 2026-05-06 production-readiness push"). These two documents now disagree on which stack is authoritative. This is a documentation-drift gap in its own right, separate from the alert-rule gap below.
- **`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` presence in production is not confirmed from this environment.** Neither key appears in the local `.env.vercel.prod` snapshot, but Vercel "Sensitive" env vars pull as empty/unset in local snapshots regardless of their real configured value (see project memory `media-gen-credential-hygiene`), so this is inconclusive either way — it must be confirmed directly in the Vercel dashboard (Project → Settings → Environment Variables → Production), not inferred from a local file.
- **The connector-health surface already tracks Sentry's config state**: `lib/connections/status.ts` exposes a `sentry` connection (`state: "connected"` when a DSN env var is present, `"unknown"` otherwise) via `/api/v1/connections/status`. This is env-presence only ("Sentry DSN present" — it does not verify alert rules exist or that Sentry is actually receiving events).
- **Failure classes named in this criterion already emit structured, alertable signals in code**, even without Sentry:
  - Auth failures: every `LOGIN_FAILED` is a `SecurityEvent` row (`lib/auth.ts`, `lib/security-audit.ts`).
  - Billing webhook errors: `StripeWebhookEvent.status = 'FAILED'` (schema) plus daily `reconcile-stripe` and 30-minutely `retry-failed-webhooks` crons as a self-healing backstop.
  - Restore/report workflow failures: `reportError()` fires on every standards-degradation path (RA-6934, `lib/standards-retrieval.ts`) and every `StorageRestoreJob` failure is queryable by `status`.
  - See `docs/runbooks/` (new, this evidence batch) for the exact detection query against each of these signals.
- **None of the above is wired to an alert.** No evidence exists — in this repo, in Vercel, or in Sentry — of a configured alert rule, on-call rotation, or paging policy on any of these signals. Today, someone must go looking (via the queries in `docs/runbooks/`) to discover a problem; nothing pushes the signal to a human.

## Required to mark PASS (unchanged in substance from the prior sweep)

- Decide and document which stack is authoritative (Sentry vs Vercel-native) and reconcile `docs/compliance/OBSERVABILITY-SETUP.md` with the Sentry SDK actually shipped in the repo — currently they contradict each other.
- Confirm `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` are actually set in the Vercel Production environment (owner-only check — Vercel dashboard).
- Configure and screenshot an alert rule (Sentry or Vercel Observability, per the decision above) for: auth-failure spikes, Stripe/billing webhook failures, and restore/report workflow failures — each routed to a real destination (email/Slack/on-call), with an owner and expected response SLA attached.
- Run or document a recent alert test (deliberately trigger one of the three classes in a non-prod environment and confirm the alert fires and reaches its destination).

## PM Decision

Keep this criterion fail-closed. The underlying application code emits the right signals for all three named failure classes (confirmed by direct code read, 2026-07-05) and those signals are now documented with exact detection queries in `docs/runbooks/`, but no alert-routing layer sits on top of them, and Sentry's on/off state in the production environment is unconfirmed. Do not mark PASS on the strength of the SDK being present — the criterion requires alert rules, not SDK presence.
