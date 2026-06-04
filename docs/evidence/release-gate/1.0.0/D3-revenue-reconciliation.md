---
criterion: D3-revenue-reconciliation
status: deferred
verified: 2026-05-28
tracking_ticket: RA-5628
---

# D3 - Revenue Reconciliation (5 pts)

**Status:** DEFERRED
**Tracking:** RA-5628
**Verified by:** Codex release-gate PM sweep

## Criterion

Stripe purchase, renewal, and churn events reconcile with RestoreAssist database `subscription_events` for the last 7 days.

## Current Evidence

The clean gate audit confirms billing and Stripe webhook tests pass on `origin/main@10452554`, but no current owner evidence was found proving Stripe dashboard event counts match persisted database event counts for a 7-day window.

## Required To Mark PASS

- Capture Stripe dashboard event counts for the last 7 days covering purchase, renewal, and churn/cancellation events.
- Query the RestoreAssist database `subscription_events` table for the same 7-day window.
- Confirm counts and key event IDs reconcile, or document every expected exception.
- Include environment, query timestamp, redacted SQL/query output, Stripe dashboard reference, and owner sign-off.

## PM Decision

Keep this criterion fail-closed until finance/revenue reconciliation evidence exists. Green webhook tests are necessary but not sufficient for this release-gate item.
