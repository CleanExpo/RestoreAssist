# Sign in with Apple — setup runbook

**Filed:** 2026-05-02 alongside [PR #868](https://github.com/CleanExpo/RestoreAssist/pull/868) (draft).
**Refs:** [RA-1842](https://linear.app/unite-group/issue/RA-1842) post-mortem.

This runbook captures the one-time owner steps that turn the draft Sign-in-with-Apple PR into a shipped feature. PR #868 lands the **code** (NextAuth provider + login/signup UI buttons). The four steps below are owner-only — they touch Apple Developer portal, Vercel envs, and a JWT signing pipeline.

## What lands automatically (PR #868)

- `lib/auth.ts` — adds `AppleProvider({clientId, clientSecret})` to NextAuth, registered conditionally on `APPLE_CLIENT_ID + APPLE_CLIENT_SECRET` env vars
- `lib/oauth-native.ts` — `OAuthProvider` type extended to include `"apple"`
- `app/login/page.tsx` + `app/signup/page.tsx` — `Continue with Apple` button rendered when `NEXT_PUBLIC_APPLE_SIGNIN_ENABLED=true`. Uses `signInWithOAuth("apple", ...)` so iOS opens the flow in `SFSafariViewController` (matches Google handler)

## Why this PR ships in **draft**

Apple guideline 4.8 demands a working SiwA implementation. The code in #868 is correct but **inert** until the four owner steps below are complete. Mark Ready for Review after step 4.

## Owner steps

### 1. Enable the capability in Apple Developer portal

- [developer.apple.com](https://developer.apple.com) → Certificates, IDs & Profiles → Identifiers → `com.restoreassist.app` → Capabilities → tick **Sign In with Apple** → save.
- That action creates a **Services ID** (web identifier) automatically. Note the prompt for "primary App ID" — pick `com.restoreassist.app`.

### 2. Create a Services ID + Return URL

- Identifiers → click `+` → choose **Services IDs** → register a Services ID (e.g. `com.restoreassist.signin`).
- Configure → tick **Sign in with Apple** → primary App ID = `com.restoreassist.app`.
- Return URLs:
  - `https://restoreassist.app/api/auth/callback/apple`

This Services ID becomes `APPLE_CLIENT_ID`.

### 3. Create the .p8 key + JWT-signed client secret

Apple's "client secret" is a JWT that you sign with a private key (`.p8` file). It must be re-generated periodically (max ttl: 6 months).

- Apple Developer → Keys → register a new key with **Sign in with Apple** enabled, primary App ID = `com.restoreassist.app`. Download the `.p8` file (one-time download — store securely).
- Note the Key ID (10-char alphanumeric) and your Team ID (10 chars). 

Generate the JWT (run on a workstation; output goes into `APPLE_CLIENT_SECRET`):

```bash
node -e '
const jwt = require("jsonwebtoken");
const fs = require("fs");
const key = fs.readFileSync("./AuthKey_<KEY_ID>.p8");
const token = jwt.sign({}, key, {
  algorithm: "ES256",
  expiresIn: "180d",
  audience: "https://appleid.apple.com",
  issuer: "<TEAM_ID>",
  subject: "com.restoreassist.signin",
  keyid: "<KEY_ID>",
});
console.log(token);
'
```

The output is a long JWT string. **This is the value of `APPLE_CLIENT_SECRET`.** Note when it expires; rotate before then.

### 4. Set Vercel env vars + flip the feature flag

In Vercel project settings → Environment Variables:

| Name | Value | Notes |
|---|---|---|
| `APPLE_CLIENT_ID` | `com.restoreassist.signin` | Services ID from step 2 |
| `APPLE_CLIENT_SECRET` | `<JWT from step 3>` | rotate before 180d ttl |
| `NEXT_PUBLIC_APPLE_SIGNIN_ENABLED` | `true` | shows the UI button |

Redeploy with build cache **off** so Next picks up the env-driven button.

### 5. Verify

After redeploy:

```bash
# Provider registered server-side (no UI)
curl -s https://restoreassist.app/api/auth/providers | jq .apple
# → { "id": "apple", "name": "Apple", "type": "oauth", "signinUrl": "...", "callbackUrl": "..." }

# UI button visible
curl -s https://restoreassist.app/login | grep -c "Continue with Apple"
# → 1
```

In the iOS Simulator (after a TestFlight build with the entitlement + Universal Links from PR #867):

1. Open the app
2. Tap "Continue with Apple"
3. Apple's native sheet appears (because `webcredentials:restoreassist.app` is in `App.entitlements`, with PR #867 the bridge is in place)
4. Authenticate with Touch/Face ID
5. Land on `/dashboard` with an authenticated session

## JWT rotation

`APPLE_CLIENT_SECRET` is a 180-day JWT. Rotate before expiry:

- Re-run the `jsonwebtoken` script with the **same Services ID + Key ID + .p8** but a fresh `expiresIn`
- Update `APPLE_CLIENT_SECRET` in Vercel
- Redeploy

A reminder cron in [Pi-CEO meta-curator](https://linear.app/unite-group/issue/RA-1839) will be added to surface this 14 days before expiry.

## Common gotchas

- **JWT `aud` must be exactly `https://appleid.apple.com`** — no trailing slash, not `https://appleid.apple.com/auth/token`. NextAuth's Apple provider documentation has been wrong about this in older versions.
- **JWT `iss` is the Team ID, NOT the bundle ID.** Easy to mix up.
- **Return URL is the full callback path** including `/api/auth/callback/apple` — Apple validates the redirect against the registered URL exactly. Trailing slash matters.
- **The `.p8` file is downloaded ONCE.** Lose it and you have to revoke + recreate the key in Apple Developer.
- **Test on a real device** before the App Review submission. Simulator works for the basic flow but Touch ID / Face ID interaction is only on hardware.

## Acceptance for App Review

Apple's guideline 4.8 also requires that:

- The login option limits data collection to name + email (Apple SiwA does this by default — uses anonymous relay if user picks "Hide my email")
- The login option allows users to keep email private (Apple does this — pick "Hide my email" presents a `*@privaterelay.appleid.com` proxy address)
- The login option does NOT collect interactions for advertising without consent (Apple does not. Our backend only stores `name` + `email` from the SiwA payload)

PR #868's `AppleProvider` config receives the standard fields. No extra scope is requested. Apple's automated review should accept this.
