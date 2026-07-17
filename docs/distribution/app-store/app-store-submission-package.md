# App Store Connect — Submission Package (RestoreAssist v1.0)

**Owner:** Phill McGurk
**App:** RestoreAssist (Capacitor wrapping `https://restoreassist.app`)
**Bundle ID:** `com.restoreassist.app`
**Reference runbook:** `docs/MOBILE_RELEASE_RUNBOOK.md` § 2 + § 4 + § 6
**Status check:** TestFlight build 1.0(1) is live + encryption export compliance declared per RA-1633

> **One-stop paste sheet.** Every App Store Connect field below has its source value inline so you don't have to flip files. Owner-only — Claude does not click Submit.

---

## §A — App Store Connect → My Apps → ＋ → New App

| Field            | Value                                      |
| ---------------- | ------------------------------------------ |
| Platform         | iOS                                        |
| Name             | `RestoreAssist`                            |
| Primary Language | `English (Australia)`                      |
| Bundle ID        | `com.restoreassist.app` (must match Xcode) |
| SKU              | `restoreassist-au-001`                     |
| User Access      | Full Access                                |

---

## §B — App Information

| Field                    | Value                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Subtitle (30 chars max)  | `Water Damage Compliance`                                                              |
| Category — Primary       | `Business`                                                                             |
| Category — Secondary     | `Productivity`                                                                         |
| Content Rights           | "Does not use third-party content"                                                     |
| Age Rating               | `4+` (no objectionable content per `distribution/store-listings.md` § Apple App Store) |
| Privacy Policy URL       | `https://restoreassist.app/privacy`                                                    |
| Support URL              | `https://restoreassist.app/support`                                                    |
| Marketing URL (optional) | `https://restoreassist.app`                                                            |

---

## §C — Pricing and Availability

| Field                  | Value                                                                            |
| ---------------------- | -------------------------------------------------------------------------------- |
| Price                  | Free (subscription paywall is a server-side gate, not an in-app product for v1)  |
| Availability — Markets | **Australia + New Zealand only** for v1 (see §I below for In-App Purchases note) |
| Pre-orders             | Off                                                                              |

---

## §D — App Privacy → Privacy Nutrition Labels

Source: `distribution/PRIVACY_DISCLOSURES.md` § "App Store Connect — Privacy Nutrition Labels"

**Step 1**: Does this app collect data? → **Yes**

**Step 2**: Categories (paste each yes-row exactly into the App Store form):

| Category       | Data Type                                   | Linked?                                                                                   | Used for                      | Tracking? |
| -------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- | --------- |
| Contact Info   | Name                                        | Linked                                                                                    | App Functionality + Account   | No        |
| Contact Info   | Email Address                               | Linked                                                                                    | App Functionality + Account   | No        |
| Contact Info   | Phone Number                                | Linked                                                                                    | App Functionality             | No        |
| Contact Info   | Physical Address                            | Linked                                                                                    | App Functionality             | No        |
| User Content   | Photos or Videos                            | Linked                                                                                    | App Functionality             | No        |
| User Content   | Audio Data (only if voice-observation used) | Linked                                                                                    | App Functionality             | No        |
| User Content   | Other User Content (free-text notes)        | Linked                                                                                    | App Functionality             | No        |
| Identifiers    | User ID                                     | Linked                                                                                    | App Functionality + Analytics | No        |
| Usage Data     | Product Interaction                         | Linked                                                                                    | Analytics + App Functionality | No        |
| Diagnostics    | Crash Data                                  | **Not linked**                                                                            | App Functionality             | No        |
| Diagnostics    | Performance Data                            | Not linked                                                                                | App Functionality             | No        |
| Diagnostics    | Other Diagnostic Data                       | Not linked                                                                                | App Functionality             | No        |
| Location       | Coarse Location                             | Linked                                                                                    | App Functionality             | No        |
| Financial Info | Payment Info                                | Disclosed as collected by **third party (Stripe)** — app itself does not see card numbers | —                             | No        |

**Note on `Tracking?` answers:** All "No". RestoreAssist does not link user data to third-party data for advertising or tracking.

---

## §E — App Review Information

