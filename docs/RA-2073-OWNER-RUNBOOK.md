# RA-2073 — Sign in with Apple + Universal Links: owner runbook

**Status as of 2026-05-08:** Code shipped. Vercel + Apple Developer portal config in progress. App is live on the App Store (build 1.0(10)) but Google + Apple sign-in are gated off on iOS until this work completes — see [RA-2073](https://linear.app/unite-group/issue/RA-2073).

This runbook is the paste-ready completion checklist for the remaining owner-only steps. The Linear ticket and parent docs ([docs/IOS_SIGN_IN_WITH_APPLE.md](IOS_SIGN_IN_WITH_APPLE.md), [docs/IOS_UNIVERSAL_LINKS.md](IOS_UNIVERSAL_LINKS.md)) are the authoritative references; this file is the short, ordered version.

## Already done (2026-05-08, this session)

- [x] **AASA file is being served** at `https://restoreassist.app/.well-known/apple-app-site-association` (200, `application/json`, no redirect chain) — verified with `curl -i`
- [x] **`APPLE_TEAM_ID=L3TJL6HUJ7`** added to Vercel production (visible in `vercel env ls production`)
- [x] **`com.restoreassist.app` identifier — Associated Domains capability** ticked (per user, 2026-05-08)

## Remaining steps — in order

### 1. Tick Sign in with Apple on the App ID (~2 min)

In your normal browser (not headless):

1. Go to <https://developer.apple.com/account/resources/identifiers/list>
2. Click `com.restoreassist.app`
3. Scroll to capabilities — tick **Sign In with Apple**
4. Click **Save** (top right) — confirm in dialog

**Verify:** the "Sign in with Apple" row should now show "Configured" / "Enabled".

### 2. Create the Services ID (~5 min)

The Services ID is the value that becomes `APPLE_CLIENT_ID` in Vercel. It's the public identifier that next-auth's Apple provider uses to talk to Apple's OAuth endpoint.

1. Go to <https://developer.apple.com/account/resources/identifiers/list>
2. Filter by type: **Services IDs** (top right dropdown)
3. Click **`+`** (Register a new identifier)
4. Choose **Services IDs** → Continue
5. Description: `RestoreAssist Sign in with Apple`
6. Identifier: `com.restoreassist.signin` ← exactly this string
7. Continue → Register
8. Click the new `com.restoreassist.signin` row → tick **Sign in with Apple** → **Configure**
9. Primary App ID: select `com.restoreassist.app`
10. **Domains and Subdomains:** `restoreassist.app`
11. **Return URLs:** `https://restoreassist.app/api/auth/callback/apple`
12. Save → Continue → Save

**Verify:** the Services ID detail page should show the return URL and primary App ID linked.

### 3. Generate the `.p8` key (~3 min — IMPORTANT: one-time download)

This is the **private key** Apple uses to verify our JWTs. **You can only download the .p8 file ONCE.** If you lose it, you must revoke the key + create a new one.

1. Go to <https://developer.apple.com/account/resources/authkeys/list>
2. Click **`+`** (Create a new key)
3. Key name: `RestoreAssist Sign in with Apple`
4. Tick **Sign in with Apple** → click **Configure** → Primary App ID = `com.restoreassist.app` → Save
5. Continue → Register
6. **Click `Download` immediately.** Save the `.p8` file somewhere safe (1Password / iCloud Drive secure folder). It will be named `AuthKey_XXXXXXXXXX.p8`.
7. **Note the Key ID** (10-char alphanumeric, shown above the download button) — write this down.
8. **Note your Team ID** (`L3TJL6HUJ7`) — same one already in Vercel.

**Three things you'll have when done:**
- `.p8` file path (local only, never commit, never paste anywhere)
- Key ID (10 chars, alphanumeric)
- Team ID = `L3TJL6HUJ7`

### 4. Generate the JWT locally (~2 min)

In your terminal, on a workstation where the `.p8` file lives:

```bash
# Replace KEY_ID with your 10-char Key ID, P8_PATH with the path to your downloaded .p8
node -e '
const jwt = require("jsonwebtoken");
const fs = require("fs");
const P8_PATH = "/path/to/AuthKey_XXXXXXXXXX.p8";   // ← edit
const KEY_ID  = "XXXXXXXXXX";                         // ← edit
const TEAM_ID = "L3TJL6HUJ7";                         // already known
const SERVICES_ID = "com.restoreassist.signin";       // step 2

const key = fs.readFileSync(P8_PATH);
const token = jwt.sign({}, key, {
  algorithm: "ES256",
  expiresIn: "180d",
  audience: "https://appleid.apple.com",
  issuer: TEAM_ID,
  subject: SERVICES_ID,
  keyid: KEY_ID,
});
console.log(token);
'
```

The output is one long string starting with `eyJ...`. **This is `APPLE_CLIENT_SECRET`.** It expires after 180 days — set a calendar reminder to rotate (the script is the same, fresh JWT each time).

**Don't paste the JWT in chat.** Pipe it directly to Vercel in the next step.

### 5. Add the three Apple envs to Vercel (~1 min)

In your terminal, in this worktree (`.claude/worktrees/affectionate-torvalds`):

```bash
# 5a — Services ID (PUBLIC, fine to paste)
echo "com.restoreassist.signin" | vercel env add APPLE_CLIENT_ID production --yes

# 5b — JWT (SECRET — pipe from a file, don't echo it inline)
# Save the JWT to a tempfile first, then:
vercel env rm APPLE_CLIENT_SECRET production --yes  # remove existing empty placeholder
cat /tmp/apple-jwt.txt | vercel env add APPLE_CLIENT_SECRET production --yes
shred -u /tmp/apple-jwt.txt  # securely delete tempfile

# 5c — Feature flag
vercel env rm NEXT_PUBLIC_APPLE_SIGNIN_ENABLED production --yes  # remove placeholder
echo "true" | vercel env add NEXT_PUBLIC_APPLE_SIGNIN_ENABLED production --yes
```

**Verify:**

```bash
vercel env ls production | grep APPLE
```

All four should show recent timestamps (`APPLE_TEAM_ID`, `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `NEXT_PUBLIC_APPLE_SIGNIN_ENABLED`).

### 6. Trigger redeploy

Push any change to `main` — your CI auto-deploys. Or kick a manual deploy:

```bash
vercel deploy --prod
```

**Verify after deploy:**

```bash
# Apple provider should now be registered server-side
curl -s https://restoreassist.app/api/auth/providers | jq .apple
# → { "id": "apple", "name": "Apple", ... }

# AASA should now have the team prefix
curl -s https://restoreassist.app/.well-known/apple-app-site-association | jq '.applinks.details[0].appID'
# → "L3TJL6HUJ7.com.restoreassist.app"
```

### 7. iOS Xcode entitlements (your Mac, 5 min)

Edit `ios/App/App/App.entitlements` (create if missing):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.developer.associated-domains</key>
    <array>
        <string>applinks:restoreassist.app</string>
        <string>webcredentials:restoreassist.app</string>
    </array>
</dict>
</plist>
```

In Xcode → App target → Signing & Capabilities → `+ Capability` → `Associated Domains`. Confirm both `applinks:` and `webcredentials:` rows show.

### 8. Re-enable iOS auth UI gate (one-line edit)

In `app/login/page.tsx` (and mirror in `app/signup/page.tsx`):

```diff
  useEffect(() => {
-   const onIos = isCapacitorIOS();
-   setHideThirdPartyAuth(onIos);
+   setHideThirdPartyAuth(false);
    setAuthHydrated(true);
    setRememberMe(isCapacitorIOS());
  }, []);
```

This was the gate that hid both Google + Apple buttons on iOS. With Steps 1-7 complete, removing it shows both buttons on iOS — and guideline 4.8 is satisfied because Sign in with Apple now works.

### 9. TestFlight build → App Review

- Cut a new build (1.0(11)+)
- Reuse the App Store Connect "What to Test" notes from build 1.0(10), add: "iOS now offers Continue with Google + Continue with Apple. Both land on /dashboard with a working session via Universal Links."
- Submit for review

## Verification on a real device

After App Review approves and the build installs:

1. Open the app cold (force-quit first)
2. Tap **Continue with Google** → completes OAuth → `/dashboard` with a session [PASS]
3. Sign out → tap **Continue with Apple** → ASAuthorizationController native sheet → Touch/Face ID → `/dashboard` with a session [PASS]
4. Force-quit → reopen → still signed in (RA-2074 Block 1 cookie + 90d JWT)

## When something goes wrong

- **AASA file shows old cached version** — Apple's CDN caches for 24h. Wait or force a re-validation by changing the AASA route's response shape (e.g. tweak a comment field) and redeploying.
- **Apple provider returns 401 invalid_client** — JWT is wrong. Most common: `audience` not exactly `https://appleid.apple.com`, or `subject` doesn't match the Services ID, or the .p8 was used with a different Key ID than the one in `keyid`.
- **JWT works for ~6 months then breaks** — 180d TTL expired. Re-run step 4, replace `APPLE_CLIENT_SECRET` in Vercel.
- **iOS app opens Google sign-in but stays on /login afterwards** — Universal Links not active. Usually means the entitlement didn't ship (step 7 skipped) OR `APPLE_TEAM_ID` is wrong in the AASA file (verify the curl command in step 6).

## References

- Parent post-mortem: [RA-1842](https://linear.app/unite-group/issue/RA-1842)
- This work: [RA-2073](https://linear.app/unite-group/issue/RA-2073)
- Sibling work: [RA-2074](https://linear.app/unite-group/issue/RA-2074) (Persistent sign-in — Block 1 already shipped, Blocks 2-4 deferred)
- Detail: [docs/IOS_SIGN_IN_WITH_APPLE.md](IOS_SIGN_IN_WITH_APPLE.md)
- Detail: [docs/IOS_UNIVERSAL_LINKS.md](IOS_UNIVERSAL_LINKS.md)
- AASA route source: [app/.well-known/apple-app-site-association/route.ts](../app/.well-known/apple-app-site-association/route.ts)
- NextAuth Apple provider config: [lib/auth.ts:49-66](../lib/auth.ts)
