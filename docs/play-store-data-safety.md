# Play Store Data Safety Declarations — RestoreAssist

> **Source-of-truth** for what to enter in the Play Console **Data Safety** form.
> Hand-fill this into Play Console → App content → Data safety.
> Last reviewed: 14 May 2026 (RA-3015 Android launch).

Every declaration here is anchored to the live privacy policy at
`https://restoreassist.app/privacy` and to actual code paths in the field app
(`com.restoreassist.app`). When in doubt, defer to whatever the policy and the
code actually do — and update both the policy and this doc together.

---

## App-level questions

| Question                                              | Answer | Notes                                                                                                                 |
| ----------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| Does your app collect or share any of the data types? | **Yes** | We collect identity + financial + location + media data — see itemised list below.                                  |
| Is all data collected encrypted in transit?           | **Yes** | All API traffic is TLS 1.2+ over HTTPS. Cloudinary uploads use signed HTTPS POST. Stripe SDK enforces TLS.            |
| Do you provide a way for users to request data deletion? | **Yes** | In-app: Settings → Account → Delete account. Out-of-app: email `privacy@restoreassist.app` with deletion request.   |

**Deletion request URL (Play Console field):**
`https://restoreassist.app/privacy#account-deletion`

---

## Data types collected

For each type below: declare `Collected: yes`, then tick the listed purposes,
then declare whether it is `Required` (user can't use core features without it)
or `Optional` (user can decline).

### Personal info

| Type             | Collected | Shared | Purposes                                       | Required? | Notes                                                                |
| ---------------- | --------- | ------ | ---------------------------------------------- | --------- | -------------------------------------------------------------------- |
| **Name**         | Yes       | No     | Account management, App functionality, Personalization | Required  | Captured at signup; printed on reports.                              |
| **Email address**| Yes       | Yes    | Account management, Communications             | Required  | Shared with **Stripe** (payment receipts) and **Resend** (transactional email). |
| **User IDs**     | Yes       | No     | Account management, App functionality          | Required  | Internal `User.id` (cuid). Not shared.                               |
| **Address**      | Yes       | Yes    | Account management, App functionality          | Optional  | Business address; shared with **Stripe** (Tax registration / GST), and with **Xero / MYOB / QuickBooks** **only when the user connects their own BYOK integration.** |
| **Phone number** | Yes       | No     | Account management, App functionality          | Optional  | Used for support callbacks; not exposed in client-facing surfaces.   |
| **Other info**   | Yes       | No     | App functionality                              | Optional  | ABN, ACN, licence numbers — for invoicing + compliance attestations. |

### Financial info

| Type                  | Collected | Shared | Purposes                  | Required? | Notes                                                                 |
| --------------------- | --------- | ------ | ------------------------- | --------- | --------------------------------------------------------------------- |
| **User payment info** | **No**    | —      | —                         | —         | **Processed entirely by Stripe.** We never see or store card numbers. Tokenised IDs only. |
| **Purchase history**  | Yes       | No     | App functionality, Analytics | Required  | Subscription status + invoice history kept locally for billing UI.    |

> Important: in the form, leave "User payment info" **unchecked** because we
> don't store it. We do hold a Stripe Customer ID + Subscription ID + Stripe
> Invoice IDs, but those are not card data.

### Location

| Type                    | Collected | Shared | Purposes                  | Required? | Notes                                                                                                                |
| ----------------------- | --------- | ------ | ------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| **Approximate location**| Yes       | No     | App functionality         | Required  | Stamped onto inspection photos for IICRC S500:2021 §10.5 chain-of-custody.                                          |
| **Precise location**    | Yes       | No     | App functionality         | Required  | Same use-case (GPS lat/lon to ~10m). Only captured during photo / reading capture; **not** tracked in the background. |

### Files and docs

| Type                | Collected | Shared | Purposes          | Required? | Notes                                                                                                                |
| ------------------- | --------- | ------ | ----------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| **Files and docs**  | Yes       | Yes    | App functionality | Required  | Inspection PDFs, floor plans, authority forms. Shared with **Cloudinary** (storage/CDN) and with **Google Drive** **only when the user connects BYOK Drive**. |

### Photos and videos

| Type        | Collected | Shared | Purposes                       | Required? | Notes                                                                              |
| ----------- | --------- | ------ | ------------------------------ | --------- | ---------------------------------------------------------------------------------- |
| **Photos**  | Yes       | Yes    | App functionality              | Required  | Evidence captures. Stored on **Cloudinary**. EXIF + GPS metadata is preserved on capture and signed by a per-device Ed25519 key (RA-1386). |
| **Videos**  | **No**    | —      | —                              | —         | Not part of v1 of the field app. Recheck before any v1.x release that ships video. |

### App activity

| Type                       | Collected | Shared | Purposes                        | Required? | Notes                                                                       |
| -------------------------- | --------- | ------ | ------------------------------- | --------- | --------------------------------------------------------------------------- |
| **App interactions**       | Yes       | No     | App functionality, Analytics    | Required  | Server logs of API requests. Used for security monitoring + bug triage.     |
| **In-app search history**  | Yes       | No     | App functionality               | Optional  | Recent-search persistence; tied to `User.id`, never aggregated cross-user. |
| **Other user-generated content** | Yes | No     | App functionality              | Required  | Inspection notes, moisture readings, scope items, authority-form answers.   |

### App info and performance

| Type                       | Collected | Shared | Purposes      | Required? | Notes                                              |
| -------------------------- | --------- | ------ | ------------- | --------- | -------------------------------------------------- |
| **Crash logs**             | Yes       | No     | Analytics     | Optional  | Native Capacitor crash plugin → server log sink.   |
| **Diagnostics**            | Yes       | No     | Analytics     | Optional  | Capacitor `Device` plugin reports OS + model only. |
| **Other app performance data** | No    | —      | —             | —         | No third-party APM (Datadog/Sentry) in v1.        |

### Device or other IDs

| Type                  | Collected | Shared | Purposes              | Required? | Notes                                                            |
| --------------------- | --------- | ------ | --------------------- | --------- | ---------------------------------------------------------------- |
| **Device or other IDs** | Yes     | No     | Account management, Fraud prevention | Required | Per-device Ed25519 `publicKeyId` (RA-1386) registered at enrolment to sign C2PA photo manifests. |

---

## Data types we explicitly do **not** collect

| Type                       | Why                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| Race / ethnicity           | Out of scope.                                                                                |
| Political / religious info | Out of scope.                                                                                |
| Sexual orientation         | Out of scope.                                                                                |
| Health / fitness data      | Out of scope.                                                                                |
| SMS / call logs            | App does not request these permissions on Android.                                           |
| Contacts                   | Not collected. Manual entry only.                                                            |
| Calendar                   | Not collected.                                                                               |
| Music / audio              | Not collected. (Voice notes are recorded in-app, stored as files — declared above.)         |
| Web browsing history       | Not collected.                                                                               |
| Installed apps             | Not collected.                                                                               |
| Government IDs             | Not collected. (We capture **licence numbers** as free text — declared under "Other info".) |
| Biometric data             | Not collected.                                                                               |

---

## Security practices

| Practice                                            | Status | Notes                                                                                                                  |
| --------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| Data encrypted in transit                           | **Yes** | TLS 1.2+ enforced at Vercel edge. Mobile HTTP cleartext disabled in `network_security_config.xml`.                   |
| Data encrypted at rest                              | **Yes** | Supabase Postgres AES-256 at rest. Cloudinary storage encryption. Google Drive (BYOK) inherits Google's encryption.   |
| Users can request data deletion                     | **Yes** | In-app + email channels documented at `https://restoreassist.app/privacy#account-deletion`.                            |
| Users can request data correction / access          | **Yes** | Email `privacy@restoreassist.app`. 30-day SLA per Privacy Act APP 12 / 13.                                            |
| App follows Play Families Policy                    | N/A    | App is rated 18+ and is occupational tooling — not directed at children.                                              |
| Independent security review                         | **No** | Will revisit when SOC 2 / ISO 27001 work begins (not on the FY26 roadmap).                                            |

---

## Operator checklist before submitting

- [ ] Privacy policy URL set to `https://restoreassist.app/privacy` — verified live (HTTP 200) on the day of submission.
- [ ] Account-deletion URL set to `https://restoreassist.app/privacy#account-deletion`.
- [ ] Every row above pasted into Play Console with matching purposes ticked.
- [ ] If a new feature added between this doc's last-reviewed date and submission collects ANY new data type, **update this doc and the privacy policy first**, then update Play Console. Never let the form drift ahead of the policy.

---

## Change log

| Date         | Change                                       | Linear       |
| ------------ | -------------------------------------------- | ------------ |
| 2026-05-14   | Initial Play Store submission baseline.      | RA-3015      |
