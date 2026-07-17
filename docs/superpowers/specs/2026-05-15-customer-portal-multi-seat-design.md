# Customer Portal + Multi-Seat Licensing — Strategic Wedge Design

**Status:** [PASS] **APPROVED 2026-05-15** — research-backed + 13 open questions locked by Phill via interactive Q&A. Margot `deep_research_max` findings integrated. Ready for Wave 3 implementation plan generation.

**Branch:** `docs/customer-portal-spec-locked-decisions` (this commit)
**Date:** 2026-05-15
**Cross-business impact:** Disaster Recovery (tenant zero) · NRPG (content network) · RestoreAssist (platform) · Unite-Group ($2B exit thesis)

## Locked decisions (2026-05-15 Q&A)

| # | Question | LOCKED answer |
|---|---|---|
| 1 | Main user iPhone/iPad cost | **Strict $11 per user** (main user pays own $11 for mobile). Anti-share via email alerts on new-device sign-ins, NOT blocking. |
| 2 | Per-user mobile coverage | **One $11 covers iPhone + iPad** for that user (device-agnostic per User). |
| 3 | No-seat technician grace | **7-day grace + banner countdown → hard paywall** at `/billing/mobile-seat`. |
| 4 | OAuth integration scope | **Hybrid:** API keys = org-shared; OAuth integrations (Xero, Google Drive) = admin choice per-integration (default "shared with org"). New `Integration.scope` field. |
| 5 | Stripe billing | **Org-level Stripe customer + metered Subscription Items per seat**. One invoice to org owner. |
| 6 | Apple IAP cut | **Absorb 30% cut; $11 everywhere**. Net $7.70 iOS year 1 / $9.35 year 2+. |
| 7 | App Store IPA model | **Same IPA, multi-mode** (Tradie vs Customer). Per Apple Guideline 4.2.6 Anti-Templating (Margot-validated). |
| 8 | Content authoring model | ** SINGLE-SOURCE: PLATFORM authors only. Orgs CANNOT author or override content.** RA team owns 100% of editorial. (Major simplification from initial 4-tier proposal.) |
| 9 | Customer Portal branding | **Org-only branding** — no RA logo visible to client. Optional tiny footer link for legal compliance. |
| 10 | Customer Link expiry | **Job-closed + 90 days → auto-revoke**. Org admin can extend manually. |
| 11 | AU state-by-state content | **Phase 1 national, Phase 2 state variants**. ICA + ACL terminology is ~95% identical across states (Margot Q3); only AFCA/tribunal escalation paths differ. |
| 12 | NRPG content tier | **Bundled into NRPG membership.** NRPG-certified orgs auto-get NRPG_SEED content. Non-members do not have access. Reinforces NRPG's value prop. |
| 13 | Customer-Mode AI Sidekick | **Defer to Phase 2** (~3 months post-launch). v1 ships with static content only (videos + articles + glossary). |

### Notable simplifications enabled by locked answers

- **Q8 collapses the content model from 4 tiers to 2 tiers.** No `ORG_CUSTOM` or `ORG_OVERRIDE` scope needed. `PortalContent` table only stores PLATFORM + NRPG_SEED rows. Cuts Wave 3 engineering scope by ~25%.
- **Q1 strict-per-user pricing eliminates account-sharing math** but adds new requirement: device-fingerprint + email alert on new-device sign-in.
- **Q13 defer-Sidekick simplifies Wave 3 to static content delivery only.** Reduces Phase 1 token costs to near-zero.

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

### Why competitors can't easily copy this (Margot-validated 2026-05-15)

| Competitor | Customer-facing surface offered | Education depth | Margot verdict |
|---|---|---|---|
| **Encircle** (getencircle.com, fetched Feb 2026) | Interactive web links — photos, floor plans, drying logs | None — passive viewer | Tradie-to-adjuster proof tool, not homeowner-facing |
| **DocuSketch** (docusketch.com, fetched Mar 2026) | Web Portal — 360 tours, timelines, FastSpring/Zoho invoicing | None — visual asset delivery only | Adjuster + estimator workflow, not consumer education |
| **ServiceM8** (servicem8.com + "My Customer Portal" add-on, fetched Jul 2025) | Branded portal — quotes, bookings, invoices, QR-asset reporting | None — generic trades tool | No insurance-claim or restoration-specific content |
| **Ascora** (ascora.com.au/advanced/customerportal, fetched Mar 2026) | Customer Portal — quotes, job approvals, history | None — generic trades tool | Designed for electrical/plumbing/HVAC, no restoration nuance |
| **Tristar** (tristarperks.com, fetched Mar 2026) | Customer + Booking portal — scheduling, invoices, work orders | None — legacy WinServe extension | No restoration education |
| **Xactimate ClaimXperience** (verisk.com, fetched Nov 2025) | Cloud portal — video/photo upload, live-stream to adjuster | None — fraud-detection + cycle-time tool | Insurer-led, treats homeowner as data-gatherer (adversarial to tradie) |

