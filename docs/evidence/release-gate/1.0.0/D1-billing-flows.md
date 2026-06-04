---
criterion: D1-billing-flows
status: deferred
verified: 2026-05-28
tracking_ticket: RA-5628
---

# D1 - Billing Flows (5 pts)

**Status:** DEFERRED
**Tracking:** RA-5628
**Verified by:** Codex release-gate PM sweep

## Criterion

Stripe and Apple IAP sandbox purchase, renewal, and cancellation flows are verified with current evidence.

## Current Evidence

Machine billing coverage is green through `D2-paywall-tests`:

```bash
npx vitest run lib/billing/__tests__/ app/api/webhooks/stripe/__tests__/
```

Latest clean audit on `origin/main@10452554` passed: 4 files passed, 3 skipped; 23 tests passed, 8 skipped.

That proves code-level billing/webhook behavior, but it does not prove a live owner-run purchase, renewal, and cancellation journey in Stripe sandbox and Apple IAP sandbox.

## Required To Mark PASS

- Stripe sandbox checkout purchase succeeds from the deployed sandbox/prod-like app.
- Stripe renewal path is exercised with a test clock or equivalent sandbox renewal evidence.
- Stripe cancellation path is exercised and reflected in app entitlement state.
- Apple IAP sandbox purchase, renewal, and cancellation evidence is attached or formally scoped out with owner approval.
- Evidence includes date, environment, account/test user, Stripe dashboard/test-clock references, Apple sandbox/TestFlight references, and any relevant screenshots or report exports.

## PM Decision

Keep this criterion fail-closed until owner evidence is attached. Do not use unit/webhook tests alone as ship approval for paying-customer readiness.
