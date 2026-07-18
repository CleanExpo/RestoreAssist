# Store Privacy Disclosures — App Store + Play Console

Drafted from the in-app `app/privacy/page.tsx` and the actual data
flows we've shipped (workspace SSO, Cloudinary photos, Anthropic AI,
Vercel hosting, Stripe billing, Supabase Postgres). Operator copies
each section into the relevant store form.

> **Truthfulness gate:** every "yes" below corresponds to a real
> data path in the codebase. If a row claims we collect something
> we don't, the store will reject the submission and our
> credibility takes a hit. Verify against `lib/observability.ts`,
> `lib/storage/`, `lib/ai/`, `prisma/schema.prisma` before submission.

---

## App Store Connect — Privacy Nutrition Labels

App Store Connect → App Information → App Privacy → Edit.

### Step 1 — Data Collection (yes/no)

**Does this app collect data?** Yes.

### Step 2 — Categories collected

For each category below, select the data types and answer the
linked tracking + identification questions identically.

#### Contact Info

-  Name — collected, **linked to user**, used for **App Functionality** + **Account-related**, **not used for tracking**
-  Email Address — collected, linked, used for App Functionality + Account-related, not used for tracking
-  Phone Number — collected (optional, for SMS notifications), linked, used for App Functionality, not used for tracking
-  Physical Address — collected (property addresses on inspections), linked, used for App Functionality, not used for tracking
-  Other User Contact Info — no

#### User Content

-  Photos or Videos — collected (inspection photos via the camera + photo library), linked, used for App Functionality, not used for tracking
-  Audio Data — **only** if voice-observation feature is used; collected, linked, used for App Functionality, not used for tracking
-  Other User Content — collected (free-text notes on inspections, claims, scope items), linked, used for App Functionality, not used for tracking

#### Identifiers

-  User ID — collected (workspace user id from NextAuth), linked, used for App Functionality + Analytics, not used for tracking
-  Device ID — **no** (we don't read IDFA/IDFV)

#### Usage Data

-  Product Interaction — collected (Vercel Analytics page-view + click telemetry), linked, used for **Analytics** + App Functionality, not used for tracking
-  Advertising Data — no
-  Other Usage Data — no

#### Diagnostics

-  Crash Data — collected (Vercel Runtime Logs), **not linked** to identity, used for **App Functionality**, not used for tracking
-  Performance Data — same as above
-  Other Diagnostic Data — same as above

#### Location

-  Coarse Location — collected (postcode → state derivation, property GPS on photos when EXIF is present), linked, used for App Functionality, not used for tracking
-  Precise Location — **no** (we never request `whenInUse` GPS; only EXIF from user-captured photos)

#### Financial Info

-  Payment Info — collected by **Stripe**, the app itself does not see card numbers. Disclosed as collected by a third party.
-  Credit Info — no
-  Other Financial Info — no

#### Health & Fitness

-  none

#### Sensitive Info

-  none

#### Contacts

-  none (we never read the device contact book)

#### Browsing History / Search History / Surveys / Other

-  none

### Tracking declaration

**Do you or your third-party partners use data for tracking?** **No.**

(Tracking under Apple's definition = linking user data with third-party data for advertising or sharing with data brokers. We do neither.)

### Privacy policy URL

https://restoreassist.app/privacy

### App Privacy contact

privacy@restoreassist.app

---

## Google Play Console — Data Safety

Play Console → App content → Data safety → Manage.

### Section 1 — Data collection and security

**Does your app collect or share any of the required user data
types?** **Yes.**

**Is all of the user data collected by your app encrypted in
transit?** **Yes** (HTTPS-only on every endpoint; Capacitor
`androidScheme: "https"` + `cleartext: false`).

**Do you provide a way for users to request that their data is
deleted?** **Yes** — see `app/privacy/page.tsx` request flow + the
`DELETE` paths on inspection / report endpoints (gated by tenancy).

### Section 2 — Data types

| Type                                         | Collected         | Shared | Optional? | Purposes                              |
| -------------------------------------------- | ----------------- | ------ | --------- | ------------------------------------- |
| Personal info — Name                         | yes               | no     | no        | Account management, App functionality |
| Personal info — Email                        | yes               | no     | no        | Account management, App functionality |
| Personal info — Phone (SMS opt-in)           | yes               | no     | yes       | App functionality                     |
| Personal info — Address (property addresses) | yes               | no     | no        | App functionality                     |
| Photos and videos — Photos                   | yes               | no     | no        | App functionality                     |
| Audio — Voice or sound recordings            | yes (voice obs)   | no     | yes       | App functionality                     |
| Files and docs                               | yes (PDF reports) | no     | no        | App functionality                     |
| Location — Approx                            | yes               | no     | yes       | App functionality                     |
| Location — Precise                           | no                | —      | —         | —                                     |
| Financial info — Payment                     | yes (via Stripe)  | no     | no        | App functionality                     |
| App info & performance — Crash logs          | yes               | no     | no        | Analytics                             |
| App info & performance — Diagnostics         | yes               | no     | no        | Analytics                             |
| App activity — Interactions                  | yes               | no     | no        | Analytics, App functionality          |
| Device or other IDs                          | no                | —      | —         | —                                     |

### Section 3 — Security practices

-  Data is encrypted in transit
-  You can request data deletion
-  Committed to Play Families Policy (n/a — adult professional app, but no harm)
-  Independent security review — **no** (none commissioned yet)

### Privacy policy URL

https://restoreassist.app/privacy

---

## Verification checklist (before submitting to either store)

- [ ] `app/privacy/page.tsx` lists every data category disclosed above
- [ ] Stripe is the only path that ever sees card numbers (confirmed via `lib/payments/`)
- [ ] No `IDFA` request anywhere in the codebase (`grep -r "advertisingIdentifier" ios/` should be empty)
- [ ] No coarse-location request without EXIF context (we don't ask for runtime location permission — verify in `Info.plist` + `AndroidManifest.xml`)
- [ ] Vercel Analytics is the only product-interaction telemetry surface (confirmed via `@vercel/analytics` in `package.json`)
