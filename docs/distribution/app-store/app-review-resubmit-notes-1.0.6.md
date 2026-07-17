# App Review reviewer notes — RestoreAssist 1.0(6) resubmit

**For App Store Connect → Distribution → Version 1.0 → App Review Information → Notes (paste verbatim).**

Character budget: ASC notes field is 4000 chars. Body below is ~2400 chars.

---

Thank you for the detailed feedback. Build 1.0(6) addresses all grounds raised on the 1.0(4) review.

GROUND 1 (2.1(a) — "did not proceed into the app when we tried to Continue with Apple"):
The Sign in with Apple button has been removed from the iOS Capacitor shell. Build 1.0(4) shipped with a half-implemented Apple OAuth flow whose NextAuth callback redirected back to /login instead of /dashboard. Rather than ship a partial fix, 1.0(6) hides BOTH third-party login options (Google AND Apple) inside the iOS Capacitor shell. Web users still see them; iOS reviewers and end-users see only email / password sign-in.

Implication for guideline 4.8: 4.8 mandates Sign in with Apple "if your app uses a third-party or social login service". With NO third-party login offered on iOS, 4.8 does not apply. The full Sign in with Apple integration will return in a 1.0.x follow-up once the OAuth callback is fixed and re-tested end-to-end.

GROUND 2 (2.1(b) — "an error prompt appeared when we tried to subscribe to the subscription"):
Build 1.0(4) had subscribe / upgrade UI that was server-blocked but not client-hidden. Tapping a subscribe button hit /api/create-checkout-session, which returned a 403 error (the platform-aware billing guard), and the resulting error toast is what App Review saw.

1.0(6) wraps every subscribe surface in <BillingGate> — a client-side component that detects the iOS Capacitor shell and replaces the subscribe UI with a friendly placeholder ("Billing happens on the website") that links to https://restoreassist.app/pricing. Surfaces wrapped: /dashboard/pricing, /dashboard/subscription, and the trial-urgency banner that previously appeared on every dashboard page. No subscribe button is reachable inside the iOS app in 1.0(6), so the error prompt cannot occur.

Per guideline 3.1.1: RestoreAssist on iOS does not offer paid digital content or subscriptions. Subscriptions and billing are managed only on the website, accessed by the workspace owner / admin (not by the field technicians who use the iOS app). No StoreKit / IAP integration is bundled because none is needed.

REVIEWER DEMO ACCOUNT:
Username: reviewer@restoreassist.app
Password: see Sign-In Information field above (rotated 2026-05-04)

The reviewer account was re-provisioned against the production database on 2026-05-04 and is on a 30-day TRIAL with 30 AI credits + 30 quick-fill credits. Sample inspections are pre-loaded with fake AU addresses. No real customer PII.

If a build verification step would help, we are happy to provide a short Loom walkthrough on request.

Thank you.

---

## Notes for the operator (NOT for paste)

1. Update Sign-In Information password before submit. The reviewer account password was rotated by `scripts/provision-reviewer-account.ts` on 2026-05-04. The string "see Sign-In Information field above" assumes you've already pasted the freshly rotated password into the Password field next to reviewer@restoreassist.app. **Do not** submit with the old `KB4^QLxy^mb!%EK4&xj6` value — it no longer authenticates.

2. Build number is 1.0(6). 1.0(5) was canceled-as-uncancellable (see thread on submission 787b39e4); ASC won't accept a re-upload of any consumed build number, so 1.0(6) is the next valid identifier.

3. Code changes shipped in 1.0(6):
   - `app/login/page.tsx` + `app/signup/page.tsx` — third-party auth buttons gated by `isCapacitorIOS()` (web behaviour unchanged)
   - `app/dashboard/pricing/page.tsx` + `app/dashboard/subscription/page.tsx` — wrapped in `<BillingGate>` so iOS users see "Billing happens on the website" placeholder instead of subscribe buttons
   - `components/TrialBanner.tsx` — early-return null when `isCapacitorIOS()` so the urgency banner with its "Upgrade now" CTA never renders inside the iOS shell
   - `ios/App/App.xcodeproj/project.pbxproj` — `CURRENT_PROJECT_VERSION` 5 → 6

4. Recommend leaving Auto-release ON.
