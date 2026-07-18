# Google Play Console — Submission Package (RestoreAssist v1.0)

**Owner:** Phill McGurk
**App:** RestoreAssist (Capacitor wrapping `https://restoreassist.app`)
**Application ID:** `com.restoreassist.app`
**Reference runbook:** `docs/MOBILE_RELEASE_RUNBOOK.md` § 3 + § 4 + § 6
**Status check:** Android signing pipeline wired (`.github/workflows/android-release.yml`); icons + listing copy ready

> **One-stop paste sheet.** Every Play Console field below has its source value inline so you don't have to flip files. Owner-only — Claude does not click Submit.

---

## §A — Play Console → All apps → Create app

| Field            | Value                                                   |
| ---------------- | ------------------------------------------------------- |
| App name         | `RestoreAssist`                                         |
| Default language | `English (Australia) – en-AU`                           |
| App or game      | App                                                     |
| Free or paid     | Free                                                    |
| Declarations     | acknowledge Developer Program Policies + US export laws |

---

## §B — Setup → App content (Policy section, required for review)

| #   | Item                         | Value                                                                                                    |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | **Privacy policy**           | URL: `https://restoreassist.app/privacy`                                                                 |
| 2   | **App access**               | "All functionality is available without special access" → **NO** — provide reviewer creds (see §E below) |
| 3   | **Ads**                      | "No, my app does not contain ads"                                                                        |
| 4   | **Content rating**           | Run questionnaire — see §F below                                                                         |
| 5   | **Target audience**          | 18+ (professional tool; not for children)                                                                |
| 6   | **News app**                 | No                                                                                                       |
| 7   | **COVID-19 contact tracing** | No                                                                                                       |
| 8   | **Data safety**              | Fill from §D below (paste-ready)                                                                         |
| 9   | **Government apps**          | No                                                                                                       |
| 10  | **Financial features**       | No (Stripe payment is processing only, not a financial product)                                          |
| 11  | **Health**                   | No                                                                                                       |

---

## §C — Setup → Store settings

| Field                    | Value                                                                |
| ------------------------ | -------------------------------------------------------------------- |
| App category — Primary   | `Business`                                                           |
| App category — Secondary | `Productivity`                                                       |
| Tags                     | `compliance`, `field-service`, `IICRC`, `restoration`                |
| Email address            | (operator email — must be valid + monitored for review-team replies) |
| Phone (optional)         | (your AU mobile, optional)                                           |
| Website                  | `https://restoreassist.app`                                          |

---

## §D — Data safety (paste each section into Play Console form)

Source: `distribution/PRIVACY_DISCLOSURES.md` § "Google Play Console — Data Safety"

### D.1 Data collection and security

| Question                                                              | Answer                                                                                         |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Does your app collect or share any of the required user data types?   | **Yes**                                                                                        |
| Is all of the user data collected by your app encrypted in transit?   | **Yes** (HTTPS only — no cleartext per `capacitor.config.ts: cleartext: false`)                |
| Do you provide a way for users to request that their data is deleted? | **Yes** — `/api/user/account` DELETE endpoint per RA-1350 (Privacy Act 1988 APP 11 compliance) |

### D.2 Data types collected (mark each)

| Category                 | Data Type                    | Collected                                   | Shared | Optional/Required      | Purpose                                                     |
| ------------------------ | ---------------------------- | ------------------------------------------- | ------ | ---------------------- | ----------------------------------------------------------- |
| Personal info            | Name                         | [PASS]                                          | [FAIL]     | Required               | Account management, App functionality                       |
| Personal info            | Email address                | [PASS]                                          | [FAIL]     | Required               | Account management, App functionality                       |
| Personal info            | Phone number                 | [PASS]                                          | [FAIL]     | Optional               | App functionality (SMS notifications)                       |
| Personal info            | Address                      | [PASS]                                          | [FAIL]     | Required               | App functionality (property addresses)                      |
| Personal info            | Other info (free-text notes) | [PASS]                                          | [FAIL]     | Optional               | App functionality                                           |
| Financial info           | Payment info                 | [PASS] (via Stripe)                             | [FAIL]     | Required for paid tier | Account management — disclosed as third-party (Stripe)      |
| Location                 | Approximate location         | [PASS]                                          | [FAIL]     | Optional               | App functionality (postcode → state derivation; photo EXIF) |
| Location                 | Precise location             | [FAIL]                                          | —      | —                      | We do NOT request `whenInUse` GPS                           |
| Photos and videos        | Photos                       | [PASS]                                          | [FAIL]     | Optional               | App functionality (inspection documentation)                |
| Photos and videos        | Videos                       | [FAIL]                                          | —      | —                      | (not in v1)                                                 |
| Audio files              | Voice or sound recordings    | [PASS] (only if voice-observation feature used) | [FAIL]     | Optional               | App functionality                                           |
| App activity             | App interactions             | [PASS]                                          | [FAIL]     | Required               | Analytics (Vercel Analytics — anonymised)                   |
| App activity             | In-app search history        | [FAIL]                                          | —      | —                      | (not collected)                                             |
| App activity             | Other actions                | [FAIL]                                          | —      | —                      | (not collected)                                             |
| App info and performance | Crash logs                   | [PASS]                                          | [FAIL]     | Required               | App functionality (Vercel Runtime Logs)                     |
| App info and performance | Diagnostics                  | [PASS]                                          | [FAIL]     | Required               | App functionality                                           |
| Device or other IDs      | Device or other IDs          | [FAIL]                                          | —      | —                      | (we do not read IDFA/IDFV/Advertising ID)                   |

