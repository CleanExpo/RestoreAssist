# Mobile Release Runbook — RestoreAssist iOS + Android

**Owner:** Phill McGurk
**Created:** 2026-04-26
**App:** RestoreAssist (Capacitor wrapping `https://restoreassist.app`)
**Bundle ID:** `com.restoreassist.app` (both stores)
**Linked Linear:** RA-1728 (mobile launch — created with this PR)

> **Hard rule — anything that touches Apple's or Google's submit
> button is owner-only.** This runbook prepares everything around
> that button. Claude does NOT enter Apple ID / Google account
> credentials, accept developer agreements, enter payment info, or
> click Submit for Review.

---

## 0. State of the world (audited 2026-04-26)

| Item                     | State                                                                        | File                                    |
| ------------------------ | ---------------------------------------------------------------------------- | --------------------------------------- |
| Stack                    | Capacitor 8.3.0 wrapping the deployed Next.js app                            | `capacitor.config.ts`                   |
| iOS bundle id            | `com.restoreassist.app`                                                      | `ios/App/App.xcodeproj`                 |
| Android applicationId    | `com.restoreassist.app`                                                      | `android/app/build.gradle`              |
| iOS signing pipeline     | Wired (Fastlane gym → TestFlight) — secrets-driven                           | `.github/workflows/ios-release.yml`     |
| Android signing pipeline | Wired (Gradle bundleRelease → Play internal track) — secrets-driven          | `.github/workflows/android-release.yml` |
| App icons                | [PASS] Generated 2026-04-26 (1024×1024 + adaptive layers + Play feature graphic) | `distribution/icon-source/out/`         |
| Store listing copy       | [PASS] Refreshed 2026-04-26 (S500:2021, removed QBCC-only)                       | `distribution/store-listings.md`        |
| Privacy disclosures      | [PASS] Drafted 2026-04-26                                                        | `distribution/PRIVACY_DISCLOSURES.md`   |
| Screenshots              | [WARN] Capture script ready; operator runs against sandbox                       | `distribution/capture-screenshots.mjs`  |
| Privacy policy live URL  | [PASS] `app/privacy/page.tsx`                                                    | live on prod                            |
| Terms live URL           | [PASS] `app/terms/page.tsx`                                                      | live on prod                            |

---

## 1. Pre-flight (do once)

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                              | Where                                                     | Done? |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----- |
| 1.1 | Apple Developer Program enrolment active ($99/yr)                                                                                                                                                                                                                                                                                                                                                 | https://developer.apple.com/account                       | [ ]     |
| 1.2 | Google Play Console developer account active ($25 one-time)                                                                                                                                                                                                                                                                                                                                       | https://play.google.com/console                           | [ ]     |
| 1.3 | Apple Distribution certificate generated + .p12 exported                                                                                                                                                                                                                                                                                                                                          | Keychain Access on Mac Mini                               | [ ]     |
| 1.4 | App Store Connect API key (.p8) generated, key id + issuer id captured                                                                                                                                                                                                                                                                                                                            | App Store Connect → Users and Access → Keys               | [ ]     |
| 1.5 | Android upload keystore generated (kept offline), JKS + passwords captured                                                                                                                                                                                                                                                                                                                        | `keytool -genkey ... -keystore restoreassist-release.jks` | [ ]     |
| 1.6 | Google Play service-account JSON (for the `r0adkll/upload-google-play` action) downloaded                                                                                                                                                                                                                                                                                                         | Play Console → Setup → API access                         | [ ]     |
| 1.7 | All 9 secrets added to GitHub repo Settings → Secrets and variables → Actions:<br>`IOS_CERTIFICATE_BASE64`, `IOS_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`, `APPLE_TEAM_ID`, `ASC_PRIVATE_KEY_BASE64`, `ASC_ISSUER_ID`, `ASC_API_KEY_ID`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | gh.com → Settings → Secrets                               | [ ]     |