**Margot's verdict:** "No vendor currently offers a free, branded, mobile-first portal designed specifically to educate the homeowner, explain technical restoration processes, and decode insurance jargon." Source: Margot Q1 synthesis (interaction_id `v1_ChdxQUVIYXFick...`).

- **The moat** = NRPG's curated AU insurance-claim content + Phill's DR Method + plain-language regulatory translation that takes years to author. Network effect from NRPG membership compounds. IICRC's playbook (voluntary standards → de facto insurer mandate) is the precedent — Margot Q4 confirmed (renu.inc, fetched 2026).

### Commercial loop — quantified by Margot Q8 case studies

| Lever | Comparable evidence | Implication for RA |
|---|---|---|
| Free portal → tradie stickiness | Jobber Client Hub: net revenue retention > 100%, churn ~5-7%/yr, +35% quote-win rate (businessmodelcanvastemplate.com, 2025) | $99 + $11/seat orgs become hard to churn once their clients are accustomed to the portal |
| Automated follow-up → revenue | Housecall Pro / Sonlight Services: $8k → $1.8M annual profit; 50 → 800 Google reviews (housecallpro.com, 2025) | Customer Portal email/SMS nudges into job stages compound into review velocity |
| Documentation portal → cycle time | Encircle / FP Property Restoration: 15% annual revenue growth, 2× claim capacity, 100+ admin hours saved (getencircle.com, 2026) | Faster documentation → faster invoice → org cash flow → seat retention |
| Portal underutilization gap | ServiceTitan: 75% of contractors offer a portal, only 26% use two-way comms (servicetitan.com, 2026) | RA's portal default = two-way + educational; immediate differentiation |

Restoration customer anxiety + insurance-claim confusion = slow invoice payment. Customer Portal reduces both. Faster invoice payment = faster org cash flow = more orgs willing to pay $99 + $11/seat. Network compounds.

---

## Margot research findings (2026-05-15)

Source: `mcp__margot__deep_research_max` interaction `v1_ChdxQUVIYXFick...`, completed 2026-05-15. Disclaimer: regulatory and Apple-policy content is informational, not legal advice. All citations are from Margot's fetched-dates inline.

### Q1 — Competitive landscape (restoration software customer portals)

Margot confirmed the **strategic void** thesis: incumbents offer either generic transactional portals (ServiceM8, Ascora, Tristar) or insurer-led data-extraction pipelines (ClaimXperience, DocuSketch). None ship a free, branded, educational claim-journey for the homeowner. Detail per vendor:

- **Encircle** (getencircle.com, Feb 2026) — interactive web links for photos, floor plans, drying logs. Tradie-to-adjuster proof artefact, not homeowner-facing education.
- **DocuSketch** (docusketch.com, Mar 2026) — Web Portal for 360 tours, timelines, FastSpring/Zoho invoicing. Visual asset delivery only.
- **ServiceM8** (servicem8.com + "My Customer Portal" add-on, Jul 2025) — branded portal for quotes, bookings, invoices, QR-asset reporting. Generic trades; no restoration-specific content.
- **Ascora** (ascora.com.au/advanced/customerportal, Mar 2026) — quotes, approvals, history. Designed for electrical/plumbing/HVAC.
- **Tristar** (tristarperks.com, Mar 2026) — scheduling, invoices, work orders. Legacy WinServe Web extension.
- **Xactimate ClaimXperience** (verisk.com, Nov 2025) — cloud portal for video/photo upload, live-stream to adjuster, image-analytics fraud detection. Insurer-led; treats homeowner as a data-gatherer.

### Q2 — Australian insurance-claim journey (canonical steps + terminology)

Margot mapped the canonical Australian property-damage claim journey using Suncorp, Allianz, and ICA framework documents (suncorp.com.au, insurancecouncil.com.au, fetched Mar 2026):

1. **Incident + Claim Lodgement** — homeowner contacts insurer with policy number and preliminary photos.
2. **Make-Safe + Emergency Repairs** — *Make-Safe = temporary stabilisation, not final repair (e.g., tarping a roof, extracting standing water).*
3. **Damage Assessment** — internal claims manager, loss adjuster, or specialised tradie assesses; expert hydrology/engineering reports may be commissioned. *Proximate Cause = the dominant, effective reason damage occurred; determines whether a covered peril vs excluded event (wear and tear, poor maintenance) applies.*
4. **Scope of Work + Claim Decision** — insurer reviews assessment, generates Scope of Work. Key terms:
   - **Excess** (deductible) — homeowner's out-of-pocket before insurer pays. ICA Code mandates claim proceeds even when insured cannot immediately pay excess due to financial hardship (financialrights.org.au).
   - **Actual Cash Value (ACV) vs Replacement Cost** — ACV = replacement minus **Depreciation**.
   - **Indemnity vs Reinstatement** — Indemnity = restore the financial position prior to loss (factors in depreciation); Reinstatement = rebuild to original condition with new materials.
   - **Period of Indemnity** — timeframe insurer pays consequential losses (temporary accommodation, loss of rent) while property is uninhabitable.
