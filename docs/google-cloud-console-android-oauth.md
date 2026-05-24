# Google Cloud Console — Android OAuth Setup

This is the manual configuration step that gates Google Sign-In on the
Play Store build. It pairs with the code wiring in
`lib/oauth-native.ts` (the `isCapacitorAndroid()` branch that hands
`webClientId` to capgo's `SocialLogin`). On Android, `webClientId`
plays the dual role of plugin-config + token-audience — there is no
separate `serverClientId` parameter on the plugin's Android surface.

The goal is two OAuth clients in the existing `restoreassist` Google
Cloud Console project (same project the iOS client lives in):

1. An **Android-type** client that authenticates the _caller_ — the
   APK/AAB signed with the upload key, with package name
   `com.restoreassist.app`.
2. A **Web application-type** client that authenticates the _token
   audience_ — its client ID becomes the `webClientId` value the capgo
   plugin passes to Google Sign-In and the `aud` claim our NextAuth
   backend verifies.

The Web client almost certainly already exists from earlier work — you
will probably only need to _create the Android client_ and then
_read_ the existing Web client ID out of the Credentials page.

---

## Step-by-step

### 1. Open the right GCP project

1. Visit https://console.cloud.google.com/.
2. Top-left project switcher → select `restoreassist` (project ID will
   match the one the iOS OAuth client lives in — verify by checking
   that **APIs & Services → Credentials** lists "RestoreAssist iOS").

### 2. Create the Android OAuth client

1. **APIs & Services → Credentials**.
2. **+ Create Credentials → OAuth client ID**.
3. **Application type:** Android.
4. **Name:** `RestoreAssist Android` (anything descriptive).
5. **Package name:** `com.restoreassist.app` — must match exactly. This
   is the `applicationId` in `android/app/build.gradle`.
6. **SHA-1 certificate fingerprint:** (see "Where the SHA-1
   fingerprints come from" below). Agent A's upload keystore generation
   is the source of this for the first cut.
7. **Create.**

The resulting Android Client ID does **not** need to be referenced
from our code. The Google Sign-In SDK on Android uses the
_package name + SHA-1 anchor_ to authenticate the caller — there is no
client-ID string to embed for that role.

### 3. Verify (or create) the Web application OAuth client

1. Still on **APIs & Services → Credentials**.
2. Look for an existing client with **Type = Web application**.
   - If it exists: click it and copy the **Client ID** string. It
     looks like
     `292141944467-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com`.
   - If it does **not** exist: **+ Create Credentials → OAuth client
     ID → Application type: Web application**. Name it `RestoreAssist
Web`. No redirect URIs or origins are required for the
     Android-token-verification role; the NextAuth web sign-in flow has
     its own redirect URIs separately.

This Web Client ID is what we need.

### 4. Plumb the Web Client ID into the app

1. Add to Vercel project env vars (Production + Preview + Development):

   ```
   NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID=<the web client id from step 3>
   ```

2. Add the same line to your local `.env.local`.

3. Open `android/app/src/main/res/values/strings.xml` and replace the
   `TODO_REPLACE_WITH_GOOGLE_CLOUD_CONSOLE_WEB_CLIENT_ID` placeholder
   in `<string name="server_client_id">` with the same value. This is
   a belt-and-braces fallback for any native code path that reads from
   resources instead of the JS config.

4. Rebuild the AAB (`./gradlew :app:bundleRelease`) and re-upload to
   Play Console.

### 5. Add the Play-managed SHA-1 after the first internal-test upload

Google Play App Signing is mandatory for new apps. The flow:

1. You upload the AAB signed with the _upload key_ you generated locally.
2. Play re-signs the artifact distributed to devices with a separate
   _Play-managed app-signing key_.
3. **Google Sign-In on installed devices verifies against the
   Play-managed key's SHA-1, not your upload key's SHA-1.**

So after the first Play Console upload:

1. Play Console → app → **Setup → App integrity → App signing**.
2. Copy the **SHA-1 certificate fingerprint** shown for "App signing
   key certificate".
3. Back in GCP → APIs & Services → Credentials → open your Android
   OAuth client → **Add fingerprint** → paste it.

You now have _two_ fingerprints registered (upload + Play-managed). Both
are required: the upload fingerprint covers local debug installs of
release builds; the Play-managed fingerprint covers devices installing
from the store.

---

## Where the SHA-1 fingerprints come from

### Upload keystore (used until Google Play takes over)

```bash
keytool -list -v \
  -keystore android/app/release-upload-key.jks \
  -alias restoreassist-upload
```

Look for the `SHA1:` line under "Certificate fingerprints".

Agent A's keystore-generation track reports this value; if you have
not yet received it, run the keytool command above against whatever
keystore Agent A produced.

### Play-managed app-signing key (used by every store install)

Play Console → app → **Setup → App integrity → App signing** →
"App signing key certificate" → **SHA-1 certificate fingerprint**.

### Debug keystore (for local `./gradlew installDebug` flows)

Android Studio creates this automatically the first time you build:

```bash
keytool -list -v \
  -keystore ~/.android/debug.keystore \
  -alias androiddebugkey \
  -storepass android \
  -keypass android
```

Add this fingerprint too if you want Google Sign-In to work on debug
builds installed from `adb` / Android Studio runs (recommended — it
will save hours of "why does it work in release but not in dev"
debugging later).

---

## Validation checklist

After steps 1-4 you should be able to:

- [ ] Build a release AAB locally without errors.
- [ ] Install the AAB on a device (via `bundletool` or Play Console
      internal test track).
- [ ] Tap "Continue with Google" in the sign-in screen.
- [ ] See the native Google account picker, not a web sheet.
- [ ] Pick an account and end up signed in at `/dashboard`.

If step 4 shows a web sheet instead of the native picker, the
`webClientId` value didn't reach the plugin — check the env var spelling
and that the build actually picked up the latest
`NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID` value.

If step 4 shows the picker but `signInWithOAuth` throws `Google did
not return an identity token`, the Android OAuth client is missing
the SHA-1 fingerprint that signed this build. Re-check step 2.6 or
step 5.

---

## What about Apple Sign-In on Android?

Capgo's `SocialLogin.login({ provider: "apple" })` on Android opens
Sign in with Apple's web flow inside an in-app browser. No additional
configuration is required on the Android side beyond the Apple Service
ID (already set up for the iOS build).

Play Store reviewers accept Apple's web flow on Android — unlike Apple
App Review guideline 4.8, Google does not require Apple Sign-In to
be available at all on Android. The capgo web fallback is the standard
pattern, and we ship it as-is.
