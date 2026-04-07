# Capacitor Native Shell — SE Setup Instructions

## Step 1: Initialize Capacitor (run once, from repo root)

```bash
npx cap init RestoreAssist com.restoreassist.app --web-dir out
npx cap add ios
npx cap add android
```

Note: `webDir: out` is a placeholder. The native shell uses `server.url` from
`capacitor.config.ts` to load `https://restoreassist.com.au` directly —
no static export is needed.

## Step 2: iOS permissions (ios/App/App/Info.plist)

Copy the `<key>` blocks from `.capacitor-native-notes/ios-info-plist-additions.xml`
into the `<dict>` block of `ios/App/App/Info.plist`.

## Step 3: Android permissions (android/app/src/main/AndroidManifest.xml)

Copy the `<uses-permission>` blocks from
`.capacitor-native-notes/android-manifest-additions.xml`
into the `<manifest>` block of `android/app/src/main/AndroidManifest.xml`.

## Step 4: Build and sync

```bash
npm run build
npx cap sync
```

## Step 5: Open in Xcode / Android Studio

```bash
npx cap open ios      # Requires macOS + Xcode 15+
npx cap open android  # Works on Windows/macOS/Linux with Android Studio
```

## Step 6: App Store accounts needed

- **Apple Developer Program**: $149 AUD/yr — required for iOS distribution
- **Google Play Console**: $30 USD one-time — required for Android distribution

## Step 7: Merge order

PR #26 (offline/permissions) → PR #27 (Bluetooth) → PR #28 (OCR/MeterPhotoCapture)
→ **PR #29 (this PR — Capacitor native)**

When merging PR #29, note that `components/inspection/MeterPhotoCapture.tsx` on
this branch is the enhanced version (adds native camera support). Take this version
if there's a merge conflict with PR #28.

## Architecture note

The native shell is a **server-hosted WebView** — it loads the production Next.js
app from `https://restoreassist.com.au`. SSR and API routes are unchanged.
The native wrapper adds:

- App Store / Play Store distribution
- Native camera (@capacitor/camera) — better than browser <input capture>
- Native Bluetooth on iOS (Web Bluetooth blocked in WKWebView)
- Future: push notifications via @capacitor/push-notifications
