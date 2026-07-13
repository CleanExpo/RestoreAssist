# App Review reviewer notes — RestoreAssist 1.0.5(16) resubmit

**For App Store Connect → Distribution → Version 1.0 → App Review Information → Notes (paste verbatim).**

Character budget: ASC notes field is 4000 chars. Body below is ~2400 chars.

---

Build 1.0.5(16) is a UX fix on top of 1.0.4(15). No new entitlements, no new permission strings, no new third-party libraries.

CHANGED IN THIS BUILD:

1. Sign in with Apple button now renders inside the iOS Capacitor shell.

The previous build gated the button on a build-time env flag (NEXT_PUBLIC_APPLE_SIGNIN_ENABLED) that controls the WEB AppleProvider (which needs APPLE_CLIENT_ID + APPLE_CLIENT_SECRET on the server). The native iOS plugin (@capgo/capacitor-social-login) does NOT need those secrets — it verifies the identity JWT against Apple's JWKS directly inside the WKWebView. The button is now shown unconditionally on iOS, while remaining flag-gated on the web. Apple guideline 4.8 is satisfied as before: Sign in with Apple is offered as a peer button to Google, equally prominent.

2. Email/password account creation now works on iOS.

Build 1.0.3..1.0.4 auto-redirected iOS users from /signup to /login on the assumption that new iOS users would only sign up via OAuth. Combined with the hidden Apple button (item 1), this left iOS-only users with no way to create an account at all if they declined Google. /signup now renders normally on iOS with the same email + password + Terms-of-Service flow as the web. After successful registration, the app credentials-signs-in and lands on the dashboard.

3. The "Sign up for free" link on /login no longer hides on iOS — it pairs with item 2.

REVIEWER TEST PATHS (all three on the same iOS build):

A. Apple Sign-In: Open the app → /login → tap "Continue with Apple". The iOS Sign in with Apple sheet appears via ASAuthorizationController. Choose "Continue with Email" or "Hide My Email" — both branches work. The app navigates to /dashboard with a logged-in session.

B. Google Sign-In: Open the app → /login → tap "Continue with Google". The iOS Google sign-in sheet appears (native GIDSignIn, not SFSafariViewController). Pick an account → /dashboard with a logged-in session.

C. Email/password: Open the app → /login → tap "Sign up for free" → fill name, email, password (12+ chars), tick the Terms checkbox → "Create Account". Account is created, auto-signs in, lands on /dashboard. The session cookie is set inside the WKWebView (NextAuth Credentials provider, not third-party redirect).

ARCHITECTURE NOTES (unchanged from 1.0.4(15)):

- Native plugin: @capgo/capacitor-social-login (Capacitor 8 compatible).
- Token exchange: POST /api/auth/native-token-exchange (from inside WKWebView, so Set-Cookie lands in the correct cookie jar — this is the architectural fix that ended the 1.0.1..1.0.2 SFSafariViewController loop).
- Apple identity JWT verified against https://appleid.apple.com/auth/keys (audience = bundle ID com.restoreassist.app).
- Google identity JWT verified against Google's JWKS (audience = iOS OAuth client ID).
- Replay protection: SHA-256-hashed nonce per request, verified server-side.

REVIEWER DEMO ACCOUNT:
Username: reviewer@restoreassist.app
Password: (provided via the existing App Review Information field in App Store Connect)

If the reviewer prefers to exercise the new-user signup path with a throwaway account, please use a unique email — the demo account above is shared.
