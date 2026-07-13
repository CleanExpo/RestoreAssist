# App Review reviewer notes — RestoreAssist 1.0(5) resubmit

**For App Store Connect → Distribution → Version 1.0 → App Review Information → Notes (paste verbatim).**

Character budget: ASC notes field is 4000 chars. Body below is ~2000 chars.

---

Thank you for the detailed feedback on Submission ID 787b39e4-db29-43fd-8957-ae4ae3295896. Build 1.0(5) addresses every cited ground.

GROUND 1 (2.1(a) — black screen on iPad Air 11-inch M3):
The Capacitor server URL was conditional on NODE_ENV, which the iOS sync step does not set, so earlier builds shipped pointing at localhost:3000 inside the WKWebView. The URL is now hardcoded to https://restoreassist.app in capacitor.config.ts (committed before this build). The WebView reaches the production app on launch, the splash transitions into the dashboard, no black screen.

GROUND 2 (2.3.8 — placeholder app icons):
The previous icon (a metallic disc with the wordmarks "RestoreAssist" and "RESTORATION INTELLIGENCE" inside it) has been replaced. The new icon is a flat brand mark — a white house outline with a copper magnifying-glass overlay and two foundation arcs — on a solid #1C2E47 brand-navy background. No text inside the icon (per HIG icon guidance). The same mark is used at every required size: ASC 1024×1024, all native iOS asset catalog entries, and the Capacitor splash screen. The launch splash has also been refreshed to the same brand mark on navy so the launch experience is consistent with the home-screen icon.

GROUND 3 (2.3.10 — non-iOS status bar in screenshots):
All screenshots in App Store Connect have been replaced with iOS-native captures. The replacement set was generated from real iOS Simulator runs (or, where viewport rendering was used, captures contain no OS chrome at all). Please refresh via Media Manager → View All Sizes if any cached previews persist.

REVIEWER DEMO ACCOUNT:
Username: reviewer@restoreassist.app
Password: <set in ASC Sign-In Information field>

The reviewer account is provisioned with sample inspections and photos. No real customer PII.

If a build verification step would help, we are happy to provide a live walkthrough or a short Loom video on request.

Thank you.

---

## Notes for the operator (NOT for paste)

1. The reviewer credentials block at the bottom must be filled in by you — `<set in ASC Sign-In Information field>` is a placeholder. Reuse the demo creds from prior submissions if still valid.

2. **Screenshot strategy for this resubmit.** `distribution/capture-screenshots.mjs` produces viewport-only PNGs (no OS chrome at all) — those are App-Store-acceptable. If you prefer real iOS Simulator captures with a proper iOS status bar, run a Simulator (iPad Pro 13" + iPhone 17), install the .ipa, and use `xcrun simctl io booted screenshot`. Either is acceptable. Do NOT re-upload any image with Android nav bars, Chrome URL bars, or macOS chrome — that was the original 2.3.10 ground.

3. Build number bumped to 1.0(5). 1.0(4) was prepared (pbxproj + reviewer notes drafted) but never made it through review — re-uploading 1.0(4) is rejected by ASC because the build number is consumed. Skipping straight to 1.0(5) is intentional and correct.

4. Recommend leaving Auto-release ON so Apple's approval ships the app live without an extra round-trip from you.

5. Icon delta — the artwork is now `distribution/icon-source/icon-mark.svg` (vector, in-repo). The previous `RestoreAssist Logo.png` is preserved in the same folder for reference but is no longer the source of truth. If you ever need to regenerate icons, run `node distribution/icon-source/build-icons.mjs` and the SVG drives every output.
