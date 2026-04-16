# App Store & Google Play Metadata

**Ready to copy-paste into App Store Connect and Google Play Console**

---

## APP 1: RestoreAssist Field App

**Bundle / Package ID:** `com.restoreassist.app`
**Target platforms:** iOS (iPhone + iPad) + Android

---

### App Store Connect (Apple)

**App Name:** RestoreAssist
**Subtitle (30 chars max):** Property Restoration Reports

**Category:** Business (Primary) / Productivity (Secondary)

**Age Rating:** 4+ (no restricted content)

**Privacy Policy URL:** https://restoreassist.app/privacy

**Support URL:** https://restoreassist.app/support

**Marketing URL:** https://restoreassist.app

---

#### Description (4,000 chars max — copy this verbatim)

```
RestoreAssist is the all-in-one property restoration management platform for water, fire, and storm damage technicians.

Replace paper forms and inconsistent reports with a standards-based digital workflow that guides your team through every inspection — from initial site assessment to final invoice.

INSPECTION AND REPORTING
• Guided inspection form with IICRC S500, S520, and S700 compliance built in
• Room-by-room documentation with moisture readings, photos, and scope of works
• Automatic damage classification (Category 1, 2, 3 / Class 1–4)
• AI-powered photo analysis — photograph moisture meters and thermal hygrometers and extract readings automatically
• Bluetooth connectivity for direct meter readings from Tramex, Delmhorst, and Testo devices
• Offline-first — all data captured in the field syncs when connection is restored

ESTIMATES AND INVOICING
• Scope of works generation based on inspection findings
• IICRC-compliant justifications on every line item
• Direct invoicing to Xero, MYOB, QuickBooks, Ascora, and ServiceM8
• Built-in Australian rate schedules

AI ASSISTANCE
• Claim analysis powered by Claude (Anthropic) — summarise policy documents, identify key claim considerations
• Bring your own API key — your costs, your data, no markup

COMPLIANCE
• IICRC S500 (Water Damage Restoration), S520 (Mould Remediation), S700 (Fire and Smoke)
• Australian state building code triggers (QLD, NSW, VIC, WA, SA, TAS, NT, ACT)
• Evidence-gated scope — required readings must be captured before scope items are added

WHO IT'S FOR
RestoreAssist is purpose-built for Australian restoration companies: sole operators, small teams, and growing businesses that want professional-grade reporting without the complexity of enterprise software.

SUBSCRIPTION
Start with 5 free inspection reports. Then $99 AUD/month for unlimited reports.
```

---

#### Keywords (100 chars max, comma-separated)

```
restoration,moisture,inspection,IICRC,water damage,Xero,report,insurance,claim,fire damage
```

---

#### What's New (Version 1.0)

```
First release — complete inspection and reporting workflow for water, fire, and storm damage restoration.
```

---

#### Screenshots Required by Apple

**iPhone 6.9" (required):** 1320 × 2868 px
**iPhone 6.7" (required):** 1290 × 2796 px
**iPad Pro 13" (required):** 2064 × 2752 px

Recommended screenshot content:

1. Dashboard overview
2. Inspection form — moisture readings tab
3. Room-by-room photo gallery
4. AI meter photo capture
5. Scope of works with IICRC references
6. Report preview / PDF export

**Note for SE:** Screenshots can be taken using Xcode Simulator on Mac, or from a physical device running the TestFlight build. 6 screenshots per device class. No marketing overlays are required (plain app UI is fine).

---

### Google Play Console (Android)

**App Name:** RestoreAssist
**Category:** Business
**Content Rating:** Everyone

**Short Description (80 chars):**

```
Property restoration reporting — IICRC-compliant, offline-first
```

**Full Description (4,000 chars):**
_(Same as Apple description above — use identical copy)_

**Privacy Policy URL:** https://restoreassist.app/privacy

**Screenshots Required:**

- Phone: 1080 × 1920 px (minimum 2, recommended 8)
- Tablet 7": 1200 × 1920 px
- Tablet 10": 1920 × 1200 px (landscape)

**Feature Graphic (required):** 1024 × 500 px
_(Simple graphic — company logo on dark background works fine)_