> [WARN] For 1.3-1.6: Claude **cannot** generate any of these for you.
> They require Apple ID / Google account login and signing-key
> material that must never leave your control.

---

## 1.5 GCP project coupling (rotation hazard) — RA-3010

>  **One Google Cloud project (`292141944467`, label `restoreassist`)
> currently anchors three independent release surfaces.** Disabling any
> API on it — or rotating the project — breaks all three simultaneously.

### Consumers of GCP project `292141944467`

| Surface                                  | Where it reads                                                                         | Failure mode if project is touched                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| iOS native Google Sign-In (capgo plugin) | `ios/App/App/Info.plist` line 81 (`com.googleusercontent.apps.292141944467-…`)         | Sign-In returns immediately to the app with no token (silent failure)       |
| iOS WebView OAuth fallback (NextAuth)    | `NEXTAUTH_GOOGLE_CLIENT_ID` env (web-client ID, same project)                          | Login screen returns `redirect_uri_mismatch` (visible error)                |
| Android Play Console upload              | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` secret (service account provisioned in the project) | `r0adkll/upload-google-play` job fails with `Developer API … is disabled`   |

### Historical incidents tied to the coupling

| Date       | What broke                                                                | Linear                                   |
| ---------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| 2026-05-08 | Android pipeline outage — Play Developer API disabled on the GCP project  | run 25665767520; ticket: see RA-2997     |
| 2026-05-04 | iOS Google Sign-In silent failure post-restore                            | RA-2119 ⇄ RA-2073 (re-enabled 3 times)   |

### Long-term fix (operator action — not autonomous)

1. Provision a **dedicated** `restoreassist-oauth-prod` GCP project for the
   iOS + web OAuth clients. **Move the existing iOS client into it; rotate
   the reversed-client-ID in the plist.**
2. Provision a separate `restoreassist-play-publishing` project for the
   Google Play upload service account.
3. Each project gets one purpose. Disabling an API in one no longer takes
   down the other two.

### Short-term safeguard (already in place)

The `ios-release.yml` workflow now runs a pre-flight check that asserts
the reversed-client-ID in `Info.plist` matches the
`GOOGLE_IOS_REVERSED_CLIENT_ID` GitHub Actions environment variable. If
drift is detected — e.g., someone edits the plist by hand or copies a
staging value into prod — the build fails fast before notarisation.

To enable the safeguard, add a repo variable (NOT secret) named
`GOOGLE_IOS_REVERSED_CLIENT_ID` set to the current production value:

```
com.googleusercontent.apps.292141944467-8hhd4eub33tplq6ep5lc9iltu8jcatvp
```

Until the long-term fix lands, treat the GCP project as a shared
production resource: **do not disable APIs on it, do not delete service
accounts, do not rotate the project number**.
## 1.6 TLS pin rotation (do every ≤12 months) — RA-3001

The WebView traffic for `restoreassist.app` is pinned at the OS level on
both platforms:

- **iOS:** `ios/App/App/Info.plist` → `NSAppTransportSecurity.NSPinnedDomains`
- **Android:** `android/app/src/main/res/xml/network_security_config.xml`

Both files pin **four** SubjectPublicKeyInfo SHA-256 hashes:

1. The current leaf cert for `restoreassist.app`
2. The Let's Encrypt **R12** intermediate (issuing CA for our leaf)
3. The Let's Encrypt **R10** intermediate (rotation backup)
4. The Let's Encrypt **R11** intermediate (rotation backup)

### When to rotate

Let's Encrypt rotates intermediates every few years. The current pin set
expires (Android `expiration="2027-05-12"`) one year from the PR landing
date. **Rotate pins ≥30 days before the cert chain changes** or the app
will brick on the next renewal.

Signals to start a rotation:
- LE announces a new intermediate rollout (subscribe to
  [letsencrypt.org/upcoming-changes](https://letsencrypt.org/upcoming-changes/))
- Sentry breadcrumbs show clusters of `SSLHandshakeException` /
  `NSURLErrorServerCertificateUntrusted` from production builds
- Android `pin-set expiration` is within 90 days

### How to rotate

```bash
# 1. Compute the current leaf SPKI hash
echo | openssl s_client -servername restoreassist.app -connect restoreassist.app:443 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary | openssl enc -base64

