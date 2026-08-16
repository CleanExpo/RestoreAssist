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

The external TestFlight build is stable, with crash-free sessions at or above **99.5%**.

## Two things that will otherwise waste your time

1. **Sentry is not in this stack.** It was removed on 2026-07-06 (RA-6928): `@sentry/nextjs`, the three `sentry.*.config.ts` files and `lib/sentry-scrub.ts` are gone, and `lib/connections/status.ts` reports Sentry as not part of the stack. Do not go looking for a Sentry dashboard. Crash data comes from **App Store Connect** or **Xcode Organizer**.
2. **RestoreAssist iOS is a Capacitor shell around a live website** (`capacitor.config.ts` sets `server.url = https://restoreassist.app`). Almost all of the app runs as web content inside a `WKWebView`. **A JavaScript error in the web layer does not produce a native crash report.** So a high crash-free percentage here is real but narrow: it proves the native shell is stable, not that the product works. Record the number the criterion asks for, and note this limitation rather than treating 100% as proof of product health.

## Where to get the number (about 8 minutes)

App: **RestoreAssist**, bundle ID **`com.restoreassist.app`**.

**Route A - App Store Connect (preferred, no Mac required)**

1. **https://appstoreconnect.apple.com/apps** - select RestoreAssist.
2. **TestFlight** tab - open the current **external** build. Record the version and build number exactly as shown (for example `1.0.4 (12)`).
3. Go to the **Metrics** section and select **Crashes** (or **Crash-Free Users / Sessions**), scoped to that build.
4. Read the crash-free percentage, the measurement window, and the session count.

**Route B - Xcode Organizer (needs the Mac with the signing identity)**

Xcode, then **Window > Organizer > Crashes**, select the RestoreAssist app and the matching build.

## Evidence to capture

| # | Item | Value |
|---|---|---|
| 1 | Date captured (with timezone) | |
| 2 | Source used (App Store Connect Metrics / Xcode Organizer) | |
| 3 | Exact version and build number | |
| 4 | Crash-free sessions percentage | |
| 5 | Threshold met? (must be **99.5% or above**) | |
| 6 | Measurement window (dates) | |
| 7 | Number of sessions in the window | |
| 8 | Number of distinct testers in the window | |
| 9 | Known crash classes, and for each: resolved or formally accepted | |
| 10 | Screenshot link or filename | |

### The sample-size trap

**A build with 3 sessions and 0 crashes reports 100% crash-free and proves nothing.** This criterion exists to show the build is stable under real pilot use. Before ticking row 5, check row 7. If the session count is trivially small, the honest answer is that the metric is not yet meaningful - say so in the record and keep this criterion deferred until the pilot has generated real usage. Do not let a small-sample 100% close a 5-point gate.

Also check row 8: sessions concentrated in a single tester (typically you) measure one device and one usage pattern.

<!-- PASTE EVIDENCE HERE: the completed table plus a screenshot link -->

## PM Decision

Keep this criterion fail-closed until current TestFlight stability evidence exists.

To mark PASS: set `status: pass` and `verified: <YYYY-MM-DD>` only after the real metric is recorded above **and** the session count supports it. Commit the same day.
