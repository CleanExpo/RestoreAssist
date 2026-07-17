# App Store Connect — reply to App Review thread for 1.0(6)

**Where this goes:** App Store Connect → Apps → RestoreAssist → 1.0 →
**Resolution Center** (the thread for Submission ID
`90a5e632-c88a-4358-9013-21d6941d963e`, dated May 4 2026) → **Reply** box.

**Tone:** factual, addresses each ground in the order Apple raised it,
no excuses. Reviewers read hundreds of these — short and concrete wins.

---

Hello,

Thank you for the detailed feedback on 1.0(6). Build 1.0(7) is now in
TestFlight and addresses both grounds. Once attached and submitted I will
note the substantive changes here for the reviewer's reference.

**3.1.1 — external purchase mechanism.**
The 1.0(6) iOS billing placeholder still rendered a "restoreassist.app"
hyperlink, which we recognise was the call-to-action your team flagged.
That link has been removed entirely in 1.0(7). The placeholder now reads
"Managed by your workspace — Subscriptions are managed by your workspace
administrator. Sign in with your workspace credentials to access
RestoreAssist." There is no URL, no email, no CTA, and no website
reference on this screen.

Additional 3.1.1 hardening:
- The Credits page (/dashboard/credits) is now wrapped in the same
  client-side BillingGate as pricing and subscription, so iOS reviewers
  see the workspace-admin placeholder instead of upgrade or add-on CTAs.
- The Settings page no longer renders a "Manage Subscription" button on
  iOS — the entry point is gone, not just downstream-gated.
- The server-side 403 payload returned by checkout endpoints
  (`rejectIfIOSCapacitor` in `lib/ios-billing-guard.ts`) no longer
  includes a `web_billing_url` field. The body is now `{ error, message }`
  with no URLs anywhere in the response.

**4.2 — minimum functionality.**
We accept the feedback that the prior build was too close to a web
wrapper. Build 1.0(7) introduces native field-toolkit features that go
beyond the in-WebView experience, exercised end-to-end on the device:

1. Native GPS auto-fill on the inspection address field via Core Location
   (@capacitor/geolocation), reverse-geocoded to street + postcode.
2. Native iOS share sheet (`UIActivityViewController`) for damage-report
   PDFs via @capacitor/share + @capacitor/filesystem — Mail, Messages,
   AirDrop, Files all appear.
3. Native CoreHaptics feedback on meter-photo OCR success, validation
   errors, and inspection submit (@capacitor/haptics).
4. Local notifications scheduling a real 24-hour follow-up reminder per
   inspection (@capacitor/local-notifications).

We have also removed three Info.plist permission keys (Microphone,
Bluetooth Always, Bluetooth Peripheral) that were declared for features
still in development and not exercised by 1.0(7) code paths. The plist
now declares only what shipped.

Step-by-step paths to exercise each native integration are in the App
Review Information notes attached to the 1.0(7) submission. A demo
account with sample inspections is preloaded.

If a Loom walkthrough or a live call would help with the review, I am
happy to provide one — please let me know your preference.

Thank you for your time and the careful review.
