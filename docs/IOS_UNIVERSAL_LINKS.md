# iOS Universal Links — setup runbook

**Filed:** 2026-05-02 alongside [PR #867](https://github.com/CleanExpo/RestoreAssist/pull/867).
**Refs:** [RA-1842](https://linear.app/unite-group/issue/RA-1842) post-mortem.

This runbook documents the one-time owner steps to wire Universal Links so the iOS app and `restoreassist.app` web behave as one identity. **Required** to close the cookie-sync gap in PR #866 (Google OAuth in `SFSafariViewController` doesn't share cookies with the parent `WKWebView`).

## What lands automatically

PR #867 ships:

- `app/.well-known/apple-app-site-association/route.ts` — serves the AASA file at `https://restoreassist.app/.well-known/apple-app-site-association` with the correct `application/json` content-type and no extension. Auto-regenerates from the `APPLE_TEAM_ID` env var.

## What needs the owner

### 1. Set `APPLE_TEAM_ID` in production env

The AASA route reads `process.env.APPLE_TEAM_ID`. Without it the file ships with a bare `com.restoreassist.app` (no team prefix) and Apple's CDN refuses to associate it with any installed app.

- **Vercel production**: project settings → Environment Variables → add `APPLE_TEAM_ID=<your team ID>`. Same value as the iOS release workflow's secret.
- **Vercel preview**: same value works fine (Apple only consumes the prod URL).

After the env is set, redeploy with build cache **off** (`feedback_vercel_env_redeploy.md` memory) so the route picks up the new value.

### 2. Add the `Associated Domains` capability in Apple Developer

- [developer.apple.com](https://developer.apple.com) → Certificates, IDs & Profiles → Identifiers → `com.restoreassist.app` → tick **Associated Domains** → save.
- Re-download the provisioning profile if your CI pins the profile by SHA (most don't — name-based pinning survives the regen).

### 3. Add the entitlement to the iOS Xcode project

Edit `ios/App/App/App.entitlements` (create if missing) and add:

```xml
<key>com.apple.developer.associated-domains</key>
<array>
    <string>applinks:restoreassist.app</string>
    <string>webcredentials:restoreassist.app</string>
</array>
```

`applinks:` enables Universal Links (the cookie-sync fix for PR #866).
`webcredentials:` enables Sign-in-with-Apple credential sharing across web + native (used by PR #868 if/when Sign in with Apple ships).

If the file doesn't exist:

```bash
# from the repo root, on a macOS dev box
cat > ios/App/App/App.entitlements <<'EOF'
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
EOF
```

Then in Xcode → App target → Signing & Capabilities → tap `+ Capability` → `Associated Domains`. Confirm both `applinks:` and `webcredentials:` show. Save the project file.

### 4. Verify the AASA file is correctly served

After PR #867 merges and Vercel redeploys with `APPLE_TEAM_ID` set:

```bash
# 1. Direct fetch — should return JSON, no redirect, application/json
curl -i https://restoreassist.app/.well-known/apple-app-site-association

# 2. Apple's validator (caches for 24h after first hit)
curl -i https://app-site-association.cdn-apple.com/a/v1/restoreassist.app

# 3. Inspect from the iOS Simulator
xcrun simctl openurl booted "https://restoreassist.app/dashboard"
# If Universal Links work, this opens the app instead of Safari.
```

### 5. Trigger a TestFlight build

Universal Links only activate after the user installs a build that has the entitlement. Re-run `ios-release.yml` to ship 1.0(4+) with the new entitlement.

## Common gotchas

- **`text/json` instead of `application/json`** — Apple rejects silently. The route handler hardcodes `application/json` so this can't drift.
- **Trailing redirect** — `https://restoreassist.app/.well-known/apple-app-site-association` MUST return 200 directly. If Vercel adds a 308 redirect anywhere in the chain (e.g. via `/.well-known/` rewrite rules), Apple's CDN gives up. Test with `curl -L -I` and ensure all hops are 200.
- **CDN caching** — Apple caches AASA for ~24h. If the file shipped wrong the first time, it stays wrong for a day even after fixing. The path is fixed by spec, no cache-busting query string.
- **Team ID format** — 10 chars, A-Z + 0-9, no hyphen. e.g. `5AB12CD34E`. NOT the bundle ID (which has dots).

## Why this PR alone doesn't unblock the cookie sync

The AASA file is the **server side** of Universal Links. Without:

1. The entitlement in `App.entitlements`
2. The `APPLE_TEAM_ID` env var on Vercel prod
3. A new TestFlight build with the entitlement installed

…iOS won't intercept `restoreassist.app/dashboard` redirects and the cookie-sync gap remains. Steps 1–3 are owner-only (Apple Developer portal + Vercel env + Xcode signing).

This PR is the prerequisite — once it's merged + the owner does steps 1–3, the cookie sync from PR #866's OAuth flow starts working immediately on the next CI build.