5. **Payment + Settlement Options** — managed repair OR cash settlement. **Lifetime Guarantee on Workmanship** applies when claim settles via insurer's authorised repairer; *forfeited if homeowner takes cash settlement and uses an independent repairer* (youi.com.au, nationalcover.com.au, racv.com.au). **Subrogation** = insurer's legal right to pursue a third party who caused damage; insurers may waive subrogation against tenants for accidental damage.
6. **Dispute Resolution (AFCA)** — escalate internally then to Australian Financial Complaints Authority for external dispute resolution.

### Q3 — ICA and AFCA mandatory disclosures + cooling-off periods

- **ICA Code Clause 42** (General Insurance Code of Practice 2020, insurancecode.org.au) — insurers must take "reasonable steps" to ensure communications are in plain language. Consumer groups push for mandatory consumer-testing of documents.
- **AFCA Approach to General Insurance Claims Handling** (financialrights.org.au, bnlaw.com.au) — robust, proactive, flexible, regular, consistent communication across all stakeholders. Itemised breakdown required for cash settlements (not a vague total).
- **Cooling-off periods** — standard **14-day cooling-off** for general insurance product purchase (insurancecouncil.com.au, einsure.com.au). House Economics Committee Recommendation 11 (aph.gov.au) advocates a **30-day cooling-off for cash settlements** specifically, to protect vulnerable homeowners in "situational vulnerability" (heightened emotion, impaired cognition post-disaster).
- **Practical RA implementation** — a Customer Portal "Cash Settlement Checklist" surfaces these disclosures and timestamps that the homeowner saw them; converts the legal burden into a software-side compliance shield for tradie and insurer.

### Q4 — NRPG (National Recovery Partner Group) public posture

Margot's public search returned an `open_questions` flag for NRPG as a historical institution. **NRPG is not a legacy public association.** Cross-referencing internal Unite Group corpus (`~/Pi-CEO/Pi-SEO/business-charters/PI-CEO-STANDARD.md` + `github.com/CleanExpo/Disaster-Recovery`), NRPG is a proprietary professional-body platform engineered and owned by Unite Group. It operates as a triad with `Disaster-Recovery` (active incident response) and `NRPG-Onboarding` (accreditation pipeline). Tiered memberships: Practitioner / Senior Practitioner / Master Practitioner / Corporate. Members use the National Inspection Report (NIR) methodology, with CPD tracked via the platform.

**The IICRC precedent** (renu.inc, 2026) — IICRC began as voluntary standards (S500 water damage, S520 mould) and, through rigorous training, ethics, and certification exams, became a *de facto insurer-mandated* credential over decades. NRPG is positioning the NIR to achieve identical mandated status in Australia. The Customer Portal must subtly project this authority through a co-branded "RestoreAssist + NRPG Quality Mark" header and an "About Your Practitioner" section that surfaces NRPG tier, background-check status, NIR compliance.

### Q5 — Apple App Store 2026 policy for multi-tenant B2B portals

Three guidelines apply directly (apple.com Review Guidelines + appstorereviewguidelineshistory.com, fetched Feb 2026):

- **Guideline 4.2.6 — Anti-Templating** — apps "created from a commercialized template or app generation service" are rejected *unless submitted directly by the provider of the app's content*. RA **cannot** ship separate per-tradie iOS apps ("Bob's Restoration Portal", "Smith Water Damage Portal") under RA's developer account. The compliant pattern is a single binary that aggregates content (a "picker" model).
- **Guideline 4.7 — Third-Party Software / Mini-Apps** — a shell app may load HTML5 software not embedded in the binary, *provided* the software is not offered in a store-like interface, does not expose native APIs without permission, and is free or purchased via Apple IAP.
- **Guideline 5.2 — Intellectual Property** — RA is liable for any tradie-uploaded logos or assets that infringe third-party IP. Org branding pipeline must include a copyright attestation gate.

**Architectural solution.** Two viable paths:
1. **Universal "Picker" app** — single "RestoreAssist Client" (or "NRPG Client") binary on the App Store. Tradie texts the homeowner a Universal Link `restoreassist.app/portal/<token>`. App opens, reads the token, dynamically loads the tradie's branding + job data. Procore, Jobber, and Housecall Pro have all shipped this pattern successfully.
2. **Progressive Web App (PWA)** — bypass App Store entirely. Homeowner needs the portal for only 2-4 weeks of an active claim; a frictionless web link typically converts better than forcing a traumatised victim through an App Store install.

RA's confirmed default (current spec) — same IPA, multi-mode (Tradie Mode / Customer Mode), which aligns with path 1 above.

### Q6 — Vertical-SaaS network-effect content models

Margot validated the **centralised master + per-tenant theming** hybrid via four reference platforms (fetched Feb/Mar 2026):

