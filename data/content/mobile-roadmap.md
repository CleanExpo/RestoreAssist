# RestoreAssist Mobile App — V1 Feature Roadmap

## Status: Ready for TestFlight (pending EAS configuration)

The RestoreAssist mobile app is built on React Native 0.76.0 with Expo SDK 52,
sharing the same Supabase backend as the web platform. All V1 features are
complete and the codebase is ready for TestFlight internal testing pending the
EAS Project ID being configured (RA-246).

---

## V1 Features (Complete)

### Field Inspection Capture

Technicians can capture moisture readings, GPS coordinates, and photos directly
on site. The camera integration uses `expo-camera` with automatic EXIF
geolocation tagging. Moisture readings are validated against IICRC S500
thresholds in real time.

### Offline-First SQLite Storage

All inspection data is stored locally in Expo SQLite 15 before syncing to the
cloud. The sync queue handles network interruptions gracefully — technicians can
work in areas with no signal and all data is uploaded when connectivity is
restored.

### BYOK API Key Management

Technicians can bring their own OpenAI, Anthropic, or Gemini API keys, stored
securely in Expo SecureStore (iOS Keychain / Android Keystore). Keys are never
transmitted to RestoreAssist servers.

### Authentication

Full auth flow: login, signup, and session persistence. NextAuth JWT tokens are
stored in SecureStore and refreshed automatically. Supports the same user roles
as the web platform (Admin, Manager, Technician).

### Jobs Screen

Lists all active and recent jobs assigned to the technician. Supports pull-to-
refresh, search, and filtering by status. Job cards show address, insurance
reference, and damage category at a glance.

### Reports Screen

Browse and view completed reports. PDF preview using `expo-file-system` and
`expo-sharing` for sharing reports directly from the device.

### Inspection Detail Screen

Full inspection detail view with moisture readings, photos, room-by-room
breakdown, and IICRC classification. Supports adding additional readings and
photos from the field.

### AI Report Generation on Mobile

Generate full IICRC-compliant scope narratives from the mobile app using the
device's stored API key. Streams the response using the same SSE endpoint as
the web platform.

### Push Notifications

Expo Push Notifications service with `expo-notifications`. Technicians receive
alerts for new job dispatches, inspection completions, and sync errors. PushToken
model stores device tokens in the database linked to each user.

### Sync Engine with Image Compression

Background sync engine that compresses inspection photos (90% quality JPEG,
max 1920px) before uploading to Supabase Storage. Sync status is visible in
the app — pending, syncing, and synced states are shown per-inspection.

### Prisma Schema (MobileInspection + PushToken)

Database models added: `MobileInspection` (offline-created inspections with
sync state), `PushToken` (per-device notification tokens linked to users).

---

## Launch Checklist

- [ ] EAS Project ID configured in `mobile/app.config.ts` (RA-246 — human action)
- [ ] Supabase env vars added to `mobile/.env.local` (RA-246 — human action)
- [ ] `eas build --profile preview` run successfully
- [ ] TestFlight internal testing (target: Day 75 post-EAS setup)
- [ ] Apple App Store Connect — bundle ID `com.restoreassist.mobile` registered
- [ ] Google Play Console — app registered and signing key uploaded
- [ ] App Store submission review (approximately 2–5 business days)
- [ ] Google Play submission review (approximately 1–3 business days)
- [ ] Public launch announcement

---

## V2 Features (Planned — post-launch)

1. **Bluetooth moisture meter integration** — Direct BLE pairing with Protimeter
   MMS3 and Tramex CME5 meters. Auto-populates moisture readings without manual
   entry, reducing field errors.

2. **Photo OCR for meter readings** — Use on-device ML (Vision framework / ML Kit)
   to extract moisture readings from photos of analogue meters. Eliminates manual
   transcription.

3. **Offline maps for site navigation** — Cached offline maps using MapboxGL or
   Mapbox Offline for navigating to remote loss sites with no mobile signal.

4. **Multi-site job management** — Handle multiple simultaneous loss sites in a
   single session. Technicians can switch between jobs without losing in-progress
   data.

5. **Voice-to-text field notes** — Hands-free documentation using `expo-speech`
   and Whisper API. Technicians dictate room descriptions while working, reducing
   data entry time by an estimated 60%.

6. **Insurance adjuster portal** — Share inspection summaries and photo evidence
   directly with adjusters from the mobile app via a secure time-limited link.

7. **Equipment tracking via NFC** — Scan NFC tags attached to dehumidifiers, air
   movers, and scrubbers to record placement location and readings automatically.
   Uses `expo-nfc` (Android) with Bluetooth fallback for iOS.

8. **Dark mode & accessibility** — Full dark mode support and Dynamic Type
   compliance for accessibility requirements.

9. **Wearable integration** — Apple Watch complication for quick moisture reading
   entry without removing gloves.

---

## Tech Stack

| Layer              | Technology                                              |
| ------------------ | ------------------------------------------------------- |
| Framework          | React Native 0.76.0, Expo SDK 52                        |
| Navigation         | expo-router 4.0 (file-based, matching web app)          |
| Backend            | Supabase JS 2.86 (shared with web platform)             |
| Local storage      | Expo SQLite 15 — offline-first                          |
| Secure storage     | Expo SecureStore (API keys, auth tokens)                |
| Push notifications | Expo Notifications + FCM / APNs                         |
| Image handling     | expo-camera, expo-image-picker, expo-image-manipulator  |
| Build & deploy     | EAS Build — development / preview / production profiles |
| OTA updates        | EAS Update — hot-fix delivery without App Store review  |

---

## Directory

```
D:\RestoreAssist\mobile\
├── app/                    # expo-router screens
│   ├── (auth)/             # login, signup
│   ├── (tabs)/             # jobs, inspections, reports
│   └── inspection/[id]/    # inspection detail
├── components/             # shared RN components
├── lib/                    # API client, sync engine, storage
├── hooks/                  # custom React Native hooks
├── app.config.ts           # Expo config (EAS Project ID goes here)
└── .env.local              # Supabase URL + anon key (RA-246)
```

---

_Last updated: 2026-03-31 | Linear: RA-162 | EPIC: RA-241_
