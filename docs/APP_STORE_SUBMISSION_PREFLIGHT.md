# App Store Submission Pre-Flight Checklist

> **Authority:** [RA-2117](https://linear.app/unite-group/issue/RA-2117) — canonical reference for every future RestoreAssist resubmission cycle. Derived from RA-1842 post-mortem + 2026 App Store rejection data (40%+ of first submissions rejected — most preventable).

App is **LIVE as of 2026-05-08 (build 1.0(10))**. This checklist applies to every future update submission.

---

## Pre-submission checklist (run before every build submission)

### Category 1 — Metadata (Guideline 2.3.10)

- [ ] Screenshots captured via `xcrun simctl screenshot` only — no browser chrome, no non-iOS status bars
- [ ] All 4 device-size tiles updated in Media Manager ("View All Sizes")
- [ ] Screenshots match exactly what's in the current build — no coming-soon features shown
- [ ] App name is descriptive but not keyword-stuffed
- [ ] Description describes what the app does TODAY — not future roadmap
- [ ] No copyrighted images, logos, or branding in screenshots without permission

### Category 2 — Privacy & Tracking (Guideline 5.1)

- [ ] Every device permission has a clear `NSUsageDescription` in Info.plist (camera, location, microphone, contacts)
- [ ] Privacy Policy URL populated in App Store Connect (App Privacy section)
- [ ] If any analytics SDK (Google, Firebase, etc.) is used — App Tracking Transparency prompt implemented
- [ ] Privacy Nutrition Labels match actual data collection

### Category 3 — UI/UX (Guidelines 4.0, 4.3)

- [ ] No placeholder text or "Coming Soon" screens visible to reviewers
- [ ] Demo account credentials provided in App Review Notes (if login required)
- [ ] OAuth flows use `@capacitor/browser` (SFSafariViewController) — NOT external Safari (Guideline 4.0 UX)
- [ ] Sign in with Apple present wherever Google/Microsoft OAuth is offered (Guideline 4.8)
- [ ] Follows Human Interface Guidelines — standard navigation patterns, accessible colours

### Category 4 — Performance (Guideline 2.1)

- [ ] Tested on real device (not just Simulator) before submission
- [ ] Tested on older devices (iPad Air, iPhone base model) — not just Pro Max
- [ ] App does not crash or freeze within first 30 seconds
- [ ] Network failures show error states — not blank screens
- [ ] Battery/location profiled with Xcode Instruments — no runaway processes

### Category 5 — Business Model (Guideline 3.1.1)

- [ ] **Path B confirmed**: iOS app is free field tool — ALL subscriptions/billing managed on `web.restoreassist.app` only
- [ ] No iOS WebView surfaces expose paid subscription CTAs
- [ ] IAP flag: `NEXT_PUBLIC_IS_IOS_SHELL=true` correctly gates billing UI

### Category 6 — CI/CD hygiene

- [ ] All changes committed and pushed — no local-only edits
- [ ] Build goes through `ios-release.yml` CI — no manual Xcode Archives
- [ ] `capacitor.config.ts` has `process.env.CAPACITOR_WEBVIEW_URL` hardcoded to production URL
- [ ] Xcode asset catalog (`ios/App/App/Assets.xcassets`) updated — not just `/distribution/icon-source/`

---

## Post-rejection protocol

1. Read rejection email carefully — copy verbatim into new Linear ticket (don't paraphrase)
2. Identify guideline number (e.g., 2.3.10, 4.8, 3.1.1)
3. Check this checklist against that category
4. Fix in code → commit → push → CI build → TestFlight → resubmit
5. If unclear: use App Review Resolution Centre (in App Store Connect) to ask Apple directly
6. Appeal (Resolution Centre) only as last resort — reviewers differ, resubmission is faster

---

## Key contacts / resources

- App Store Connect: <https://appstoreconnect.apple.com>
- Apple Review Guidelines: <https://developer.apple.com/app-store/review/guidelines/>
- Human Interface Guidelines: <https://developer.apple.com/design/human-interface-guidelines>
- Apple correspondence mailbox: `airestoreassist@gmail.com` — forward to `phill.mcgurk@gmail.com`

---

## Related

- [RA-1842](https://linear.app/unite-group/issue/RA-1842) — post-mortem: 4 rejection grounds from first cycle
- [RA-1955](https://linear.app/unite-group/issue/RA-1955) — screenshot capture recipe
- [RA-2074](https://linear.app/unite-group/issue/RA-2074) — persistent sign-in (current post-launch priority)
- [RA-2117](https://linear.app/unite-group/issue/RA-2117) — this checklist's Linear ticket