| Field                 | Value                                                                                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sign-In Required      | **Yes**                                                                                                                                                                                                                                                                              |
| Demo Account Username | **`reviewer@restoreassist.app`** [WARN] provision via §J below; do NOT use real pilot creds                                                                                                                                                                                              |
| Demo Account Password | (provisioned at §J)                                                                                                                                                                                                                                                                  |
| Demo Account Notes    | "Sign in with email + password. After login, the dashboard shows recent inspections. Tap any inspection to view its room-by-room moisture readings, photos, and scope of works. The 'New Inspection' flow demonstrates offline-first capture; toggle airplane mode to see queueing." |
| Contact Information   | Phill McGurk · phill@unite-group.in (or substitute) · phone (your AU mobile)                                                                                                                                                                                                         |
| Notes (general)       | "RestoreAssist is a server-hosted Capacitor WebView. The native shell wraps `https://restoreassist.app`. Apple's review team can sign in with the demo creds above to access the full IICRC-compliant inspection workflow without subscription."                                     |
| Attachment            | (Optional) screen-recorded walkthrough video — not required if demo creds work                                                                                                                                                                                                       |

---

## §F — Version Information (v1.0)

| Field                                | Value                                                                                                                                                                        | Source                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Version                              | `1.0`                                                                                                                                                                        | matches Xcode `MARKETING_VERSION` |
| Build                                | `1`                                                                                                                                                                          | from `ios-release.yml` autobump   |
| What's New in This Version           | (paste from `distribution/whatsnew/whatsnew-en-AU`, see §G below)                                                                                                            | first release                     |
| Promotional Text (170 chars)         | "Now available for Australian restoration professionals. IICRC S500/S520/S700 compliant inspection workflows, AI photo analysis, and seamless Xero/MYOB/Ascora integration." | `store-listings.md`               |
| Description (4000 chars)             | (paste full description below)                                                                                                                                               | `store-listings.md`               |
| Keywords (100 chars)                 | `water damage,restoration,IICRC,moisture,mould,flood,insurance,scope,report,compliance,contractor`                                                                           | `store-listings.md`               |
| Screenshot — 6.7" iPhone (1290×2796) | `distribution/screenshots/app-store/6.7-iphone/*.png` (run capture script first)                                                                                             | `capture-screenshots.mjs`         |
| Screenshot — 6.5" iPhone (1284×2778) | `distribution/screenshots/app-store/6.5-iphone/*.png`                                                                                                                        | same                              |
| Screenshot — 5.5" iPhone (1242×2208) | `distribution/screenshots/app-store/5.5-iphone/*.png`                                                                                                                        | same                              |
| Screenshot — 12.9" iPad (2048×2732)  | `distribution/screenshots/app-store/12.9-ipad/*.png`                                                                                                                         | same                              |
| App Icon (auto-pulled from binary)   | `distribution/icon-source/out/ios-1024.png` (no alpha, 1024×1024)                                                                                                            | already in icon-source            |

---

## §G — Description (paste verbatim into "Description" field)

```
RestoreAssist is the all-in-one field and reporting platform built exclusively for Australian water damage, fire, and storm restoration professionals.

IICRC-COMPLIANT WORKFLOW
Conduct room-by-room inspections aligned with IICRC S500:2021, S520:2024, and S700:2025 standards. Record moisture readings, drying logs, equipment placements, and scope of works — all in a structured format that satisfies insurance and state building-authority requirements.

AI-POWERED EFFICIENCY
Point your camera at a moisture meter and let RestoreAssist read the value automatically. AI photo analysis eliminates manual data entry and reduces errors on site.

OFFLINE-FIRST FIELD TOOL
Work in basements, rural properties, and areas without mobile signal. All data is captured offline and syncs automatically when connectivity is restored.

PROFESSIONAL REPORTING
Generate PDF inspection reports, scope of works, and visual cost estimates in seconds. Reports are formatted to meet insurer and building authority requirements across all Australian states and territories.

SEAMLESS INTEGRATIONS
Push jobs and invoices directly to Xero, MYOB, QuickBooks, Ascora, and ServiceM8. Eliminate double entry and keep your back-office in sync with every site visit.

BUILT FOR AUSTRALIAN COMPLIANCE
• IICRC S500:2021 water damage inspection workflows (5th edition)
• IICRC S520:2024 mould remediation scope support
• IICRC S540:2023 trauma & biohazard remediation
• IICRC S700:2025 fire and smoke damage assessments
• NCC Volume 2 Part 3.5 storm-damage NCC compliance
• NADCA ACR 2021 + AS/NZS 3666 HVAC hygiene
• GST-compliant invoicing (10% Australian GST)
• State-specific building codes across all Australian jurisdictions
• ABN validation and state-by-state regulator checklists (QBCC, VBA, NSW Fair Trading, etc.)

KEY FEATURES
• Room-by-room moisture mapping with psychrometric calculations
• Equipment tracking and drying log management
• Photo documentation with AI meter reading
• Scope of works generation
• Visual cost estimation
• Customer invoice creation
• Insurance claim documentation
• Multi-user job management
• Offline data capture with automatic sync
• Secure cloud storage for all job records

RestoreAssist is used by independent restoration contractors, franchise operators, and multi-site restoration companies throughout Australia.
```

