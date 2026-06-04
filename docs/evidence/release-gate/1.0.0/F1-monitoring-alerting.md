---
criterion: F1-monitoring-alerting
status: deferred
verified: 2026-05-28
tracking_ticket: RA-5628
---

# F1 - Monitoring And Alerting (5 pts)

**Status:** DEFERRED
**Tracking:** RA-5628
**Verified by:** Codex release-gate PM sweep

## Criterion

Monitoring and alerting are configured for auth failures, billing webhook errors, and restore/job workflow failures.

## Current Evidence

Sentry configuration files exist in the repo, but no current owner evidence was found proving alert rules are configured and routed for the required auth, billing webhook, and restore/job failure classes.

## Required To Mark PASS

- Attach Sentry alert-rule evidence for auth failure spikes.
- Attach Sentry alert-rule evidence for billing/Stripe webhook errors.
- Attach Sentry alert-rule evidence for restore/job workflow failures.
- Confirm alert destinations, on-call owner, severity mapping, and expected response SLA.
- Run or document a recent alert test, or provide a formal exception with owner and expiry.

## PM Decision

Keep this criterion fail-closed until monitoring screenshots or exported alert-rule proof are attached.
