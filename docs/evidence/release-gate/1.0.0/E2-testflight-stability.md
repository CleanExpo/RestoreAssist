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

## Founder close-out (pre-staged 2026-07-10)

Owner-only — needs App Store Connect / Xcode Organizer. **Note:** Sentry is NOT part of this app's stack (removed 2026-07-06, RA-6928 / see F1) — get crash-free data from App Store Connect TestFlight metrics or Xcode Organizer, not Sentry.

1. App Store Connect → TestFlight → the current external build; record the exact **build number + version**.
2. Open the crash-free sessions metric (App Store Connect TestFlight, or Xcode Organizer → Crashes) for that build.
3. Confirm crash-free sessions **≥ 99.5%**, and that the window / tester count / session count are meaningful for pilot readiness (not e.g. 2 sessions).
4. List any known crash classes; each must be resolved or formally accepted.

<!-- PASTE EVIDENCE HERE: build number + version, crash-free %, measurement window, session count, screenshot link -->

To mark PASS: set frontmatter `status: pass` and `verified: <YYYY-MM-DD>` **only after** the real metric is pasted above. Commit same-day (scorer requires mtime within 14 days).