## What's New (paste verbatim into "What's New in This Version")

```
First release of RestoreAssist — the property restoration reporting platform for Australian water, fire, and storm damage technicians.

• IICRC S500, S520, and S700 compliant inspection workflow
• Room-by-room moisture readings, photos, and scope of works
• AI-powered photo analysis for meter readings
• Offline-first — field data syncs when connection is restored
• Direct invoicing to Xero, MYOB, QuickBooks, Ascora, and ServiceM8
```

---

## §H — Encryption Export Compliance

Already declared per RA-1633 ("encryption export compliance declared"). For v1.0 build 1: **app uses standard encryption for HTTPS only — no proprietary encryption.** Answer the App Store Connect questionnaire accordingly:

- Does your app use encryption? **Yes**
- Does your app qualify for any of the exemptions? **Yes** — exempt under Section 740.17(b)(1) (uses HTTPS only via WKWebView, no proprietary crypto)
- Re-declare on each new version unless `ITSAppUsesNonExemptEncryption=false` is in `Info.plist`. (Recommended: add the key once, then no re-declaration needed.)

---

## §I — In-App Purchases / Subscriptions

For v1: **NO in-app purchases.** Subscription billing is processed via the web (Stripe), accessible after sign-in. Apple may request an explanation since restoration software is "Reader" category — confirm with App Review Notes (§E):

> "Subscriptions are processed by the operator company, not via Apple In-App Purchase. The app is provided free for active workspace members. Per Apple Guideline 3.1.3(a), this is permissible because subscription is purchased outside the app and the iOS app provides paid content access."

If Apple rejects under 3.1.3, the fallback is to add an In-App Purchase product matching the Pro tier and let users subscribe through Apple. File a follow-up ticket if this becomes a blocker.

---

## §J — Pre-submit checklist (do all before clicking Submit)

- [ ] Apple Developer Program enrolled (`§ Pre-flight 1.1` of `MOBILE_RELEASE_RUNBOOK.md`)
- [ ] iOS Distribution certificate uploaded to App Store Connect via the API key flow
- [ ] All 12 GitHub Secrets present (see runbook §1.7)
- [ ] TestFlight build 1.0(1) shows status "Ready to Submit" (already confirmed per RA-1633)
- [ ] Reviewer demo workspace provisioned: `reviewer@restoreassist.app` with a fresh password, basic seed data (1-2 inspections + photos), no real customer PII
- [ ] All 4 device-size screenshots captured + uploaded
- [ ] Privacy Nutrition Labels filled per §D
- [ ] Pricing & Availability set: Free, AU + NZ
- [ ] Encryption Export Compliance declared per §H
- [ ] App Review Information section filled per §E

When all 9 items above are checked: click **Submit for Review**.

---

## §K — After submission

| Step                                     | What to do                                                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Status `Waiting for Review`           | Apple's queue — typically 24-72h                                                                                                                                                                                                            |
| 2. Status `In Review`                    | Active review — typically a few hours                                                                                                                                                                                                       |
| 3. Status `Ready for Sale` (or rejected) | If approved → app goes live in AU + NZ; if rejected → read the reviewer's notes, fix, resubmit. Typical first-rejection reasons: insufficient reviewer notes (§E), missing demo account access, screenshot doesn't match actual app surface |
| 4. Phased Release (optional)             | App Store Connect → Version → Phased Release → 7-day rollout. Recommended for v1.0.                                                                                                                                                         |
| 5. TestFlight retiring                   | Once Ready for Sale, retire TestFlight build 1.0(1) so external testers move to the App Store version                                                                                                                                       |

---

 **Companion docs:** `distribution/play-store-submission-package.md` (Google Play), `distribution/store-listings.md` (raw copy), `distribution/PRIVACY_DISCLOSURES.md` (truthful data flow audit), `docs/MOBILE_RELEASE_RUNBOOK.md` (full release process)