# 2. Compute backup intermediate SPKI hashes (R10/R11/R12 — or whichever
#    LE is currently rotating between)
for url in https://letsencrypt.org/certs/2024/r10.pem \
          https://letsencrypt.org/certs/2024/r11.pem \
          https://letsencrypt.org/certs/2024/r12.pem; do
  curl -sf "$url" | openssl x509 -pubkey -noout \
    | openssl pkey -pubin -outform DER \
    | openssl dgst -sha256 -binary | openssl enc -base64
done

# 3. Update the 4 pins in BOTH files (iOS + Android)
# 4. Bump pin-set expiration on Android by +12 months
# 5. Bump app version, build, submit
```

### Verify pinning works (MITM test)

Use `mitmproxy` with `--ssl-insecure` to present a different cert to the
app. Both platforms must **fail** the connection. After confirming the
fail path, restore the real cert and confirm normal traffic flows.

> [WARN] Pinning is fail-closed by design. If you ship wrong hashes the app
> can't reach `restoreassist.app` at all — there is no fallback.
> Verification by mitmproxy before submission is mandatory.

---

## 2. App Store Connect — create the app entry

App Store Connect → My Apps → ＋ → New App.

| Field            | Value                   | Source                           |
| ---------------- | ----------------------- | -------------------------------- |
| Platform         | iOS                     | —                                |
| Name             | RestoreAssist           | `distribution/store-listings.md` |
| Primary Language | English (Australia)     | —                                |
| Bundle ID        | `com.restoreassist.app` | matches Xcode                    |
| SKU              | `restoreassist-au-001`  | any unique value                 |
| User Access      | Full access             | —                                |

| #   | Item                                                                                                                                                                | Done? |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 2.1 | App created in App Store Connect                                                                                                                                    | [ ]     |
| 2.2 | App Information → Subtitle = "Water Damage Compliance"                                                                                                              | [ ]     |
| 2.3 | App Information → Category = Business / Productivity                                                                                                                | [ ]     |
| 2.4 | App Information → Privacy Policy URL = `https://restoreassist.app/privacy`                                                                                          | [ ]     |
| 2.5 | App Privacy → Privacy Nutrition Labels — copy from `distribution/PRIVACY_DISCLOSURES.md` § "App Store Connect"                                                      | [ ]     |
| 2.6 | Pricing and Availability → Free, AU + NZ markets only for V1                                                                                                        | [ ]     |
| 2.7 | App Review Information → Sign-in required = Yes; provide demo account creds (DO NOT use real pilot creds — provision a `reviewer@restoreassist.app` test workspace) | [ ]     |

---

## 3. Google Play Console — create the app entry

Play Console → All apps → Create app.

| Field            | Value                                                   |
| ---------------- | ------------------------------------------------------- |
| App name         | RestoreAssist                                           |
| Default language | English (Australia) – en-AU                             |
| App or game      | App                                                     |
| Free or paid     | Free                                                    |
| Declarations     | acknowledge Developer Program Policies + US export laws |