### D.3 Security practices

- Data is encrypted in transit [PASS] (HTTPS-only)
- Users can request data deletion [PASS] (DELETE /api/user/account endpoint)
- Data is encrypted at rest [PASS] (Supabase managed Postgres + Vercel Blob)
- Independent security review [FAIL] (not yet — note as "No" honestly)

---

## §E — Reviewer access credentials

Per Play Console § Setup → App content → App access:

| Field      | Value                                                                                                                                                                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App access | `All or some functionality is restricted`                                                                                                                                                                                                                               |
| Username   | `reviewer@restoreassist.app`                                                                                                                                                                                                                                            |
| Password   | (provisioned per §K below — fresh, scoped to a clean reviewer workspace)                                                                                                                                                                                                |
| Notes      | "Sign in with email + password. The dashboard shows recent inspections. Tap any inspection to view its room-by-room moisture readings, photos, and scope of works. The 'New Inspection' flow demonstrates offline-first capture; toggle airplane mode to see queueing." |

[WARN] Provision the reviewer workspace fresh — DO NOT use real pilot creds.

---

## §F — Content rating questionnaire

Per Play Console → App content → Content rating. Answer the IARC questionnaire as **business/productivity tool**:

| Section                           | Answer                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Violence                          | None                                                                                                                             |
| Sexual content                    | None                                                                                                                             |
| Strong language                   | None                                                                                                                             |
| Controlled substances             | None                                                                                                                             |
| Gambling                          | None                                                                                                                             |
| User-generated content moderation | "User content (photos, notes) is internal to the user's workspace; not publicly visible. Workspace owners moderate their teams." |
| User communication features       | None — no in-app chat or messaging visible to other users                                                                        |
| Location sharing                  | "Approximate location only, used for property addresses on inspections. Not shared with other users."                            |
| Personal info sharing             | "Within workspace only — between team members the workspace owner has invited."                                                  |
| Digital purchases                 | None (subscription via web, not in-app)                                                                                          |
| Result                            | Expected: **Everyone** / IARC: All ages                                                                                          |

---

## §G — Pricing & distribution

| Field                 | Value                                                                      |
| --------------------- | -------------------------------------------------------------------------- |
| Free or paid          | Free                                                                       |
| Countries / regions   | **Australia + New Zealand** for v1 (limit per `MOBILE_RELEASE_RUNBOOK.md`) |
| Devices               | Phone, 7" tablet, 10" tablet (Capacitor adaptive layout)                   |
| Contains ads          | No                                                                         |
| Designed for families | No (B2B professional tool, 18+)                                            |

---

## §H — Store listing assets

Source: `distribution/store-listings.md` § Google Play Store + `distribution/icon-source/out/`

| Field                                                    | Path / Value                                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| App name                                                 | `RestoreAssist — Water Damage Compliance`                                                                 |
| Short description (80 chars)                             | `IICRC-compliant water damage restoration platform for Australian professionals`                          |
| Full description (4000 chars)                            | (paste from §I below)                                                                                     |
| App icon (512×512)                                       | `distribution/icon-source/out/android-512.png`                                                            |
| Adaptive icon — foreground (432×432)                     | `distribution/icon-source/out/adaptive-fg-432.png`                                                        |
| Adaptive icon — background (432×432)                     | `distribution/icon-source/out/adaptive-bg-432.png`                                                        |
| Feature graphic (1024×500)                               | `distribution/icon-source/out/android-feature-graphic.png`                                                |
| Phone screenshots (≥2, max 8, 16:9 or 9:16, min 320×320) | `distribution/screenshots/play-store/phone/*.png` (run `node distribution/capture-screenshots.mjs` first) |
| 7" tablet screenshots                                    | `distribution/screenshots/play-store/tablet-7/*.png`                                                      |
| 10" tablet screenshots                                   | `distribution/screenshots/play-store/tablet-10/*.png`                                                     |
| Promo video (optional)                                   | None for v1                                                                                               |

---

## §I — Full description (paste verbatim)

