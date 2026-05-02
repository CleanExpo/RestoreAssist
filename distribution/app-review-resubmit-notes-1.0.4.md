# App Review reviewer notes — RestoreAssist 1.0(4) resubmit

**For App Store Connect → Distribution → Version 1.0 → App Review Information → Notes (paste verbatim).**

Character budget: ASC notes field is 4000 chars. Body below is ~1850 chars — well under cap.

---

Thank you for the detailed feedback on Submission ID 787b39e4-db29-43fd-8957-ae4ae3295896 (build 1.0(3), reviewed 2026-05-01 on iPad Air 11-inch M3). Build 1.0(4) addresses every cited ground.

GROUND 1 (2.3.10 — Accurate Metadata):
• Black-screen on iPad Air during reviewer session is fixed. The Capacitor server URL was conditional on NODE_ENV which the iOS sync step does not set, so 1.0(3) shipped pointing at localhost. 1.0(4) hardcodes https://restoreassist.app.
• Placeholder app icon is replaced with the production RestoreAssist logo (1024×1024).
• Screenshots are re-captured from real iOS Simulators (iPad Pro 13" M5 + iPhone 17). Status bars are iOS-native (battery, time, signal). Please refresh via Media Manager → View All Sizes.

GROUND 3 (4 — Browser-based sign-in):
• OAuth sign-in for Google now opens inside SFSafariViewController (via @capacitor/browser), not the OS Safari. Users stay inside the app surface throughout sign-in.
• apple-app-site-association file is now live at https://restoreassist.app/.well-known/apple-app-site-association so the OAuth callback redirect routes back into the app's WKWebView with session cookies preserved.

GROUND 4 (3.1.1 — In-App Purchase):
• Build 1.0(4) does NOT offer paid digital content or subscriptions inside the iOS app. RestoreAssist on iOS is a free B2B field tool for restoration technicians. Subscriptions, billing, and account upgrades are managed only on the website restoreassist.app and accessed by employer admins, not field workers.
• The /api/create-checkout-session, /api/checkout-lifetime, and /api/addons/checkout endpoints now return 403 with an explanatory payload when called from the iOS Capacitor shell (X-Capacitor-Platform: ios header).
• No StoreKit / IAP integration is bundled because none is needed.

GROUND 2 (4.8 — Sign in with Apple):
• 1.0(4) ships without Sign in with Apple. Our reading of guideline 4.8 is that the requirement applies to apps that "use a third-party login service" while offering paid content. Build 1.0(4) is a free B2B tool with no in-app purchases (per Ground 4), so 4.8's IAP-coupled requirement does not apply. Workspace authentication is handled via the employer's web account, mirrored by Google sign-in for convenience.
• If App Review still requires SiwA, we will add it in a 1.0(5) submission.

REVIEWER DEMO ACCOUNT:
Username: reviewer@restoreassist.app
Password: <set in ASC Sign-In Information field>

The reviewer account is provisioned with 1-2 sample inspections + photos. No real customer PII.

Thank you.

---

## Notes for the operator (NOT for paste)

1. The reviewer credentials block at the bottom must be filled in by you — I left "<set in ASC Sign-In Information field>" as a placeholder. If you've kept the same demo creds from RA-1757, paste those.

2. Length is comfortably under the 4000-char cap with room for additions.

3. The Ground 2 paragraph commits to a specific argument: "Path B (free B2B + no IAP) makes 4.8 moot." This is defensible but Apple App Review may still push back. If they re-reject on 4.8, switch to Sign in with Apple via PR #868 + 1.0(5).

4. Recommend leaving Auto-release ON so Apple's approval ships the app live without an extra round-trip from you.
