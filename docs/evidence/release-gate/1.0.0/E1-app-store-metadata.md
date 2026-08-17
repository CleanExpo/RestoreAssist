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

## What is actually in `ops/fastlane` (checked 2026-08-16)

This matters because it changes what you have to type by hand versus what you can copy.

**`ops/fastlane` contains Google Play metadata only. There is no iOS metadata and no fastlane lane at all.**

```
ops/fastlane/metadata/android/en-AU/
  title.txt                 "RestoreAssist — Water Damage"        (28 chars; Play limit 30)
  short_description.txt     "IICRC-compliant CRM for AU water-…"  (78 chars; Play limit 80)
  full_description.txt      2404 bytes                            (Play limit 4000)
  changelogs/1.txt          first-release notes, versionCode 1
  images/icon.png           11.9 KB
  images/featureGraphic.png 103 KB
  images/phoneScreenshots/  8 PNGs (01-landing … 08-about)
```

Three consequences, all of which cost time if you discover them in the App Store Connect UI instead of here:

1. **No `Fastfile`, `Appfile`, `Deliverfile` or `Matchfile` exists anywhere in the repo.** These files are a metadata *store*, not an automated upload path. Nothing will push them for you - both stores must be filled in through their web UIs.
2. **There is no `ops/fastlane/metadata/ios/` directory.** iOS title, subtitle, description, keywords, promotional text and screenshots exist **only** in App Store Connect. There is no repo copy to paste from, and no repo copy to check against.
3. **The 8 Play screenshots are named after marketing-website pages** (`01-landing`, `02-features`, `03-how-it-works`, `04-pricing`, `05-signup`, `06-login`, `07-compliance`, `08-about`), not in-app screens. Open them before submitting. Both stores expect screenshots of the app itself, and Apple's review guideline 2.3.3 specifically targets screenshots that are not of the app in use. **Unverified:** I read the filenames and file sizes, not the image contents.

**Note on `04-pricing.png`:** RestoreAssist sells only on the website (Path B, RA-1842 - see `D1-billing-flows.md`). A pricing screenshot in the **iOS** listing invites the same guideline 3.1.1 scrutiny that rejected build 1.0(3). Do not reuse it for App Store Connect.

## Founder close-out (about 15 minutes)

Owner-only - needs your authenticated App Store Connect session.

App: **RestoreAssist**, bundle ID **`com.restoreassist.app`**.
Start here: **https://appstoreconnect.apple.com/apps** and select RestoreAssist, then the version you are submitting.

Work down this list and record the value in the right-hand column.

| # | Field / check | Where | Value or state observed |
|---|---|---|---|
| 1 | Version string and build number being submitted | App Store Connect, top of the version page | |
| 2 | App name (30 char limit) | App Information | |
| 3 | Subtitle (30 char limit) | version page | |
| 4 | Promotional text (170 char limit) | version page | |
| 5 | Description (4000 char limit) | version page | |
| 6 | Keywords (100 char limit) | version page | |
| 7 | Support URL - must resolve | version page | |
| 8 | Marketing URL - must resolve (or be blank) | version page | |
| 9 | Screenshots present for **every** required device class (6.9" and 6.5" iPhone, plus 13" iPad if iPad is a supported destination) | Media Manager | |
| 10 | Screenshots show the **app**, not the marketing site (see warning above) | Media Manager | |
| 11 | No pricing or external-purchase screenshot in the iOS set (guideline 3.1.1) | Media Manager | |
| 12 | Privacy nutrition answers complete - App Privacy section shows no "Get Started" prompt | App Privacy | |
| 13 | Privacy policy URL set and resolving | App Privacy | |
| 14 | Age rating questionnaire completed | App Information | |
| 15 | Version state (target: "Ready for Submission" or "Waiting for Review") | top of version page | |
| 16 | Open App Review blockers = 0, or each linked to a closed issue | Resolution Center | |

### Google Play, if you are submitting both

Play Console: **https://play.google.com/console** - app `com.restoreassist.app`.
The four text fields and the graphics above can be pasted straight from `ops/fastlane/metadata/android/en-AU/`. They are already within Play's limits, but `short_description.txt` has only 2 characters of headroom, so do not append to it.

<!-- PASTE EVIDENCE HERE: the completed table plus a screenshot or export showing the version state -->

## PM Decision

Keep this criterion fail-closed until current App Store Connect evidence is attached. Do not flip on the strength of "runbooks exist" or "fastlane metadata exists" - the fastlane directory is Play-only and uploads nothing.

To mark PASS: set `status: pass` and `verified: <YYYY-MM-DD>` after the table is filled in. Commit the same day.
