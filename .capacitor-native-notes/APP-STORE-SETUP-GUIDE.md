# App Store & Google Play — Complete Setup Guide

**RestoreAssist (com.restoreassist.app) + CET (com.restoreassist.cet)**
**Prepared for: First-time developer, Windows machine, Australian business**

---

## ⚠️ What needs YOUR direct action

The following steps require you to:

- Create accounts in your name
- Enter payment information
- Verify your identity with a government-issued ID

These cannot be done on your behalf. Every other step (code, configuration, CLI commands)
is handled by the SE.

---

## Step 0 — Get Your D-U-N-S Number (Do This First — Takes 5–7 Days)

Both Apple and Google require a D-U-N-S number if you're registering as a business
(recommended — so App Store shows "RestoreAssist" not your personal name).

**Action (5 minutes):**

1. Go to: https://www.dnb.com/duns-number/lookup.html
2. Search for your business name to check if one already exists
3. If not, click "Get a D-U-N-S Number" — it's free
4. Fill in: Legal entity name (as registered with ASIC/ABN), ABN, registered address
5. You'll receive the 9-digit D-U-N-S number by email within 5–7 business days

**Do this TODAY — it's the longest lead time in the whole process.**

---

## Step 1 — Apple Developer Program ($149 AUD/year)

### 1.1 Prepare your Apple ID

1. Create an Apple ID at https://appleid.apple.com (use a dedicated business email, e.g. `dev@restoreassist.com.au`)
2. **Enable two-factor authentication (2FA)** — mandatory, cannot enrol without it
   Settings → Password & Security → Two-Factor Authentication
3. Ensure your legal name on the Apple ID matches your ABN registration

### 1.2 Enrol

