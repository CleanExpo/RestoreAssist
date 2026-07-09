---
criterion: E1-app-store-metadata
status: deferred
verified: 2026-05-28
tracking_ticket: RA-5628
---

# E1 - App Store Metadata (5 pts)

**Status:** DEFERRED
**Tracking:** RA-5628
**Verified by:** Codex release-gate PM sweep

## Criterion

App Store metadata, screenshots, privacy nutrition, and age rating are approved or ready for submission in App Store Connect.

## Current Evidence

Repository runbooks and App Store helper scripts exist, but no current owner evidence was found proving App Store Connect is in a "Ready for Submission" or approved state with final metadata, screenshots, privacy nutrition, and age rating.

## Required To Mark PASS

- App Store Connect screenshot or export showing the RestoreAssist app version state.
- Final metadata/title/subtitle/description/support URL/marketing URL confirmed.
- Required screenshots uploaded for target devices.
- Privacy nutrition answers completed and reviewed.
- Age rating completed and reviewed.
- Any App Review blockers documented as zero or linked to closed issues.

## PM Decision

Keep this criterion fail-closed until current App Store Connect evidence is attached.

## Founder close-out (pre-staged 2026-07-10)

Owner-only — needs your authenticated App Store Connect session. Do these, then flip the frontmatter.

1. App Store Connect → My Apps → RestoreAssist → the version being submitted.
2. Confirm all of: title, subtitle, description, keywords, support URL, marketing URL.
3. Confirm required screenshots uploaded for every target device class.
4. Complete + review the Privacy nutrition answers and the Age rating.
5. Confirm App Review blockers = 0 (or each linked to a closed issue).
6. Capture a screenshot/export showing the version state (ideally "Ready for Submission" / "Waiting for Review").

<!-- PASTE EVIDENCE HERE: screenshot filename/link + the version string (e.g. 1.0.0 build 42) -->

To mark PASS: set frontmatter `status: pass` and `verified: <YYYY-MM-DD>` **only after** the evidence above is real and pasted. Do not flip on the strength of "runbooks exist" — the scorer also requires the file mtime to be within 14 days, so commit on the same day you attach evidence.