```
RestoreAssist is the all-in-one field and reporting platform built exclusively for Australian water damage, fire, and storm restoration professionals.

**IICRC-Compliant Workflow**
Conduct room-by-room inspections aligned with IICRC S500:2021, S520:2024, and S700:2025 standards. Record moisture readings, drying logs, equipment placements, and scope of works — all in a structured format that satisfies insurance and state building-authority requirements.

**AI-Powered Efficiency**
Point your camera at a moisture meter and let RestoreAssist read the value automatically. AI photo analysis eliminates manual data entry and reduces errors on site.

**Offline-First Field Tool**
Work in basements, rural properties, and areas without mobile signal. All data is captured offline and syncs automatically when connectivity is restored.

**Professional Reporting**
Generate PDF inspection reports, scope of works, and visual cost estimates in seconds. Reports are formatted to meet insurer and building authority requirements across all Australian states and territories.

**Seamless Integrations**
Push jobs and invoices directly to Xero, MYOB, QuickBooks, Ascora, and ServiceM8. Eliminate double entry and keep your back-office in sync with every site visit.

**Built for Australian Compliance**
• IICRC S500:2021 water damage inspection workflows (5th edition)
• IICRC S520:2024 mould remediation scope support
• IICRC S540:2023 trauma & biohazard remediation
• IICRC S700:2025 fire and smoke damage assessments
• NCC Volume 2 Part 3.5 storm-damage NCC compliance
• NADCA ACR 2021 + AS/NZS 3666 HVAC hygiene
• GST-compliant invoicing (10% Australian GST)
• State-specific building codes (QLD, NSW, VIC, SA, WA, TAS, ACT, NT)
• ABN validation and state-by-state regulator checklists (QBCC, VBA, NSW Fair Trading, etc.)

**Who Uses RestoreAssist**
RestoreAssist is used by independent restoration contractors, franchise operators, and multi-site restoration companies throughout Australia. Whether you're a sole trader attending a single water damage call or managing a team across multiple active jobs, RestoreAssist scales with your business.

**Key Features**
• Room-by-room moisture mapping with psychrometric calculations
• Equipment tracking and drying log management
• Photo documentation with AI meter reading
• Scope of works generation
• Visual cost estimation
• Customer invoice creation
• Insurance claim documentation support
• Multi-user job management
• Offline data capture with automatic sync
• Secure cloud storage for all job records

Download RestoreAssist and transform how you document, report, and invoice restoration work.
```

---

## §J — Release tracks

Per Play Console → Production / Closed testing / Internal testing.

**Recommended path for v1:**

1. **Internal testing** (24h smoke) — upload first AAB to internal track, smoke-test on 2-3 devices. Auto-rollouts via `r0adkll/upload-google-play` action with `track: internal`.
2. **Closed testing** (optional, 7-14 days) — invite 5-10 known restoration pros if desired. Skip for v1 if confidence is high.
3. **Production** (staged rollout) — start at **5% of AU + NZ**, monitor crash-free rate + Vitals for 48h, then ramp to 25% → 50% → 100%. Keep `staged_rollout: 0.05` initial in the workflow file.

---

## §K — Pre-submit checklist

- [ ] Google Play Console developer account active ($25 one-time enrolment)
- [ ] Android upload keystore generated + base64-encoded → `ANDROID_KEYSTORE_BASE64` GitHub Secret
- [ ] All 4 keystore-related secrets in GitHub: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
- [ ] Google Play service-account JSON downloaded → `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` GitHub Secret
- [ ] Reviewer workspace provisioned (`reviewer@restoreassist.app` — DO NOT use real pilot creds)
- [ ] Phone + 7" + 10" tablet screenshots captured via `node distribution/capture-screenshots.mjs`
- [ ] App icon (512×512), adaptive icons, and feature graphic uploaded
- [ ] Data safety form filled per §D
- [ ] Content rating questionnaire submitted per §F
- [ ] AAB uploaded to internal track (CI auto-uploads via `android-release.yml`)
- [ ] All 11 § App content items per §B answered (Privacy, App access, Ads, Content rating, Target audience, etc.)
- [ ] Pricing & distribution set to Free + AU + NZ
- [ ] App release "What's new" pasted (same content as App Store — see `whatsnew/whatsnew-en-AU`)

When all 13 items above are checked: click **Send for review** on the Production release.

---

## §L — After submission

| Stage                 | Typical duration                                                 | Notes                                                                  |
| --------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `Pending publication` | minutes                                                          | Play has indexed the AAB                                               |
| `In review`           | 24-72h for new app, 2-7 days for sensitive permissions           | Pure WebView wrapping a public site = usually faster                   |
| `Live in production`  | within 1-3h after approval                                       | If staged rollout 5% → only 1 in 20 users will see it. Monitor Vitals. |
| Rejected              | typically requires Data Safety form or content-rating refinement | Read reviewer's email, fix, resubmit                                   |

---

 **Companion docs:** `distribution/app-store-submission-package.md` (App Store), `distribution/store-listings.md` (raw copy), `distribution/PRIVACY_DISCLOSURES.md` (truthful data flow audit), `docs/MOBILE_RELEASE_RUNBOOK.md` (full release process)
