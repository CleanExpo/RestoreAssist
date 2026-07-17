# Play Store Upload Runbook — RestoreAssist

When `airestoreassist@gmail.com` Play Console verification clears (phone + identity), follow this runbook end-to-end.

## Step 0 — Prerequisites

- Signed AAB at `~/Documents/RestoreAssist-keystore-backup/app-release.aab` (6.0 MB)
- Keystore + credentials in 1Password (item: `RestoreAssist Android Upload Keystore`)
- SHA-1 of upload cert from `~/Documents/RestoreAssist-keystore-backup/keystore-fingerprints.txt`

## Step 1 — Sign in to Play Console

URL: https://play.google.com/console
Account: `airestoreassist@gmail.com`
Resolve the "Fix issues" banner: phone verification → identity verification.

## Step 2 — Create the app entity

- **App name:** RestoreAssist — Water Damage
- **Default language:** English (Australia) — en-AU
- **App or game:** App
- **Free or paid:** Free
- **Declarations:** Developer Programme Policies , US export laws 

## Step 3 — App content (Policy)

| Item | Answer | Source |
|---|---|---|
| Privacy policy URL | https://restoreassist.app/privacy | Live |
| App access | All functionality requires login. Provide test credentials via Step-4 below | — |
| Ads | No, my app does not contain ads | — |
| Content rating | Complete questionnaire (utility, no violence/sexual/gambling) | — |
| Target audience | 18+ | — |
| News app | No | — |
| COVID-19 contact tracing | No | — |
| Data safety form | Use `docs/play-store-data-safety.md` answer key verbatim | Repo |
| Government app | No | — |
| Financial features | No | — |
| Health | No | — |
| Advertising ID | No (we don't use it) | — |

## Step 4 — Test account (reviewers need a working login)

Run `pnpm tsx scripts/seed-playstore-test-account.ts` against the prod DB to create:
- Email: `playstore-reviewer@restoreassist.app`
- Password: (printed by script — copy into Play Console "App access" section)
- Tier: TRIAL with seeded sample data so the reviewer sees the full app surface

Paste credentials into Play Console → App content → App access.

## Step 5 — Main store listing

All in `fastlane/metadata/android/en-AU/`:

| Field | File | Notes |
|---|---|---|
| App name | `title.txt` | 28 chars (≤30) |
| Short description | `short_description.txt` | 79 chars (≤80) |
| Full description | `full_description.txt` | 2,404 chars (≤4000) |
| App icon | `images/icon.png` | 512×512 |
| Feature graphic | `images/featureGraphic.png` | 1024×500 |
| Phone screenshots | `images/phoneScreenshots/*.png` | 8 PNGs, 1080×1920 (9:16) |

Categorisation:
- **Category:** Business
- **Tags:** Productivity, Business, Tools

Contact details:
- Email: support@restoreassist.app
- Phone: (your business number)
- Website: https://restoreassist.app

## Step 6 — Upload AAB to Internal Testing

1. Console → Testing → Internal testing → Create new release
2. Drag `~/Documents/RestoreAssist-keystore-backup/app-release.aab` into the bundle dropzone
3. Release name: `1.0.0 — Initial release`
4. Release notes: paste from `fastlane/metadata/android/en-AU/changelogs/1.txt`
5. Save → Review release → Start rollout to Internal testing

Internal testing has **no review** — testers can install immediately.

## Step 7 — Add testers

- Console → Testing → Internal testing → Testers tab
- Create email list "RestoreAssist Internal" with team emails
- Copy the **opt-in URL** Google generates — share with testers

Each tester must:
1. Click the opt-in URL on the device they'll test on
2. Sign in to Play Store with the same Google account
3. Install via the testing link

## Step 8 — Required GCP work (parallel)

Before Google Sign-In works on the installed APK, you need to:

1. **GCP Console** → APIs & Services → Credentials → Create Android OAuth client
   - Package name: `com.restoreassist.app`
   - SHA-1 fingerprint: (from `~/Documents/RestoreAssist-keystore-backup/keystore-fingerprints.txt`)
2. **GCP Console** → APIs & Services → Credentials → Create Web OAuth client (if not present)
   - Note the **Web client ID** — this is what the app reads
3. Push to Vercel: `vercel env add NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID production` (then `preview`, then `development`)
4. Redeploy production

## Step 9 — Promote to wider tracks (later)

Internal → Closed (alpha/beta) → Open → Production. Each step is reviewed by Google (typically 1–3 days).

## Risks / known gotchas

- Play Console "Personal" accounts require 12 testers × 14 days before they can promote to Production. Skip by switching to "Organization" account (D-U-N-S number required) or accept the wait.
- Google Sign-In on the installed AAB **fails silently** until the OAuth client in Step 8 is created + env var deployed. Test with email/password first.
- IF Google Play marks the upload key compromised, you can rotate via the upload-key rotation flow (Google retains the signing key). Do NOT lose the upload key — see `~/Documents/RestoreAssist-keystore-backup/`.