- **ServiceTitan Enterprise Hub + TitanExchange** (servicetitan.com) — corporate parent maintains a "golden" pricebook and content repository, pushes standardised settings/items/training modules down to localised tenants with a single click. Content Portal pushes shared training videos, safety protocols, schematics to technician mobile apps.
- **Jobber Client Hub** (getjobber.com) — shared infrastructure across the entire Jobber network; per-tenant presentation (logo, business name, custom request forms, feature toggles).
- **Housecall Pro template customisation** (housecallpro.com) — centralised library of service-agreement / dispatch-script / website templates. Individual tradies personalise with their own branding, line items, custom fields. Templates duplicate and manage at the company level.
- **Procore Company vs Project Level** (procore.com) — strict hierarchical permission and template system. Company Level workflow templates, inspection templates, folder structures cascade down to Projects; custom Project Level templates do not propagate upward.

The RA model (PLATFORM_DEFAULT > NRPG_SEED > ORG_CUSTOM > ORG_OVERRIDE) maps cleanly onto Procore's Company/Project boundary with an extra NRPG-network tier in the middle.

### Q7 — Australian Privacy + Consumer Law (Privacy Act 1988 + 2024/2025 amendments + NDB + ACL)

- **Notifiable Data Breaches scheme (Part IIIC, Privacy Act)** — APP Entities must assess an eligible data breach within 30 days and notify the OAIC plus affected individuals if "serious harm" is likely (oaic.gov.au, fortinet.com, data3.com). Restoration files contain interior home photos, security system details, financial data for excess payments — serious-harm risk is elevated.
- **2024/2025 Privacy Act amendments — Automated Decision-Making + AI** (levo.ai, dataguidance.com, jonesday.com) — explicit transparency mandated when AI processes personal information. RA's Synthex agent (if used to summarise damage or score claim validity) **must** disclose automated processing to the homeowner.
- **Practical RA disclosures** — the Customer Portal first-open banner must identify (a) the tradie/org as the entity providing the immediate service and capturing the data; (b) RA/Unite-Group as the underlying data processor; (c) any AI-summary generation with the plain-language line: *"This portal uses Artificial Intelligence to organise and summarise damage reports. AI-generated content is reviewed by your practitioner but should not be considered a final legal determination of coverage."*; (d) cookie/analytics tracking with opt-out where mandated.

### Q8 — Free customer portal as competitive differentiator (case studies)

- **Jobber Client Hub** (businessmodelcanvastemplate.com, 2025) — free portal sustains net revenue retention > 100%, churn ~5-7% annualised, automated quote follow-ups lift win rate ~35%. Stickiness because leaving Jobber means severing the digital umbilical cord to the tradie's customer base.
- **Housecall Pro / Sonlight Services case study** (housecallpro.com, 2025) — adopted customer-facing automation + comms; scaled annual profitability from $8,000 to $1.8M. Mechanism: automated follow-ups (no quotes slip through cracks) + 24/7 online booking (captures leads outside business hours) + personalised emails. Drove 50 → 800 Google reviews, building a localised SEO monopoly. Housecall Pro data: 57% of pros using advanced/AI-enhanced customer tools report tangible business growth.
- **ServiceTitan two-way comms gap** (servicetitan.com, 2026) — 75% of commercial contractors offer a portal, only 26% use it for two-way communication. Effective contractors see 15-30% reduction in no-shows and improved same-day service capacity.
- **Encircle / FP Property Restoration** (getencircle.com, 2026) — real-time documentation + floor plans → 15% annual revenue growth; 2× claim capacity in high-volume events without admin headcount. Third-party estimator saved 100+ admin hours via 55% faster estimates.

**The free wedge logic** (Margot synthesis): pricing the Customer Portal at $0 (a) forces tradie adoption (zero financial risk), (b) trains homeowner expectation toward digital education dashboards (legacy paper-form tradies lose bids), (c) maximises data flow through RA servers, increasing tradie switching costs.

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

// SIMPLIFIED per Q8 locked decision (2026-05-15) — single-source authoring.
// Orgs CANNOT author or override. Only PLATFORM_DEFAULT + NRPG_SEED rows exist.
// Removed: ORG_CUSTOM and ORG_OVERRIDE scopes + authorOrgId + orgId-bound rows.
model PortalContent {
  id           String   @id @default(cuid())
  scope        String   // ENUM: "PLATFORM_DEFAULT" | "NRPG_SEED"
  audience     String   @default("customer")  // "customer" | "technician" | "both"
  category     String   // "process" | "insurance" | "glossary" | "about" | "blog"
  slug         String
  mdxContent   String   @db.Text  // raw MDX
  videoSlug    String?  // optional reference into VIDEO_REGISTRY
  state        String   @default("DRAFT")  // "DRAFT" | "PUBLISHED" | "ARCHIVED"
  publishedAt  DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([scope, slug])
  @@index([audience, category, state])
  @@map("PortalContent")
}

