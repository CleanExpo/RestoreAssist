# App Review reviewer notes — RestoreAssist 1.0(7) resubmit

**For App Store Connect → Distribution → Version 1.0 → App Review Information → Notes (paste verbatim).**

Character budget: ASC notes field is 4000 chars. Body below is ~3100 chars.

---

Thank you for the detailed feedback on build 1.0(6). Build 1.0(7) addresses both grounds raised.

GROUND 1 (3.1.1 — external purchase mechanism):
The 1.0(6) iOS billing placeholder included a hyperlink to "restoreassist.app". That link has been removed entirely. The placeholder now reads "Managed by your workspace — Subscriptions are managed by your workspace administrator. Sign in with your workspace credentials to access RestoreAssist." There is no URL, no email, no CTA, and no copy referencing the website on this screen.

Additional 3.1.1 hardening in 1.0(7):
- The Credits page (/dashboard/credits) is now wrapped in the same client-side BillingGate, so iOS reviewers see the workspace-admin placeholder instead of upgrade or add-on CTAs.
- The Settings page no longer renders a "Manage Subscription" button on iOS — the entry point is gone.
- The server-side 403 payload returned by checkout endpoints (rejectIfIOSCapacitor) no longer includes a "web_billing_url" field. The body is now just { error, message } with no URLs.
- No subscribe / upgrade / pricing surface inside the iOS shell contains any link, button, or copy that points at the website.

GROUND 2 (4.2 — minimum functionality):
Build 1.0(7) adds four native iOS integrations on top of the existing native camera + meter-photo OCR. Reviewer can exercise all four in this order:

1. NATIVE GPS — Sign in, Dashboard → New Inspection. Below the Property Address field on iOS only there is a "Use my current location" button. Tapping it triggers iOS's location permission prompt, then reads the device's GPS, reverse-geocodes via OpenStreetMap, and auto-fills the address + postcode. Lat/long captured live via @capacitor/geolocation.

2. NATIVE SHARE SHEET — Open any existing damage report (Dashboard → Reports → pick one). Tap "Download PDF". On iOS the file is written to the Capacitor cache directory and presented through UIActivityViewController — Mail, Messages, AirDrop, Files, and any installed share extensions appear. The web fallback (anchor download) is unchanged on Safari/Chrome.

3. NATIVE HAPTICS — Capture a meter photo (Inspection → Capture → Meter photo) and accept the OCR'd reading. iOS triggers a real CoreHaptics success notification. Validation errors trigger a warning haptic. Inspection submit triggers a success haptic.

4. LOCAL NOTIFICATIONS — Submit any new inspection. iOS prompts "Schedule a 24-hour follow-up reminder for this site?". Confirming triggers iOS's notification permission dialog and schedules a real local notification 24 hours out via @capacitor/local-notifications. (For testing, the reviewer may shorten the schedule by editing the inspection submit handler — happy to provide a Loom or a TestFlight build with a 60-second schedule on request.)

Hollow Info.plist permission keys for Microphone and Bluetooth (carried from earlier scoping for features still in development) have been removed in 1.0(7). The plist now declares only Camera, Photo Library, Photo Library Add, and Location When-In-Use — all four are exercised by shipped code.

REVIEWER DEMO ACCOUNT:
Username: reviewer@restoreassist.app
Password: see Sign-In Information field above (rotated 2026-05-04)

Sample inspections preloaded with fake AU addresses. No real customer PII.

Thank you.

---

## Notes for the operator (NOT for paste)

1. Update Sign-In Information password before submit. If the reviewer password was rotated again between 1.0(6) and 1.0(7), paste the fresh value next to reviewer@restoreassist.app.

2. Build number is 1.0(7). `CURRENT_PROJECT_VERSION` is bumped to 7 in `ios/App/App.xcodeproj/project.pbxproj` (both Debug + Release configurations).

3. Code changes shipped in 1.0(7):
   - `components/capacitor/BillingGate.tsx` — placeholder rewritten to "Managed by your workspace"; restoreassist.app `<a>` element removed
   - `app/dashboard/credits/page.tsx` — content wrapped in `<BillingGate>` (mirrors pricing/subscription pattern)
   - `app/dashboard/settings/page.tsx` — "Manage Subscription" button hidden on iOS via `isCapacitorIOS()` gate
   - `lib/ios-billing-guard.ts` — `web_billing_url` field stripped from 403 response payload
   - `lib/capacitor.ts` — added `getCurrentLocation`, `shareBlobNatively`, `fireHaptic`, `scheduleFollowUpReminder` helpers (lazy-imported plugins, no native code in web bundle)
   - `components/NIRTechnicianInputForm.tsx` — "Use my current location" button (iOS only); haptics on submit; follow-up reminder prompt
   - `components/inspection/MeterPhotoCapture.tsx` — haptic on save success / failure / clipboard copy
   - `components/reports/damage-report-view.tsx` — `handleDownloadPdf` routes through `shareBlobNatively` on iOS
   - `ios/App/App/Info.plist` — removed `NSMicrophoneUsageDescription`, `NSBluetoothAlwaysUsageDescription`, `NSBluetoothPeripheralUsageDescription`; updated Location description to match the new GPS feature
   - `package.json` + `pnpm-lock.yaml` — added `@capacitor/geolocation`, `@capacitor/share`, `@capacitor/haptics`, `@capacitor/local-notifications`, `@capacitor/filesystem`
   - `ios/App/App.xcodeproj/project.pbxproj` — `CURRENT_PROJECT_VERSION` 6 → 7

4. Surfaces still containing the literal "restoreassist.app" string but not reachable on a fresh review-account flow (so not blockers for 3.1.1):
   - `components/dashboard/PortalInvitationSection.tsx:176` — only renders after a client invitation has been accepted (review account has no clients)
   - `app/dashboard/clients/[id]/portal/page.tsx:244` — only reachable after creating a client and navigating to that client's portal page
   - `mailto:` support / privacy / legal email addresses — these are not purchase URLs and are explicitly allowed under 3.1.1

5. Recommend leaving Auto-release ON.

6. After upload, run a fresh smoke test against the simulator with a brand-new free-tier account and walk every tab to confirm no `restoreassist.app` literal appears anywhere reachable.
