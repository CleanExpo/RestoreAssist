# Customer Portal + Multi-Seat Licensing — Strategic Wedge Design

**Status:** Draft for Phill's review — research-backed (Margot deep_research_max in flight; this draft contains the locked model from chat + cross-business context; research findings will be integrated as a follow-up commit on this branch)

**Branch:** `feat/customer-portal-spec-design`
**Date:** 2026-05-15
**Cross-business impact:** Disaster Recovery (tenant zero) · NRPG (content network) · RestoreAssist (platform) · Unite-Group ($2B exit thesis)

---

## Executive summary

The Customer Portal is the **strategic wedge** that distinguishes RestoreAssist from Encircle, DocuSketch, ServiceM8, and Ascora. None of those offer a client-facing branded explainer app that helps restoration customers understand the process and navigate insurance claims. RestoreAssist makes this a free, branded, content-rich asset that the tradie sends to their client during a job — turning the client's anxious wait into a guided learning experience that doubles as a marketing-trojan-horse (customers see the tradie's brand + RA's quality + NRPG's methodology).

This single architecture project bundles two intertwined deliverables:

1. **Multi-seat licensing model** — $99 desktop org subscription + $11 per-user mobile seat (one $11 covers iPhone + iPad for that user). Customer Portal is $0 (free).
2. **Customer Portal explainer hub** — branded iPad/iPhone surface for clients, served via Customer Link from the org admin, containing process explainers + insurance-claim walkthroughs + policy-terminology glossary + about-the-business content.

**Not for T-day (2026-05-20).** Multi-week implementation. Spec lands now, build begins post-launch as Wave 3.

---

## Strategic context

### Three businesses, one wedge

| Business | Role in this design |
|---|---|
| **Disaster Recovery (DR)** | Tenant zero. The "DR Method" — Phill's proprietary restoration approach — is the gold-standard content that seeds the platform. Already integrated into RA via `DrNrpgIntegration` Prisma model + webhooks + cron. |
| **NRPG (National Recovery Partner Group)** | Industry content network. The 100-point certification methodology + ANZ Property Services Industry Association vision provide the content backbone. Every NRPG member is a candidate RA org; their Customer Portal can ship NRPG-branded content as the "platform default". |
| **RestoreAssist (RA)** | The platform that delivers the content. Provides the multi-tenant infrastructure, branding overlay, billing rails, and Customer Link distribution. Charges per-org via $99 desktop + $11 mobile-seat model. |

### Why competitors can't easily copy this

- **Encircle / DocuSketch / Magicplan** = field-documentation tools. No customer-facing surface.
- **ServiceTitan / Jobber / Housecall Pro** = US service-business SaaS. Have customer-status portals but no insurance-claim education depth.
- **Xactimate** = adjuster tool. Adversarial-to-tradie, not for clients.
- **The moat** = NRPG's curated AU insurance-claim content + Phill's DR Method + plain-language regulatory translation that takes years to author. Network effect from NRPG membership compounds.

### Commercial loop

Restoration customer anxiety + insurance-claim confusion = slow invoice payment. Customer Portal reduces both. Faster invoice payment = faster org cash flow = more orgs willing to pay $99 + $11/seat. Network compounds.

---

## Confirmed model (from Phill chat 2026-05-15)

### Pricing tiers

| Seat type | Price (AUD/mo) | Scope |
|---|---|---|
| **Desktop main subscription** | **$99** | Organization owner. Configures integrations ONCE on web. Has admin screens (billing, integrations, team roster). All API keys + OAuth tokens live on Organization, NOT User. |
| **Mobile/Tablet user seat** | **$11 per user** | Per User who wants iPhone OR iPad access. One $11 covers BOTH device types for that user. Inherits all org integrations — no per-device API-key install. |
| **Customer Portal access** | **$0 (free)** | Per ClientPortalAccount. Branded explainer hub, content-only, no tradie tools, no integration access. Sent via Customer Link by org admin. |