// REMOVED per Q12 locked decision (2026-05-15) — NRPG content bundled into
// NRPG membership, so access is determined by Organization.isNrpgMember boolean
// (sourced from DR/NRPG integration), NOT a separate license table.
//
// model NrpgContentLicense — DELETED. Access check:
//   const orgContent = nrpgMember ? [...platformDefault, ...nrpgSeed] : platformDefault;
```

### Migration strategy

Per CLAUDE.md rule #16 (two-step destructive migrations):

- **Phase 1 (additive only):** add fields to existing models, add new `PortalContent` + `NrpgContentLicense` models. NO data deletion. Existing rows get default values.
- **Backfill:** existing User rows get `hasMobileSeat=false` + null grace period. Existing Organization rows get `desktopSeatStatus=ACTIVE` + free historical period (don't penalize current users).
- **Phase 2 (later, if needed):** deprecate any superseded billing fields after Stripe migration verifies clean.

---

## Content strategy

### Two-tier content hierarchy — locked Q8 single-source

 **LOCKED 2026-05-15 (Q8):** orgs CANNOT author or override content. RA platform team owns 100% of editorial. This was the major simplification from the initial 4-tier proposal — drops `ORG_CUSTOM` + `ORG_OVERRIDE` scopes entirely.

```
PLATFORM_DEFAULT  (authored by RA platform team)
  ├── Used by: every org out of the box (including non-NRPG)
  ├── Examples: "What is water damage restoration?", "How does my insurance claim work in Australia?", AU policy glossary
  └── Scope: national, generic, plain English

NRPG_SEED        (authored by NRPG editorial, gated to NRPG-member orgs)
  ├── Used by: only NRPG-certified orgs (per Q12: bundled into NRPG membership)
  ├── Examples: "The 5-stage NRPG Method", "Why NRPG-certified contractors?", DR Method exposure
  └── Scope: branded NRPG quality mark, methodology-specific