| #    | Item                                                                                                                                                                      | Done? |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 3.1  | App created in Play Console                                                                                                                                               | [ ]     |
| 3.2  | Setup → App content → Privacy policy = `https://restoreassist.app/privacy`                                                                                                | [ ]     |
| 3.3  | Setup → App content → App access → "All functionality is available without special access" — **NO**: provide reviewer creds (same `reviewer@restoreassist.app` from §2.7) | [ ]     |
| 3.4  | Setup → App content → Ads = "No, my app does not contain ads"                                                                                                             | [ ]     |
| 3.5  | Setup → App content → Content rating → answer questionnaire (`distribution/store-listings.md` § Content Rating)                                                           | [ ]     |
| 3.6  | Setup → App content → Target audience → 18+ (professional tool)                                                                                                           | [ ]     |
| 3.7  | Setup → App content → News app declaration = No                                                                                                                           | [ ]     |
| 3.8  | Setup → App content → COVID-19 contact tracing = No                                                                                                                       | [ ]     |
| 3.9  | Setup → App content → Data safety → copy from `distribution/PRIVACY_DISCLOSURES.md` § "Google Play Console — Data Safety"                                                 | [ ]     |
| 3.10 | Setup → App content → Government apps = No                                                                                                                                | [ ]     |
| 3.11 | Setup → App content → Financial features = No (Stripe payment is processing only, not a financial product)                                                                | [ ]     |
| 3.12 | Setup → App content → Health = No                                                                                                                                         | [ ]     |
| 3.13 | Setup → Store settings → App category = Business                                                                                                                          | [ ]     |

---

## 4. Store listing assets

| #   | Item                                                                                               | Source                                                                                      | Done? |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----- |
| 4.1 | App icon (App Store): 1024×1024 PNG, no alpha — operator-supplied artwork as-is, locked 2026-04-26 | `distribution/icon-source/out/ios-1024.png`                                                 | [ ]     |
| 4.2 | App icon (Play): 512×512 PNG                                                                       | `distribution/icon-source/out/android-512.png`                                              | [ ]     |
| 4.3 | Adaptive icon (Play, internal — synced via `npx cap sync android`)                                 | `mobile/assets/adaptive-icon.png` + `distribution/icon-source/out/adaptive-{fg,bg}-432.png` | [ ]     |
| 4.4 | Feature graphic (Play): 1024×500 PNG                                                               | `distribution/icon-source/out/android-feature-graphic.png`                                  | [ ]     |
| 4.5 | Screenshots — captured + uploaded                                                                  | run `node distribution/capture-screenshots.mjs` against the sandbox                         | [ ]     |
| 4.6 | Promotional text (App Store, 170 chars max)                                                        | `distribution/store-listings.md` § Promotional Text                                         | [ ]     |
| 4.7 | Description (both stores)                                                                          | `distribution/store-listings.md` § Full Description                                         | [ ]     |
| 4.8 | Keywords (App Store, 100 chars max)                                                                | `distribution/store-listings.md` § Keywords                                                 | [ ]     |
| 4.9 | What's new (release notes)                                                                         | `distribution/whatsnew/whatsnew-en-AU`                                                      | [ ]     |

---

## 5. Build + upload

> **First build is owner-driven once Apple/Google IDs exist.** Once
> the GitHub Actions secrets from §1.7 are in place, every subsequent
> build runs automatically on tag push.

```bash
# Bump version on main first.
# iOS: ios/App/App.xcodeproj/project.pbxproj → CFBundleShortVersionString + CFBundleVersion
# Android: android/app/build.gradle → versionCode + versionName

# Tag + push — fires both workflows.
git tag v1.0.0
git push origin v1.0.0
```

| #   | Item                                                                                                         | Done? |
| --- | ------------------------------------------------------------------------------------------------------------ | ----- |
| 5.1 | iOS — `.github/workflows/ios-release.yml` finishes green; build appears in TestFlight                        | [ ]     |
| 5.2 | iOS — Internal testers added in App Store Connect → TestFlight; install on a real device                     | [ ]     |
| 5.3 | Android — `.github/workflows/android-release.yml` finishes green; AAB appears in Play Console internal track | [ ]     |
| 5.4 | Android — Internal tester opt-in URL distributed; install on a real device                                   | [ ]     |

---

## 6. Soft launch — internal testing only

Both stores support a closed-testing tier before public release.
Use it for the same 3 pilots (Beyond Clean / Elite / CRSA) as the
Phase 5 cutover.

### App Store — TestFlight