---

## APP 2: RestoreAssist CET

**Bundle / Package ID:** `com.restoreassist.cet`
**Target platforms:** iOS (iPad only) — Android is future

---

### App Store Connect (Apple) — CET

**App Name:** RestoreAssist CET
**Subtitle:** Client Education Terminal

**Category:** Business
**Age Rating:** 4+
**Privacy Policy URL:** https://restoreassist.app/privacy

---

#### Description

```
RestoreAssist CET is a kiosk video player for iPad, designed to be shown to property damage clients during insurance restoration inspections.

Technicians hand clients the iPad during the inspection. Clients watch short, professionally produced educational videos explaining their insurance rights, the restoration process, and what to expect — from a company they can trust.

WHAT'S INCLUDED
• Your Right to Choose Your Own Repairer — cites Insurance Contracts Act 1984 s.54 and AFCA Complaint Resolution Standard 7.2
• Company introduction and team credentials
• How the claims process works
• Understanding your insurance policy
• Equipment explainer — what those meters and machines actually measure
• Safety brief for occupants during restoration
• Realistic timeline expectations
• Common questions answered
• How to communicate effectively with your insurer
• Understanding your scope of works

QR SHARING
The preferred supplier rights video is shareable via QR code — send it to clients before you arrive.

OFFLINE-FIRST
All videos download to the iPad over WiFi. Playback works without internet during the inspection.

SETUP
Enter your library access code once during device setup. The CET app fetches your company-branded video library and keeps it updated automatically.

ANALYTICS (optional add-on)
Track which videos clients watch and their completion rates. Analytics data is available in your RestoreAssist dashboard.

---
Requires a RestoreAssist account. CET video library included with subscription.
```

---

#### Screenshots — CET (iPad only)

**iPad Pro 13" (required):** 2064 × 2752 px (portrait) or 2752 × 2064 px (landscape)
**iPad Pro 11" (required):** 1668 × 2388 px

Recommended content:

1. Video grid (home screen) with thumbnails
2. Video playing fullscreen (preferred supplier rights video)
3. Company branding shown in header
4. Setup / access code entry screen

---

## GitHub Secrets Required

Add these in GitHub → Settings → Secrets and Variables → Actions:

### Android Field App

| Secret                             | Description                                                 |
| ---------------------------------- | ----------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`          | `base64 -i restoreassist-release.jks` output                |
| `ANDROID_KEY_STORE_PASSWORD`       | Keystore password you set during keytool                    |
| `ANDROID_KEY_ALIAS`                | Key alias (e.g. `restoreassist`)                            |
| `ANDROID_KEY_PASSWORD`             | Key password (same as store password if using one password) |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Service account JSON from Google Play Console API           |

### Android CET App

| Secret                           | Description                              |
| -------------------------------- | ---------------------------------------- |
| `CET_ANDROID_KEYSTORE_BASE64`    | `base64 -i cet-release.jks` output       |
| `CET_ANDROID_KEY_STORE_PASSWORD` | CET keystore password                    |
| `CET_ANDROID_KEY_ALIAS`          | CET key alias (e.g. `restoreassist-cet`) |
| `CET_ANDROID_KEY_PASSWORD`       | CET key password                         |

### Existing secrets also needed by Android workflow

| Secret              | Where it's set          |
| ------------------- | ----------------------- |
| `NEXTAUTH_SECRET`   | Already in .env.local   |
| `DATABASE_URL_PROD` | Production database URL |

---

## Closed Testing — Google Play (New Account Requirement)

New Google Play accounts must run a closed test for **14 consecutive days** with
**at least 12 opted-in testers** before the app can go live on the Play Store.

**SE actions:**

1. Create the app in Play Console (Production track → Release → Create new release)
2. Upload the signed AAB to the **Closed Testing** track
3. Set up a testing group with invite link
4. Send invite link to at least 12 people (colleagues, family, staff, clients)
5. Testers must accept the invite AND install the app on an Android device

After 14 days with 12+ testers, you can promote to Production.

**This is mandatory and cannot be skipped for new accounts registered as individuals.**
Organisation accounts have a simplified path — another reason to register as Organisation.