```

Resolution at runtime: `NRPG_SEED` (if org is NRPG member) merges with `PLATFORM_DEFAULT`. Customer sees `PLATFORM_DEFAULT` + (if applicable) `NRPG_SEED` articles, all displayed under org's branding (per Q9). No per-org content variations beyond branding skin.

**About-the-Business content:** Even with single-source authoring, the "About the Business" surface needs org-specific data (logo, team, BSafe certs, ACN). This is handled NOT via PortalContent overrides but via templated content that reads from `Organization` fields (logoUrl, tagline, customerPortalAboutCopy). Org admin edits the data via a structured form, not free-form MDX. Eliminates the "org went rogue with bad content" risk that Q8's locked single-source decision protects against.

**Vertical-SaaS network-effect precedent (Margot Q6, fetched Feb/Mar 2026):** ServiceTitan's TitanExchange (servicetitan.com) is the closest precedent — "golden pricebook" central distribution with per-tenant theming, no per-tenant content authoring. Procore + Jobber + Housecall Pro all permit org authoring (which our Q8 specifically rejects to maintain RA editorial quality + IICRC + AFCA compliance posture). RA's stricter single-source approach trades flexibility for content-quality guarantee — appropriate for a regulated-insurance-adjacent surface.

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
| insurance | "Lodgement → Assessor → Scope → Settlement → AFCA dispute" (mirrors Margot Q2 canonical 6-step journey), "What's an assessor doing?", "Reading your policy", "Cash settlement vs managed repair — what you give up" (lifetime workmanship guarantee forfeiture, per Margot Q2) | 4 videos × 60s | PLATFORM + Remotion |
| glossary | **AU policy glossary** — Margot Q2 canonical terms: Excess (deductible), Make-Safe, Proximate Cause, Damage Assessment, Scope of Work, Actual Cash Value (ACV), Replacement Cost, Depreciation, Indemnity, Reinstatement, Period of Indemnity, Subrogation, Cash Settlement, Managed Repair, Lifetime Guarantee on Workmanship, Authorised Repairer, Cooling-Off Period (14-day general / 30-day cash-settlement recommended), AFCA, ICA Code, Notifiable Data Breach, ADM (Automated Decision-Making). Plain English per ICA Code Clause 42. | 0 (text + diagrams) | PLATFORM |
| about | Templated "About the Business" (org fills via wizard) + **NRPG Quality Mark / NRPG tier surface** (Margot Q4 — IICRC playbook replication) | 0 | ORG + NRPG |
| blog | 0 articles Phase 1 (defer to Phase 2 ongoing content) | — | — |

**Total Phase 1 cost:**
- 8 videos × ~$2 ElevenLabs + Remotion render → ~$16
- 28 articles × MDX authoring → ~$0 (manual platform-team author OR Margot draft + edit)
- **Budget: ~$50 for Phase 1 launch content**, well within tolerances.

---

## NRPG content network model

### The vision

Every NRPG-certified org gets a free baseline of NRPG-branded Customer Portal content automatically. As Phill's NRPG expands into the broader ANZ Property Services Industry Association (per `industry-association-vision-2026`), the content library expands with it.

**Margot Q4 validation (2026-05-15):** public search confirmed NRPG has no legacy public posture — Margot returned an `open_questions` flag, which is consistent with the internal positioning of NRPG as a forward-looking proprietary authority layer engineered by Unite Group (not a pre-existing institution). The strategic playbook is a direct mirror of the **IICRC precedent** (renu.inc, 2026): IICRC began as voluntary standards (S500 water, S520 mould), and through rigorous training + ethics + certification became a *de facto insurer-mandated* credential over decades. RA's Customer Portal projects NRPG authority through a co-branded header ("RestoreAssist + NRPG Quality Mark") and an "About Your Practitioner" surface displaying NRPG tier, background-check status, and NIR compliance — directly priming the market for the same insurer-mandate trajectory.

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

### Same IPA, multi-mode (default recommendation) — Margot-validated

**Pro:**
- One submission, one review cycle, one binary to maintain.
- Existing 1.0.x IPA already lives; can ship Customer Mode as a route addition in 2.0.0.
- Customer Mode is content-only (no IAP, no integration tools) — passes Apple Guideline 4.2 easily.

**Con — concrete Apple guideline risks (Margot Q5, fetched Feb 2026):**
- **Guideline 4.2.6 (Anti-Templating)** — apps created from a "commercialized template or app generation service" are rejected unless submitted directly by the provider of the app's content (apple.com Review Guidelines; appstorereviewguidelineshistory.com). RA cannot ship separate per-tradie iOS apps under RA's developer account. Compliant pattern = single binary, aggregated "picker" content model.
- **Guideline 4.7 (Third-Party Software / Mini-Apps)** — shell-app loading HTML5 mini-apps is allowed only if it does not present a store-like interface, does not expose native APIs without permission, and is free or sold via Apple IAP.
- **Guideline 5.2 (Intellectual Property)** — RA is liable for tradie-uploaded logos / assets that infringe third-party IP. The org branding pipeline must include a copyright attestation gate at upload time.

**Resolution:** keep "RestoreAssist" as the App Store identity, with org-level brand-skinning of the in-app surface (logo, colors, About-the-Business content). Apple has accepted this pattern for Procore, Jobber, and Housecall Pro (Margot Q6 vendor reviews). The Universal Link `restoreassist.app/portal/<token>` opens the same IPA in Customer Mode and dynamically loads the tradie's branding + job data from the token — fully compliant with 4.2.6.

**PWA fallback (Margot's alternative recommendation):** because a homeowner needs the portal only for the 2-4-week life of an active claim, a frictionless web URL often converts better than forcing a traumatised victim through an App Store install. Path of least resistance even if Apple review surfaces an unexpected concern.

### Mobile seat purchase: Apple IAP route

Apple Guideline 3.1.1 requires IAP for digital subscriptions consumed in the app. The $11 mobile seat falls under this.

- iOS Customer-Mode users buy via Apple IAP (Apple takes 30%, or 15% after year 1 / under $1M revenue).
- Web/Android purchases via Stripe (no Apple cut).
- Hybrid receipt validation: server checks both Apple receipt AND Stripe subscription state when granting `hasMobileSeat`.

**Net margin on $11 mobile seat after Apple 30% cut: ~$7.70 net.** Org-level discount or absorb the loss — Phill's commercial call.

---

## Privacy + Australian Consumer Law compliance

### Mandatory disclosures (per Privacy Act 1988 amendments + ACL + ICA + AFCA) — Margot-validated

Customer Portal must disclose:
- **Identity of the platform owner** — RestoreAssist (RestoreAssist Pty Ltd / Unite-Group entity), not just the org. Apple Guideline 5.1.1 requires this for any data collection.
- **Identity of the org serving content** — tradie's business name + ACN + ABN visible in About section.
- **AI-generated content disclosure (Margot Q7)** — required under 2024/2025 Privacy Act amendments covering Automated Decision-Making (levo.ai, dataguidance.com, jonesday.com, fetched Jan/Mar 2026). Plain-language line: *"This portal uses Artificial Intelligence to organise and summarise damage reports. AI-generated content is reviewed by your practitioner but should not be considered a final legal determination of coverage."*
- **Tracking/analytics** — opt-in for non-essential analytics. Privacy Banner on first portal open.
- **Notifiable Data Breaches (NDB) scheme (Part IIIC, Privacy Act 1988)** — APP Entities must assess an eligible data breach within 30 days and notify OAIC + affected individuals if "serious harm" is likely (oaic.gov.au, fortinet.com, data3.com). Restoration files include interior home photos, security details, financial data for excess payments — serious-harm risk is elevated. Privacy policy must split RA (platform/data processor for content data) vs org (data controller for job-level data).
- **ICA Code Clause 42 (General Insurance Code of Practice 2020, insurancecode.org.au)** — plain-language communication mandated for situational vulnerability. Customer Portal explainers must avoid legalese.
- **AFCA cash-settlement disclosures (financialrights.org.au, bnlaw.com.au, Margot Q3)** — itemised settlement breakdown required, not vague final total. Surface a "Cash Settlement Checklist" component when applicable.
- **Cooling-off period surfacing** — 14-day general insurance cooling-off (insurancecouncil.com.au) and the parliamentary-recommended **30-day cooling-off for cash settlements** (House Economics Committee Recommendation 11, aph.gov.au) — Portal must display these timestamps clearly in the claim-stage walkthrough.

### Practical implementation

- **Privacy banner** on Customer Portal first-open: "RestoreAssist powers this portal for [Org]. We collect minimal data to show you your job and help you understand the process. Read the privacy policy."
- **TOS link** at portal footer pointing to a generated combined doc (platform + org).
- **Settings → Data** page for customer self-service: download my data, delete my account.
- **AI disclosure modal** on first AI-generated summary view (per 2024/2025 Privacy Act ADM amendments).
- **Cash Settlement Checklist component** rendered conditionally when claim-stage = `settlement_cash`, surfacing AFCA + 30-day cooling-off disclosures and timestamping that the homeowner viewed them (compliance evidence for tradie and insurer).

---

## Implementation phases (post-T-day) — scope-locked per Q&A 2026-05-15

### Wave 3.1 — Foundation (Week 1-2)
- Prisma migration A (additive) — new fields per Q1/Q5/Q12 + simplified `PortalContent` (2 scopes only per Q8)
- `PortalContent` model + **admin CRUD scoped to RA platform team only** (per Q8 — no org-level write API needed)
- Customer Portal routing — Customer Mode in same iOS IPA (per Q7)
- ClientPortalAccount auth flow extension with 90-day-post-job-close expiry (per Q10)
- **NEW (per Q1):** `Session` model extension with `deviceFingerprint`/`signedInFromIp`/`userAgent` columns + new-device email-alert helper (`lib/security/device-alerts.ts`)

### Wave 3.2 — Multi-seat billing (Week 2-3)
- Stripe Subscription Items refactor (1 desktop item + N \× $11 mobile seat items) per Q5 org-level customer
- Apple IAP wiring for $11 mobile seat — **absorb 30% cut, $11 everywhere** per Q6
- Middleware seat enforcement on iOS sign-in — 7-day grace per Q3 + `/billing/mobile-seat` paywall
- New-device alert email template (transactional, via lib/email)
- `Integration.scope` enum (org-shared vs user-level) per Q4

### Wave 3.3 — Phase 1 content (Week 3-4) — RA platform authoring only
- 8 Customer Portal videos via Remotion (process + insurance categories) — RA platform team
- 28 MDX articles (process + insurance + glossary + About template) — RA platform team
- **NRPG seed content** — 5-10 articles + 3 videos, authored by Phill + NRPG editorial. Bundled into NRPG membership per Q12; gated by `Organization.isNrpgMember` flag (sources via DR/NRPG integration)
- **National content only — state variants deferred to Phase 2** per Q11
- **NO org-authored content** per Q8 — orgs cannot write MDX

### Wave 3.4 — Branding + UX (Week 4-5)
- Org branding (logo + colors) flows into Customer Portal — per Q9 client sees ONLY org brand
- About-the-Business setup wizard for orgs — **structured form filling Organization fields, NOT MDX authoring** (preserves Q8 single-source authoring)
- Customer Mode UI polish (no tradie tools visible)
- Optional tiny "Powered by RestoreAssist" footer link (legal compliance)

### Wave 3.5 — Compliance + launch (Week 5-6)
- Privacy banner + TOS combined-doc generation (RA + org disclosures per Margot Q7)
- AFCA / ACCC compliance audit
- iOS 2.0.0 submission + App Store review (single IPA per Q7)
- Stripe billing migration cutover

### Deferred to Wave 4 (post-launch +90 days)
- **Customer-Mode AI Sidekick** (subset of SP-G) — deferred per Q13. v1 ships static content only.
- **State-by-state AU content variants** (NSW/VIC/QLD/etc) per Q11 — Phase 2 once tenant distribution by state is observable.
- Phase 2 NRPG content expansion (full library beyond 5-10 seed articles).

**Total: 6 weeks post-T-day. Content authoring (28 articles + 8 videos by RA platform team) is the long pole.** Engineering scope ~25% lower than initial spec due to Q8 single-source simplification.

---

## Open questions

[PASS] **All 13 open questions resolved 2026-05-15 via Phill Q&A.** See "Locked decisions" table at the top of this spec for verbatim answers. Implementation plan generation may now proceed.

### New scope impacts from locked answers (for implementation plan author)

1. **Q8 single-source content model** — `PortalContent` table no longer needs `scope` enum values for `ORG_CUSTOM` or `ORG_OVERRIDE`. Only `PLATFORM_DEFAULT` and `NRPG_SEED`. Removes per-org content authoring API + admin UI + version-conflict resolution logic. Wave 3 engineering scope reduced ~25%.

2. **Q1 strict per-user pricing + device-alert** — adds new requirements:
   - `Session` Prisma model gains `deviceFingerprint`, `signedInFromIp`, `userAgent` columns
   - New `lib/security/device-alerts.ts` helper detects new-device sign-ins (any device fingerprint unseen for that User in last 30 days) and emails the User
   - No hard concurrent-session limit — multiple concurrent sessions on multiple devices are allowed for the SAME User account; just flagged
   - Email template: "Someone signed in to your RestoreAssist account on a new device (iPhone 15, Sydney AU). Was this you?"

3. **Q13 Customer-Mode AI Sidekick deferred** — Wave 3 Phase 1 ships static content only. SP-G Customer-Mode subset becomes Wave 4 work post-T-day+90.

---

## Cross-references

- **Wave 1 specs already shipped:** [[2026-05-12-onboarding-redesign-design.md]] · [[2026-05-13-invited-technician-onboarding-design.md]] · [[2026-05-14-tradie-evidence-capture-ui-design.md]]
- **Wave 2 specs in flight:** [[2026-05-15-sp-g-ai-setup-agent-design.md]] · [[2026-05-15-sp-h-knowledge-substrate-design.md]] · [[2026-05-15-sp-6-email-provider-byok-design.md]] · [[2026-05-15-sp3-byok-upgrades-design.md]]
- **SP-8 Help Library:** [[2026-05-15-sp8-help-library-design.md]] — Customer Portal extends this content pipeline with `audience=customer` tag
- **Wiki context:** [[restore-assist.md]] · [[dr-nrpg.md]] · [[businesses-overview.md]] · [[industry-association-vision-2026.md]]
- **Pending integration:** [[2026-05-14-signin-jobclose-audit-design.md]] Section 18 (job-import UX from DR/NRPG)

---

## Verification Ledger (for this spec draft)

1. **What I did:** Drafted the Customer Portal + Multi-seat Licensing strategic-wedge spec covering pricing tiers (confirmed by Phill), Customer Portal scope (confirmed), data model deltas (proposed), content strategy (proposed), NRPG content network mechanics (proposed), Apple App Store strategy (proposed), AU privacy compliance (proposed), and 6-week post-T-day implementation phases. **Follow-up integration (2026-05-15):** folded Margot `deep_research_max` findings (8 questions) into Strategic context, new "Margot research findings (2026-05-15)" section, Apple App Store (Guidelines 4.2.6 / 4.7 / 5.2 with apple.com citations), Privacy + ACL (Privacy Act NDB + 2024/2025 ADM amendments + ICA Code Clause 42 + AFCA cash-settlement disclosures + 14/30-day cooling-off), Content strategy (canonical AU glossary list, vertical-SaaS network-effect precedents — Procore, ServiceTitan, Jobber, Housecall Pro), and NRPG section (IICRC playbook precedent).
2. **What I verified:** Cross-business context grounded in `~/2nd Brain/2nd Brain/Wiki/dr-nrpg.md` + `businesses-overview.md` + `restore-assist.md` (read in earlier session). Pricing model confirmed verbatim from Phill chat (2026-05-15). Customer Portal content scope confirmed verbatim from Phill chat (2026-05-15). NRPG strategic positioning grounded in the existing wiki + industry-association-vision-2026 reference. **Margot integration:** read `mcp__margot__check_research` payload (interaction_id `v1_ChdxQUVIYXFick...`, status=completed), extracted findings across Q1-Q8 with primary URLs + fetched-dates inline (e.g., Encircle getencircle.com Feb 2026, ICA Code Clause 42 insurancecode.org.au, Apple Review Guidelines 4.2.6 apple.com Feb 2026, Privacy Act NDB oaic.gov.au, Jobber Client Hub businessmodelcanvastemplate.com 2025). **Independence limit:** same-vendor Sonnet integration of an upstream Gemini-grounded research dossier; no second-vendor adversarial review of the Margot output itself. **Pre-existing-code audit not yet done** — pre-dispatch artifact grep per [[pre-dispatch-artifact-grep]] needed before implementation kicks off (look for existing PortalContent, ClientPortalAccount extensions, etc.).
3. **What would change my mind:** if Phill's answers to the 13 open questions reveal a fundamentally different model (e.g. main user's $99 includes mobile; or Customer Portal is a separate IPA), several sections need substantial revision. The data model deltas are the most-likely-to-change section; the strategic narrative + content tiers are most-likely-to-survive intact. A subsequent Margot recheck on App Store guidelines (currently fetched Feb 2026) close to actual submission date would also be prudent — Apple guideline interpretations drift quietly.

---

**Next steps:**
1. Phill reviews this draft (Margot findings now folded in), answers the 13 open questions
2. CEO Board deliberation if any of Phill's answers create cross-team tension (Apple IAP 30% cut vs revenue model is the most likely trigger)
3. After approval, invoke `superpowers:writing-plans` to produce the Wave 3 implementation plan (~3000 lines, mirrors SP-2 + SP-3 plan style)
4. Wave 3 build kicks off post-T-day (2026-05-20)
5. Pre-implementation: re-run Margot's Apple App Store sub-query close to actual submission date — Guidelines drift quietly between fetches