| #   | Item                                                                                       | Done? |
| --- | ------------------------------------------------------------------------------------------ | ----- |
| 6.1 | TestFlight → Internal Testing → add the 3 pilot owner emails                               | [ ]     |
| 6.2 | TestFlight → External Testing (optional, requires Apple review) — defer to V1.1            | [ ]     |
| 6.3 | Each pilot installs the build, completes the smoke (login → inspection → assessment → PDF) | [ ]     |

### Google Play — Internal Testing track

| #   | Item                                                                                                                 | Done? |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----- |
| 6.4 | Play Console → Testing → Internal testing → create release; add the 3 pilot owner Google accounts to the tester list | [ ]     |
| 6.5 | Distribute the opt-in URL; pilots accept; install via Play Store                                                     | [ ]     |
| 6.6 | Each pilot completes the same smoke as 6.3                                                                           | [ ]     |

---

## 7. Public production submission (only after §6 green for 7 days)

| #   | Item                                                                                   | Done? |
| --- | -------------------------------------------------------------------------------------- | ----- |
| 7.1 | App Store Connect → Submit for Review → answer all reviewer questions truthfully       | [ ]     |
| 7.2 | Apple review window (~24-48h typical for first submission, sometimes longer) — monitor | [ ]     |
| 7.3 | If rejected: read the rejection note, fix, resubmit. Common pitfalls below.            | [ ]     |
| 7.4 | Play Console → Production → create release → roll out to 100% of AU + NZ markets       | [ ]     |
| 7.5 | Play review window (~few hours to 7 days for first submission) — monitor               | [ ]     |

### Common rejections + fixes

- **App Store: "App icon shows transparency"** — our icon is opaque-flattened; if rejected, re-run `node distribution/icon-source/build-icons.mjs` and confirm `flatten()` ran.
- **App Store: "App icon shouldn't include the device frame / shadow / drop"** — our icon (silver disc + brushed metal rim) is intentionally a coin-style brand asset. If reviewers flag the textured-grey backdrop in the rounded corners, regenerate via the build-icons script with a circular mask onto `#050505` (the alternate variant logic is in git history at commit before 2026-04-26 — restore via `git show <prev>:distribution/icon-source/build-icons.mjs`).
- **App Store: "Login required, no demo account"** — fix in §2.7.
- **App Store: "Privacy policy doesn't match nutrition labels"** — re-audit `app/privacy/page.tsx` against `distribution/PRIVACY_DISCLOSURES.md`.
- **Play: "Data Safety incomplete"** — every Yes in `distribution/PRIVACY_DISCLOSURES.md` § Data Safety must have a purpose selected; tick "Account management" + "App functionality" everywhere.
- **Play: "App access requires login but no creds provided"** — fix in §3.3.

---

## 8. Post-launch

| #   | Item                                                                                     | Done? |
| --- | ---------------------------------------------------------------------------------------- | ----- |
| 8.1 | App Store Connect → Analytics → enable App Store Analytics                               | [ ]     |
| 8.2 | Play Console → Statistics → enable Play Console reports                                  | [ ]     |
| 8.3 | Linear ticket for V1.1 mobile follow-ups (offline mode polish, push notifications, etc.) | [ ]     |
| 8.4 | Day-7 retro lessons → memory file (`feedback_mobile_release_lessons.md`)                 | [ ]     |

---

## What Claude prepared for you

Already on `main` (or in the PR introducing this runbook):

- **Real app icons** at every size both stores need
- **CI workflows hardened** against secret-injection
- **Store listing copy** refreshed for S500:2021 + national scope (not QBCC-only)
- **Privacy nutrition labels + data-safety form content** drafted truthfully against the actual data flows
- **Screenshot capture script** that drives the sandbox at all 7 required device sizes
- **This runbook**

## What Claude did NOT do (and won't, per security rules)

- Apple Developer Program enrolment / payment
- Google Play Console enrolment / payment
- Generate signing certs, keystores, or .p12 / .p8 / .jks files
- Add GitHub Actions secrets
- Login to Apple ID / Google account
- Accept the developer agreements
- Click Submit for Review
- Trawl email for any of the above
