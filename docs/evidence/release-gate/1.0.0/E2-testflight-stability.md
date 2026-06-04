---
criterion: E2-testflight-stability
status: deferred
verified: 2026-05-28
tracking_ticket: RA-5628
---

# E2 - TestFlight Stability (5 pts)

**Status:** DEFERRED
**Tracking:** RA-5628
**Verified by:** Codex release-gate PM sweep

## Criterion

External TestFlight build is stable with crash-free sessions at or above 99.5%.

## Current Evidence

No current App Store Connect, Sentry, or equivalent crash dashboard evidence was found proving the active TestFlight build meets the 99.5% crash-free threshold.

## Required To Mark PASS

- Identify the exact TestFlight build number and version.
- Attach App Store Connect, Sentry, or equivalent crash analytics showing crash-free sessions >= 99.5%.
- Confirm the measurement window, tester population, and number of sessions are meaningful for pilot readiness.
- Document any known crash classes and prove they are resolved or formally accepted.

## PM Decision

Keep this criterion fail-closed until current TestFlight stability evidence exists.