1. Go to: **https://developer.apple.com/programs/enroll/**
2. Sign in with your Apple ID
3. Select **"Enrol as an Organisation"** (shows business name on App Store, not personal name)
4. You'll be asked for:
   - Legal entity name (exactly as registered — ABN lookup: https://www.abr.gov.au)
   - D-U-N-S Number (from Step 0)
   - Business website (restoreassist.com.au)
   - Work email
   - ABN
5. Pay $149 AUD by credit card

**Approval time:** 3–5 business days after D-U-N-S verification

### 1.3 After approval

You'll get access to:

- **App Store Connect**: https://appstoreconnect.apple.com — where you create app listings, upload builds, manage TestFlight
- **Developer Portal**: https://developer.apple.com/account — certificates, app IDs, provisioning profiles

The SE will handle all Xcode/certificate configuration. You just need to give the SE access
to App Store Connect (invite `se@restoreassist.com.au` as Admin in Users and Access).

---

## Step 2 — Google Play Developer Account ($25 USD one-time)

### 2.1 Prepare

1. Create or use a Google account (recommend a dedicated `dev@restoreassist.com.au` Google Workspace account)
2. Have a physical Android device available (Google requires verifying via the Play Console app on an Android device)
3. Have your D-U-N-S number ready (from Step 0, if registering as organisation)

### 2.2 Register

1. Go to: **https://play.google.com/console/signup**
2. Choose **"Organisation"** account type
3. Fill in:
   - Developer name: "RestoreAssist" (this is what users see on Play Store)
   - D-U-N-S Number
   - Business website: restoreassist.com.au
   - Contact email
4. Pay $25 USD by credit card (one-time, never charged again)

**Approval time:** 1–3 business days

### 2.3 After approval

Install the Google Play Console app on your Android phone and verify the account when prompted.

---

## Step 3 — iOS Build Setup (Windows-Compatible Path)

Since you're on Windows and Xcode only runs on macOS, use **Capgo Cloud Build** —
it builds iOS apps entirely in the cloud. No Mac needed.

### 3.1 Sign up for Capgo

1. Go to: **https://capgo.app/pricing/**
2. Recommended plan: **Maker** ($33 USD/month) — 60 build minutes/month
   (each build takes ~5-8 minutes; ~8 builds/month on Maker)
3. Sign up with your developer email

### 3.2 Install Capgo CLI (SE does this)

```bash
npm install -g @capgo/cli
```

### 3.3 Generate Apple signing credentials (SE does this)

After Apple Developer account is active, the SE will:

1. Create an App Store Connect API key (Certificates, Identifiers & Profiles → Keys)
2. Create an App ID for `com.restoreassist.app` and `com.restoreassist.cet`
3. Generate distribution certificates via Capgo's tooling
4. Upload to Capgo for cloud signing

### 3.4 Build commands (SE runs these)

```bash
# Field app
npx @capgo/cli build com.restoreassist.app --platform ios --build-mode release

# CET app (from apps/cet/ with different bundle ID)
npx @capgo/cli build com.restoreassist.cet --platform ios --build-mode release
```

---

## Step 4 — Android Build Setup (Everything on Windows)

Android builds natively on Windows. The SE will handle this entirely.

### 4.1 Install Android Studio (SE does this)

Download: **https://developer.android.com/studio**
Version: 2025.2.1 or newer

### 4.2 Set environment variables (SE does this)

```
ANDROID_HOME = C:\Users\[YOUR_USERNAME]\AppData\Local\Android\Sdk
Add to PATH: %ANDROID_HOME%\tools and %ANDROID_HOME%\platform-tools
```

### 4.3 Install Android SDK components (SE does this via Android Studio SDK Manager)

- Android SDK Platform 35 (Android 15)
- Android SDK Build Tools 35.0.0
- Android Emulator (for testing)

### 4.4 Build commands (SE runs these)

```bash
# Sync web assets to Android project
cd "C:\Restore Assist"
npm run build
npx cap sync android

# Open in Android Studio for signing
npx cap open android
```

### 4.5 Create a release keystore (ONE-TIME — store safely)

```bash
keytool -genkey -v -keystore restoreassist-release.jks \
  -alias restoreassist -keyalg RSA -keysize 2048 -validity 10000
```

**⚠️ CRITICAL: Back up `restoreassist-release.jks` and its password. If you lose this file,
you can never update your app on Google Play.**

Store this file in: a password manager, Google Drive, and a USB drive.

### 4.6 Build signed AAB (SE does this in Android Studio)

Android Studio: Build → Generate Signed Bundle / APK → Android App Bundle

---

## Step 5 — Create App Listings

### Apple App Store Connect

The SE will prepare:

- App name: "RestoreAssist" / "RestoreAssist CET"
- Bundle IDs: `com.restoreassist.app` / `com.restoreassist.cet`
- Category: Business
- Description, screenshots (requires physical iOS device or Simulator on Mac)
- Age rating: 4+

**You will need to provide:**

- An iOS device OR access to a Mac with Xcode for taking App Store screenshots
  (Screenshots can also be taken in Xcode Simulator if you have Mac access)

### Google Play Console

The SE will prepare:

- App name: "RestoreAssist" / "RestoreAssist CET"
- Package names: `com.restoreassist.app` / `com.restoreassist.cet`
- Content rating questionnaire
- Privacy policy URL (must exist on restoreassist.com.au/privacy)
- App description

**New account requirement:** Before your app goes live on Google Play, you must:

1. Run a **Closed Testing** track with at least 12 testers for 14 consecutive days
2. The SE will set up the closed testing track
3. You invite 12 testers (colleagues, clients, staff) — they receive a link to opt in

---

## Step 6 — Privacy Policy

Both stores require a privacy policy. Before submitting either app, ensure:

- `https://restoreassist.com.au/privacy` returns a valid privacy policy page
- The policy covers: what data is collected, how it's used, third-party services (Cloudinary, AI providers)

The SE can draft the privacy policy content — it just needs to be published to that URL.

---

## Timeline Summary

| Action                            | Who              | When                       | Duration                        |
| --------------------------------- | ---------------- | -------------------------- | ------------------------------- |
| Request D-U-N-S Number            | You              | Day 1 (today)              | 5–7 days to receive             |
| Apple Developer enrollment        | You              | Day 1                      | Form: 20 min, then 3–5 day wait |
| Google Play enrollment            | You              | Day 1                      | Form: 20 min, then 1–3 day wait |
| Android Studio + SDK setup        | SE               | Day 1                      | 1 hour                          |
| Android AAB build + test          | SE               | Day 2                      | 2 hours                         |
| Capgo setup + iOS signing         | SE               | After Apple account active | 2 hours                         |
| iOS IPA build                     | SE               | After signing setup        | 30 min                          |
| App listings + metadata           | SE               | Day 3+                     | 3 hours                         |
| Google Play closed test (14 days) | You + 12 testers | After Android listing      | 14 days                         |
| Apple App Review                  | Automatic        | After iOS submission       | 1–3 days                        |
| **Both apps live**                | —                | ~3–4 weeks from today      | —                               |

---

## Costs Summary

| Item                                | Cost           | Frequency |
| ----------------------------------- | -------------- | --------- |
| Apple Developer Program             | ~$149 AUD      | Annual    |
| Google Play Developer               | ~$38 AUD       | One-time  |
| Capgo Maker plan (iOS cloud builds) | ~$51 AUD/month | Monthly   |
| Android builds                      | $0             | Free      |
| D-U-N-S Number                      | $0             | Free      |
| **Year 1 total**                    | ~$800 AUD      | —         |
| **Year 2+ per year**                | ~$761 AUD      | —         |

---

## What to Send the SE Once Accounts Are Active

Once you have approved developer accounts, send the SE:

**From Apple Developer:**

- App Store Connect URL: https://appstoreconnect.apple.com
- Invite the SE as Admin under Users and Access
- Or: Create an App Store Connect API key and share the `.p8` file + Key ID + Issuer ID

**From Google Play:**

- Invite SE as Admin in the Play Console (Setup → Users and Permissions)
- Or: Create a Service Account (API access) and share the JSON key file

---

## Notes

- **Two apps, two listings**: `com.restoreassist.app` (field technician app) and `com.restoreassist.cet` (client kiosk app) are separate App Store and Play Store listings with separate reviews
- **CET app distribution**: Consider Apple Business Manager or Apple Configurator for enterprise distribution of the CET iPad kiosk, which avoids App Store review for internal use
- **The field app** should be on both App Store and Google Play (technicians use both iOS and Android)
- **The CET app** is iPad-only — iOS App Store only (Android version is a future consideration)