**Example billing:**
- `phill.mcgurk@gmail.com` org (Disaster Recovery) = $99/mo desktop seat
- Phill on iPhone = +$11/mo
- `support@unite-group.in` (Phill's colleague) joins via Technician Link, wants iPhone = +$11/mo
- 3 customer clients view their Customer Portal = +$0 (free)
- **Org bill: $121/mo on Phill's Stripe customer**

### Two link types from main account

1. **Technician Link** → invitee becomes a `User` with role `TECHNICIAN`, paid mobile seat required. Already partially built (SP-2 invited-technician onboarding, shipped earlier this month).
2. **Customer Link** → invitee gets a `ClientPortalAccount`, free portal access (content + their job data). Existing model from earlier sub-projects.

### Customer Portal content surface

Per Phill's directive (chat 2026-05-15):
- Process explainer **videos** (day 1, day 3, day 7 of a typical job)
- "What to expect" sequences
- Insurance-claim **walkthroughs** (lodgement → assessor → scope → payment → dispute)
- Policy-terminology **glossary** (excess, make-safe, subrogation, period of indemnity, reinstatement vs indemnity value, depreciation, etc.)
- **About-the-business** (branded org info, team, BSafe/IICRC certifications, testimonials)
- **Blog posts** for ongoing client education
- Other content to be designed iteratively

### Integration inheritance

- All API keys (OpenAI, Anthropic, Gemini, Cloudinary, Resend) = **Organization-level**, shared across all User devices in the org. No per-device key installation.
- OAuth integrations (Xero, Google Drive) = need finer-grained scope decision (see Decision Point 5 below).

---

## Decision points — answered + open

### Locked (per Phill 2026-05-15)

| Decision | Locked value |
|---|---|
| Customer Portal pricing | **Free** ($0) |
| Customer Portal purpose | **Branded explainer hub**, not just job status |
| Content surface | Videos + blog posts + walkthroughs + glossary + about-the-business |
| Strategic importance | **Wedge feature** — RA differentiation vs Encircle/DocuSketch/etc |
| NRPG content role | Network-seed content for NRPG-member orgs |
| DR Method exposure | Customer-facing simplification of DR Method as the platform-default |
| Timing | **Post-T-day**, multi-week Wave 3 build |

### Open — need Phill answer before implementation kicks off

1. **Main Account own iPhone/iPad cost:** Strict reading → main user pays own $11 for mobile. Confirm or bundle into $99?
2. **Per-user vs per-device:** One $11 covers iPhone + iPad for that User. Confirmed strong likely reading. Confirm.
3. **Technician without active $11:** Hard paywall? Grace period (7 days)? Read-only?
4. **OAuth integration scope:** Xero = per-User OAuth by design. API keys = org. Default rule: API keys org-shared, OAuth user-owned but admin-can-share. Confirm.
5. **Stripe billing model:** Org-level Stripe customer with metered Subscription Items per seat type. Confirm.
6. **Apple IAP:** $11 mobile seat consumed in iOS app → Apple takes 30%. Pay through Apple IAP on iOS OR force web-purchase only?
7. **Customer Portal: same IPA or separate App Store submission?** My default: same IPA, customer-mode route. Lower ops cost, faster ship.
8. **Content authoring model:** Platform-default + NRPG seed + org-override hybrid. Confirm.
9. **Branding scope:** Customer sees org branding (Unite Group, Disaster Recovery), NOT "RestoreAssist". Confirm.
10. **Customer Link expiry:** Job-closed + 90 days. Confirm.
11. **State-by-state AU content variants:** ICA + AFCA + ACL terminology has small state differences. Phase 1 = national content; Phase 2 = state variants?

---

## Architecture proposal

### High-level

```
┌────────────────────────────────────────────────────────────────┐
│  RestoreAssist iOS IPA (1.0.x → 2.0.0 with multi-mode shell)   │
│                                                                 │
│  ┌──────────────────────┐    ┌─────────────────────────────┐  │
│  │  Tradie Mode         │    │  Customer Mode              │  │
│  │  (User signed in)    │    │  (ClientPortalAccount via   │  │
│  │                      │    │   Customer Link token)       │  │
│  │  - Inspections       │    │                              │  │
│  │  - Reports           │    │  - Their job status          │  │
│  │  - Photo cocoa       │    │  - Process explainers        │  │
│  │  - Settings          │    │  - Insurance walkthroughs    │  │
│  │  - Integrations      │    │  - Policy glossary           │  │
│  │  - AI Sidekick (SP-G)│    │  - About the business        │  │
│  │                      │    │  - Blog posts                │  │
│  │  Requires $11 seat   │    │  - Customer-facing Sidekick │  │
│  └──────────────────────┘    │    (subset of SP-G)          │  │
│                              │                              │  │
│                              │  FREE                        │  │
│                              └─────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                          │                  │
                          ▼                  ▼
            ┌───────────────────────┐  ┌──────────────────────┐
            │  Server-side state    │  │  Content Service     │
            │  - Org integrations   │  │  - Platform-default  │
            │  - User seats         │  │  - NRPG seed         │
            │  - Stripe billing     │  │  - Org override      │
            │  - Apple IAP receipt  │  │  - Audience-tagged   │
            └───────────────────────┘  └──────────────────────┘
```

### Mode determination

On iOS app launch:
- If Capacitor URL contains `/portal/<token>` → Customer Mode (no sign-in needed; token authenticates as `ClientPortalAccount`)
- Else → Tradie Mode (NextAuth sign-in → User)
- Same IPA, same React app, mode-branched UI. Lower ops cost than separate apps.

### Seat enforcement

When User signs in on iOS:
1. `/api/auth/native-token-exchange` returns session JWT (existing, fixed today via PR #1093/#1094)
2. Middleware checks `User.hasMobileSeat`. If false:
   - **Grace period** = `mobileGracePeriodEndsAt`, 7 days from invite. UI shows banner "7 days left to activate your mobile seat."
   - **Post-grace** = redirect to `/billing/mobile-seat` page. Apple IAP "purchase" button. Or Stripe Customer Portal if Apple IAP rejected.

### Customer Portal authentication

- Customer Link = signed JWT with `clientPortalAccountId` claim, 90-day expiry (job-closed + 90).
- iOS app: deep-link handler (Universal Link `https://restoreassist.app/portal/<token>`) opens app in Customer Mode.
- Web: same URL renders the same React app in Customer Mode.
- No password; token is the credential. Re-issue on rotation (per existing `ClientPortalAccount` rotation).

---

## Data model deltas (Prisma)

### New / extended

```prisma
model Organization {
  // ... existing fields ...

  // Multi-seat licensing
  desktopSeatStatus  String  // "NONE" | "TRIAL" | "ACTIVE" | "CANCELED" | "PAST_DUE"
  desktopSeatStartedAt   DateTime?
  desktopSeatEndsAt      DateTime?
  desktopStripeSubItemId String?

  mobileSeatLimit    Int     @default(0)  // soft cap; informational
  mobileSeatCount    Int     @default(0)  // active mobile seats; bumped/decremented by subscriptions

  // Customer Portal
  customerPortalEnabled    Boolean   @default(true)  // org can opt-out
  customerPortalBrandLogoUrl   String?  // override org logo for portal
  customerPortalBrandColors    Json?    // primary/accent for portal
  customerPortalContentScope   String   @default("PLATFORM_DEFAULT")  // "PLATFORM_DEFAULT" | "NRPG_SEED" | "ORG_CUSTOM" | "HYBRID"

  // Stripe
  stripeCustomerId    String?  @unique
  stripeSubscriptionId String? @unique
}

model User {
  // ... existing fields ...

  // Mobile seat
  hasMobileSeat            Boolean   @default(false)
  mobileSeatActivatedAt    DateTime?
  mobileSeatGraceEndsAt    DateTime?  // null if seat active OR no invite yet
  mobileSeatStripeItemId   String?    // null if Apple IAP route
  mobileSeatAppleReceipt   String?    // base64 receipt for IAP validation
  mobileSeatRevokedAt      DateTime?  // soft delete; preserve for audit
}

model ClientPortalAccount {
  // ... existing fields ...

  // Token + expiry already exists; extend with portal-specific fields
  portalLastOpenedAt   DateTime?
  portalDeviceTypes    Json?  // ["ios", "ipad", "web"] tracking
  portalContentTrack   String @default("standard")  // "standard" | "premium" (org-level upgrade for premium content)
}

model PortalContent {
  id           String   @id @default(cuid())
  scope        String   // "PLATFORM_DEFAULT" | "NRPG" | "ORG" | "OVERRIDE"
  orgId        String?  // null for PLATFORM_DEFAULT + NRPG; set for ORG + OVERRIDE
  audience     String   @default("customer")  // "customer" | "technician" | "both"
  category     String   // "process" | "insurance" | "glossary" | "about" | "blog"
  slug         String
  mdxContent   String   @db.Text  // raw MDX
  videoSlug    String?  // optional reference into VIDEO_REGISTRY
  state        String   @default("DRAFT")  // "DRAFT" | "PUBLISHED" | "ARCHIVED"
  authorOrgId  String?  // who wrote it (NRPG, RA platform team, or specific org)
  publishedAt  DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([scope, orgId, slug])
  @@index([orgId, audience, category, state])
  @@map("PortalContent")
}

model NrpgContentLicense {
  id              String    @id @default(cuid())
  contentId       String    // FK to PortalContent
  licensedOrgId   String    // FK to Organization (the NRPG member)
  licenseTier     String    // "MEMBER_STANDARD" | "MEMBER_PREMIUM"
  expiresAt       DateTime?
  createdAt       DateTime  @default(now())

  @@unique([contentId, licensedOrgId])
}
```

### Migration strategy

Per CLAUDE.md rule #16 (two-step destructive migrations):

- **Phase 1 (additive only):** add fields to existing models, add new `PortalContent` + `NrpgContentLicense` models. NO data deletion. Existing rows get default values.
- **Backfill:** existing User rows get `hasMobileSeat=false` + null grace period. Existing Organization rows get `desktopSeatStatus=ACTIVE` + free historical period (don't penalize current users).
- **Phase 2 (later, if needed):** deprecate any superseded billing fields after Stripe migration verifies clean.

---

## Content strategy

### Three-tier content hierarchy

```
PLATFORM_DEFAULT  (authored by RA platform team)
  ├── Used by: every org out of the box
  ├── Examples: "What is water damage restoration?", "How does my insurance claim work in Australia?"
  └── Scope: national, generic, plain English

NRPG_SEED        (authored by NRPG editorial)
  ├── Used by: NRPG-member orgs (via NrpgContentLicense)
  ├── Examples: "The 5-stage NRPG Method", "Why NRPG-certified contractors?"
  └── Scope: branded NRPG quality mark, methodology-specific

ORG_CUSTOM       (authored by individual org)
  ├── Used by: only that org
  ├── Examples: "About Disaster Recovery", "Meet our team", "Our service area"
  └── Scope: business-specific

ORG_OVERRIDE     (org's customization of a PLATFORM_DEFAULT or NRPG_SEED article)
  ├── Used by: that org, replaces the default for their Customer Portal
  ├── Examples: org swaps "insurance claim general" for their own state-specific version
  └── Scope: per-article override
```

Resolution at runtime: `ORG_OVERRIDE` > `ORG_CUSTOM` > `NRPG_SEED` (if org has license) > `PLATFORM_DEFAULT`.

### Audience tagging (key cost-saver)

Content has `audience: "customer" | "technician" | "both"`.

- SP-8 Help Library articles (8 categories, already shipped) get audience-tagged retroactively. Some categories are technician-only (billing, compliance); others are customer-relevant (inspections process, reports — what to expect).
- New Customer Portal content authors **set audience at author time**.
- Result: 50% of content authoring effort serves BOTH audiences. Compounds the SP-8 + Customer Portal investment.

### Phase 1 content (T-day +30 days)

Minimum viable Customer Portal launch content:

| Category | Articles | Videos | Source |
|---|---|---|---|
| process | "Day 1 — Make-safe", "Day 3 — Drying", "Day 7 — Restoration begins", "What we test for" | 4 videos × 90s | PLATFORM + Remotion |
| insurance | "How AU insurance claims work", "What's an assessor doing?", "Reading your policy", "If you disagree with the assessor (AFCA path)" | 4 videos × 60s | PLATFORM + Remotion |
| glossary | 20-term policy glossary (excess, subrogation, period of indemnity, etc.) | 0 (text + diagrams) | PLATFORM |
| about | Templated "About the Business" (org fills via wizard) | 0 | ORG |
| blog | 0 articles Phase 1 (defer to Phase 2 ongoing content) | — | — |

**Total Phase 1 cost:**
- 8 videos × ~$2 ElevenLabs + Remotion render → ~$16
- 28 articles × MDX authoring → ~$0 (manual platform-team author OR Margot draft + edit)
- **Budget: ~$50 for Phase 1 launch content**, well within tolerances.

---

## NRPG content network model

### The vision

Every NRPG-certified org gets a free baseline of NRPG-branded Customer Portal content automatically. As Phill's NRPG expands into the broader ANZ Property Services Industry Association (per `industry-association-vision-2026`), the content library expands with it.

### Mechanics

- NRPG editorial team authors content with `scope: "NRPG_SEED"`, `authorOrgId: <NRPG-platform-org-id>`.
- When an org joins NRPG, RA backend creates `NrpgContentLicense` rows linking that org to all current `NRPG_SEED` content for their tier.
- New NRPG content auto-licenses to all members on publish.
- Org's Customer Portal resolves content with NRPG seed pulled in alongside PLATFORM_DEFAULT.

### Strategic effect

- **Network effect:** more NRPG members → bigger content backbone → more attractive to next prospective member.
- **Defensible moat:** NRPG content is curated, AU-specific, regulatory-compliant. Years to replicate.
- **Cross-business synergy:** NRPG paid membership ($X/yr) + RA platform fee ($99 + seats) bundle = recurring revenue across two products from same customer.

### Open question

What's the NRPG membership cost? Does NRPG content access require a separate paid tier OR is it bundled into NRPG membership? Need Phill + NRPG editorial input.

---

## Apple App Store strategy

### Same IPA, multi-mode (default recommendation)

**Pro:**
- One submission, one review cycle, one binary to maintain.
- Existing 1.0.x IPA already lives; can ship Customer Mode as a route addition in 2.0.0.
- Customer Mode is content-only (no IAP, no integration tools) — passes Apple Guideline 4.2 easily.

**Con:**
- Apple Guideline 5.2 multi-tenant rule: if Customer Mode is "different content per org", Apple may want it as one app (multi-tenant), not "RestoreAssist for Unite Group" (separate per-org apps).
- Resolved by: keep "RestoreAssist" as the App Store identity, but allow org-level brand-skinning of the in-app surface. Apple has accepted this for Procore, Jobber, Housecall Pro.

**Margot research pending:** is there a 2026 App Store Review Guidelines change that disrupts this pattern?

### Mobile seat purchase: Apple IAP route

Apple Guideline 3.1.1 requires IAP for digital subscriptions consumed in the app. The $11 mobile seat falls under this.

- iOS Customer-Mode users buy via Apple IAP (Apple takes 30%, or 15% after year 1 / under $1M revenue).
- Web/Android purchases via Stripe (no Apple cut).
- Hybrid receipt validation: server checks both Apple receipt AND Stripe subscription state when granting `hasMobileSeat`.

**Net margin on $11 mobile seat after Apple 30% cut: ~$7.70 net.** Org-level discount or absorb the loss — Phill's commercial call.

---

## Privacy + Australian Consumer Law compliance

### Mandatory disclosures (per Privacy Act 1988 amendments + ACL)

Customer Portal must disclose:
- **Identity of the platform owner:** RestoreAssist (or RestoreAssist Pty Ltd / Unite-Group entity), not just the org. Apple Guideline 5.1.1 requires this for any data collection.
- **Identity of the org serving content:** the tradie's business name + ACN + ABN visible in About section.
- **AI-generated content disclosure:** if Customer Portal Sidekick (a subset of SP-G) is offered, disclosure required per ACCC's guidance on AI consumer-facing tools.
- **Tracking/analytics:** opt-in for any non-essential analytics. Privacy Banner on first portal open.
- **Notifiable Data Breaches scheme:** RA platform team is the "APP Entity" for content data; orgs are entities for job-level data. Privacy policy must split.

### Practical implementation

- **Privacy banner** on Customer Portal first-open: "RestoreAssist powers this portal for [Org]. We collect minimal data to show you your job and help you understand the process. Read the privacy policy."
- **TOS link** at portal footer pointing to a generated combined doc (platform + org).
- **Settings → Data** page for customer self-service: download my data, delete my account.

**Margot research pending:** specific clause numbers from Privacy Act 1988 amendments + ACL.

---

## Implementation phases (post-T-day)

### Wave 3.1 — Foundation (Week 1-2)
- Prisma migration A (additive)
- `PortalContent` model + admin CRUD
- Customer Portal routing (Customer Mode in iOS shell)
- Existing ClientPortalAccount auth flow extension

### Wave 3.2 — Multi-seat billing (Week 2-3)
- Stripe Subscription Items refactor (desktop + mobile seat items)
- Apple IAP wiring for $11 mobile seat
- Middleware seat enforcement on iOS sign-in
- Grace period logic (7 days)

### Wave 3.3 — Phase 1 content (Week 3-4)
- 8 Customer Portal videos via Remotion (process + insurance categories)
- 28 MDX articles (process, insurance, glossary, about template)
- NRPG seed content (5-10 articles + 3 videos, authored by Phill + NRPG editorial)

### Wave 3.4 — Branding + UX (Week 4-5)
- Org branding override pipeline (logo, colors) flows into Customer Portal
- About-the-Business setup wizard for orgs
- Customer Mode UI polish (no tradie tools visible)

### Wave 3.5 — Compliance + launch (Week 5-6)
- Privacy banner + TOS combined-doc generation
- AFCA / ACCC compliance audit
- iOS 2.0.0 submission + App Store review
- Stripe billing migration cutover

**Total: 6 weeks post-T-day. Content authoring is the long pole.**

---

## Open questions (consolidated)

Numbered for Phill answer. One-line replies fine.

1. Main user's iPhone/iPad cost ($11 OR bundled into $99)?
2. Per-user $11 covers iPhone + iPad combined: confirm.
3. Technician without active $11: grace period length? Or hard paywall day 1?
4. OAuth integration scope (Xero user-level OR org-shared)?
5. Stripe billing: org-level customer with metered items: confirm.
6. Apple IAP for $11 on iOS: 30% Apple cut. Pass-through to customer OR absorb?
7. Same IPA multi-mode vs separate Customer Portal app: confirm same IPA.
8. Content authoring: PLATFORM + NRPG + ORG hybrid: confirm.
9. Branding: org branding shown to customer (no RA logo): confirm.
10. Customer Link expiry: 90 days post-job-close: confirm.
11. State-by-state AU content variants: Phase 1 national; Phase 2 state: confirm.
12. NRPG content tier model: bundled into NRPG membership OR separate paid tier?
13. Customer-Mode AI Sidekick: subset of SP-G or v0 deferred?

---

## Cross-references

- **Wave 1 specs already shipped:** [[2026-05-12-onboarding-redesign-design.md]] · [[2026-05-13-invited-technician-onboarding-design.md]] · [[2026-05-14-tradie-evidence-capture-ui-design.md]]
- **Wave 2 specs in flight:** [[2026-05-15-sp-g-ai-setup-agent-design.md]] · [[2026-05-15-sp-h-knowledge-substrate-design.md]] · [[2026-05-15-sp-6-email-provider-byok-design.md]] · [[2026-05-15-sp3-byok-upgrades-design.md]]
- **SP-8 Help Library:** [[2026-05-15-sp8-help-library-design.md]] — Customer Portal extends this content pipeline with `audience=customer` tag
- **Wiki context:** [[restore-assist.md]] · [[dr-nrpg.md]] · [[businesses-overview.md]] · [[industry-association-vision-2026.md]]
- **Pending integration:** [[2026-05-14-signin-jobclose-audit-design.md]] Section 18 (job-import UX from DR/NRPG)

---

## Verification Ledger (for this spec draft)

1. **What I did:** Drafted the Customer Portal + Multi-seat Licensing strategic-wedge spec covering pricing tiers (confirmed by Phill), Customer Portal scope (confirmed), data model deltas (proposed), content strategy (proposed), NRPG content network mechanics (proposed), Apple App Store strategy (proposed), AU privacy compliance (proposed), and 6-week post-T-day implementation phases.
2. **What I verified:** Cross-business context grounded in `~/2nd Brain/2nd Brain/Wiki/dr-nrpg.md` + `businesses-overview.md` + `restore-assist.md` (read in this session). Pricing model confirmed verbatim from Phill chat (2026-05-15). Customer Portal content scope confirmed verbatim from Phill chat (2026-05-15). NRPG strategic positioning grounded in the existing wiki + industry-association-vision-2026 reference. **Independence limit:** same-vendor Sonnet self-review only — Margot deep_research_max in flight (interaction_id `v1_ChdxQUVIYXFick...`); 8-question research brief will be folded into a follow-up commit on this branch. **Pre-existing-code audit not yet done** — pre-dispatch artifact grep per [[pre-dispatch-artifact-grep]] needed before implementation kicks off (look for existing PortalContent, ClientPortalAccount extensions, etc.).
3. **What would change my mind:** if Phill's answers to the 13 open questions reveal a fundamentally different model (e.g. main user's $99 includes mobile; or Customer Portal is a separate IPA), several sections need substantial revision. The data model deltas are the most-likely-to-change section; the strategic narrative + content tiers are most-likely-to-survive intact.

---

**Next steps:**
1. Phill reviews this draft, answers the 13 open questions
2. Margot research returns (~15-20 min from dispatch) → I integrate findings into Sections "Strategic context" + "Apple App Store" + "Privacy + AU compliance" via follow-up commit on this branch
3. CEO Board deliberation if any of Phill's answers create cross-team tension (Apple IAP cut vs revenue model is the most likely trigger)
4. After approval, invoke `superpowers:writing-plans` to produce the Wave 3 implementation plan (~3000 lines, mirrors SP-2 + SP-3 plan style)
5. Wave 3 build kicks off post-T-day (2026-05-20)
