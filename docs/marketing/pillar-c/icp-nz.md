# RestoreAssist — Ideal Customer Profile: New Zealand

**Date:** 2026-08-31
**Companion to:** [[icp]] (Australia, 2026-05-13)
**Produced by:** `marketing-icp-research`, following `marketing-studio/frameworks/icp-canvas.md`
**Evidence grade:** product claims are code-verified with file citations. Market claims are
desk research, not customer contact. Every unverified field is marked, and §10 lists the
five interviews that would close the gap. Per the skill's own boundary: **no quote in this
document is invented.** Where the Australian ICP carries real operator language, this one
carries none, because none has been gathered from New Zealand.

---

## Why this document exists

RestoreAssist ships genuine New Zealand engineering. `lib/nz/nhcover.ts` implements
claim-pathway routing under the **Natural Hazards Insurance Act 2023** — NHCover versus
private insurer, the NZ$300,000 + GST residential building cap, the $500 flat excess, and
the rule that storm and flood are *land-only* under NHCover while building damage goes to
the private insurer. It cites the Natural Hazards Commission Toka Tū Ake as its source,
carries a confirmation date, and is wired into six API routes with eight passing tests.

That is deeper domain modelling of the New Zealand claims system than most NZ-native
products carry.

**The Australian ICP mentions New Zealand zero times.** Its geography row reads "All
Australian states and territories." Published campaign copy tells New Zealand readers the
product is "built for Australian and New Zealand conditions: GST at 10%, 11-digit ABN
validation" — every specific in that sentence is Australia-only.

Engineering built New Zealand. Marketing has been selling Australia to it. This ICP is the
upstream fix.

---

## 1. Firmographics

| Attribute | Range | Confidence |
|---|---|---|
| Industry | Property restoration and disaster remediation — water damage, mould remediation, fire and smoke, sewage | High |
| Company size | Sole trader → ~5 technicians, mirroring the Australian profile | **Needs primary research.** No NZ business count located |
| Geography | All of New Zealand. Volume expected to skew Auckland, Canterbury, Wellington, Hawke's Bay | Medium — inferred from population and recent event history, not measured |
| Entity type | Sole trader · Limited company · Look-through company. **NZBN, not ABN** | High — NZBN is the universal NZ business identifier |
| GST | Registered at 15%, threshold NZ$60,000 turnover | High |
| Accounting | Xero is New Zealand-founded and NZ-dominant in small business | Medium — dominance is well established, exact share not verified here |
| Currency | NZD | High |
| Claims exposure | Split across **two systems**: NHCover for earthquake, landslip, volcanic, hydrothermal, tsunami and resulting fire; private insurers for storm and flood building damage | High — `lib/nz/nhcover.ts`, sourced to naturalhazards.govt.nz |

### The structural difference an Australian vendor will miss

New Zealand restoration work sits on top of a **dual claim pathway that Australia has no
equivalent of**. A single storm event can produce land damage that is NHCover's and
building damage that is the private insurer's, on the same property, on the same day. Get
the pathway wrong on a scope of works and the claim goes to the wrong payer.

RestoreAssist already routes this correctly in code. It has never said so in a single line
of marketing.

---

## 2. Roles in the buying group

Mirrors the Australian structure — no procurement department, no IT department, the owner
signs up and pays the same evening — with one change.

| Role | Who | Measured on | Change vs Australia |
|---|---|---|---|
| Decision maker | The owner-operator | Cash collected, jobs closed | Same |
| Champion | The lead technician | Whether the phone-to-report flow works on site | Same |
| Blocker | The bookkeeper or external accountant | Whether line items land in Xero cleanly | **Stronger.** Xero is the home-market default, so the tolerance for a broken sync is lower |
| Silent influencer | The loss adjuster, and for natural-hazard events the **Natural Hazards Commission's** assessment process | Whether the report supports the claim | **New role.** Australia has no NHC equivalent |

---

## 3. Pain hierarchy (ranked)

Pains 1–3 are the Australian pains, which apply unchanged — restoration admin is
restoration admin. Pains 4–6 are New Zealand-specific and are where this document earns
its keep.

| # | Pain | Frequency | Severity | Awareness |
|---|---|---|---|---|
| 1 | Admin overhead eating the evening — job notes, reports, resizing photos | Daily | 2–3 hrs/night | Actively shopping |
| 2 | Insurer pushback: missing timestamps, no GPS, ambiguous moisture readings | Weekly | Job stalls, cash stops | Aware |
| 3 | Re-keying line items into Xero | Weekly | Hours + errors | Aware |
| 4 | **Getting the NHCover / private-insurer split wrong** on a mixed-cause loss | Per natural-hazard event | Claim routed to the wrong payer; rework and delay | **Latent** — operators know the rule, but no tool enforces it |
| 5 | **Australian software that assumes an ABN.** Signup asks for a number they do not have | At every evaluation | Abandons the trial in the first 90 seconds | Aware and irritated |
| 6 | **Reports citing the wrong building code.** An NZ report should reference NZBC E2/E3, not Australia's NCC | Per report | Assessor queries; credibility damage | Latent |

**Pain 5 is the one that costs us customers today, and it is ours, not theirs.** See §7.

---

## 4. Trigger events

- A natural-hazard event puts NHCover and private claims on the same job, and the existing
  spreadsheet cannot express the split.
- An insurer or adjuster queries a report that cites an Australian building code.
- The bookkeeper refuses another month of manual Xero entry at 15% GST.
- An Australian competitor's trial is abandoned at the ABN field — and the operator goes
  looking for something that knows what an NZBN is.
- Taking on a second technician; the shared-drive system collapses.

**Not verified:** whether NZ operators actually articulate triggers this way. Australian
trigger language came from real operator contact. These are derived from the product and
the regulatory structure, and are the highest-value thing to test in interviews.

---

## 5. Vocabulary

The Australian ICP lists phrases gathered from real operators. **This section has none,
and inventing them is forbidden by the skill this document follows.** What is listed below
is terminology whose *existence* is verified from statute, regulator, or our own code —
not evidence that operators say it.

| Term | Source | Status |
|---|---|---|
| NHCover, Natural Hazards Commission, Toka Tū Ake | Natural Hazards Insurance Act 2023; `lib/nz/nhcover.ts` | Verified to exist |
| NZBN | NZ Companies Office; `lib/validation/nzbn-validator.ts` | Verified |
| NZBC E2 (External Moisture), E3 (Internal Moisture) | Building Act 2004 Schedule 1; `lib/compliance/nzbs-compliance-gate.ts` | Verified |
| AS/NZS 4849.1 | `lib/compliance/nz-moisture-gate.ts` | Verified — joint standard, applies both sides of the Tasman |
| GST 15%, NZD, Xero tax type `OUTPUT2` | `lib/gst-rules.ts` | Verified |
| IICRC S500 / S520 / S700, WRT, AMRT, ASD, Category 1/2/3, Class 1–4 | Australian ICP | **Assumed to carry over. Unverified for NZ** — whether NZ operators certify through IICRC or a local body is an open question and it matters for every headline we write |

**Do not write NZ copy from this table until §10 interviews are done.** Australian
vocabulary was mined from operators; using it in New Zealand is the same mistake the
current campaign copy already makes.

---

## 6. Watering holes

**Needs primary research.** The Australian list names RIA Australia, specific Facebook
groups, and named supplier trade nights — all gathered, not guessed. Producing a New
Zealand equivalent by inference would be a list of plausible-sounding places, which is
worse than an empty section because it would be spent against.

What is worth establishing first, in priority order:

1. Whether a New Zealand restoration industry association exists, and whether operators
   certify through IICRC or a local body.
2. Which Facebook or LinkedIn groups NZ operators actually use — and whether they use the
   Australian ones, which would change channel strategy entirely.
3. Equipment supplier networks, which in Australia are a genuine trade-night channel.
4. Whether NZ operators read Australian restoration content already.

---

## 7. Buying process — and where it breaks today

This is the section with a verified defect in it.

| Step | What happens | Duration | Deal-breaker |
|---|---|---|---|
| Trigger | As §4 | — | — |
| Awareness | Search, or word of mouth | Days | Copy that says "Australian" |
| Evaluation | Starts a trial | Minutes | **The ABN field. See below** |
| Decision | Owner decides alone, evening | 0–14 days | Xero sync at 15% |
| Procurement | Card, self-serve | Same day | — |

### The evaluation breaks in the first 90 seconds

The positioning statement is: *"RestoreAssist is the Australian water-damage CRM that is
AI-driven from the moment you type your ABN — not after the seventh setup screen."* One
field drives three parallel hydration jobs against the Australian Business Register.

**New Zealand has no ABR, and there is no NZBN hydration path.** Verified:

- `lib/integrations/` contains `abr/`. There is no NZBN lookup integration.
- `lib/validation/nzbn-validator.ts` **validates** an NZBN checksum. It does not look
  anything up.
- `Organization.country` defaults to `"AU"` (`prisma/schema.prisma:958`).
- The country selector is `components/settings/OrganizationLocaleSetting.tsx`, rendered at
  `app/dashboard/settings/page.tsx:358` — **in Settings, after signup**, not in the wizard.

So a New Zealand operator's first 90 seconds are: sign up, get asked for an ABN they do not
have, land in an organisation defaulted to Australia, find Settings, switch country, type
an NZBN by hand, and fill in every field the Australian path would have hydrated.

**That is precisely the "seventh setup screen" experience the positioning defines itself
against.** Our single strongest differentiator inverts at the border.

The NZBN register publishes an API, so this is buildable, not impossible. Sizing it is
outside this document's scope.

---

## 8. What we can honestly claim in New Zealand today

Written this way deliberately: an ICP that overstates readiness produces copy that gets
found out on the first call.

### Verified working — with tests

| Capability | Where | Evidence |
|---|---|---|
| NHCover vs private claim pathway | `lib/nz/nhcover.ts` | 8 tests; wired into 6 API routes including scope export and PDF |
| NZBC E2/E3 compliance gate, **blocking** for NZ jurisdictions | `lib/compliance/nzbs-compliance-gate.ts` | Passing; AU inspections no-op out |
| Moisture advisory against AS/NZS 4849.1 | `lib/compliance/nz-moisture-gate.ts` | Passing, warn-only by design |
| NZBN validation, GS1 mod-10 checksum | `lib/validation/nzbn-validator.ts` | 12 tests |
| GST 15%, NZD, Xero `OUTPUT2`, MYOB `GST15`, QBO `GST NZ` | `lib/gst-rules.ts` | Passing |
| `en-NZ` formatting, `NZ$` money | `lib/locale/format.ts` | Passing |
| US → AU/NZ unit and terminology conversion | `lib/anz/localisation.ts`, 664 lines | Passing |

**83 tests across 9 suites pass** — `lib/nz/__tests__/nhcover`, `lib/compliance/__tests__/`
(nz-moisture-gate, nzbs-compliance-gate), `lib/validation/__tests__/nzbn-validator`,
`lib/__tests__/gst-rules`, `lib/anz/__tests__/localisation`, and `lib/locale/__tests__/`
(format, organization-locale, validate-organization-profile). Run with
`npx vitest run --config config/vitest.config.js <those paths>` on 2026-08-31.

The config matters: run without `--config`, vitest does not set `globals: true` and these
files fail with `describe is not defined`. That is a harness error, not a product defect —
recorded because it looked like one for a few minutes while this document was being written.

### Verified NOT ready

| Gap | Evidence | Consequence |
|---|---|---|
| No NZBN → register hydration | No NZBN integration in `lib/integrations/` | The headline promise does not work in NZ |
| Country chosen after signup, defaults to AU | `prisma/schema.prisma:958`; settings page | Onboarding assumes Australia at the front door |
| WHS asbestos gate is Australia-only | `lib/anz/whs-gate.ts`: `ASBESTOS_BAN_YEAR = 2004`, "licensed removal per the relevant state regulator" | **Safety-relevant.** NZ's asbestos import ban is later than Australia's, so an NZ property built after 2004 could contain ACM and this gate would treat it as ACM-free. Confirm NZ's date and jurisdiction handling before any NZ launch |
| Standards mapping cites NCC 2022 | `lib/nir-standards-mapping.ts:834` | An NZ report may cite the Australian building code |

### Live copy defects to correct

1. `RA-5036-organic-launch-campaign-FINAL.md:42` — *"Built for Australian and New Zealand
   conditions: GST at 10%, 11-digit ABN validation… Sign-up starts with your ABN."*
2. `directory-listing-pack-2026-08-25.md:70` — claims NZ regulatory context, then lists
   "NCC 2022, state work health and safety regimes, and the relevant state regulators."
   New Zealand has no states and does not use the NCC. This is a **published directory
   listing**, so it is externally visible.
3. `restoreassist-facebook-linkedin-campaign-2026-06-23.md:341` already flagged it —
   *"Optional second ad set: New Zealand, if messaging is adjusted to remove AU-only
   GST/ABN emphasis."* The fix was deferred and never made.

These are **not** edited by this document. Correcting a FINAL campaign asset is a separate,
deliberate change.

---

## 9. Anti-ICP

- **New Zealand operators doing only natural-hazard work.** NHCover's assessment process is
  not our reporting flow. We serve the restoration contractor, not the NHC assessor.
- **Australian operators with an occasional NZ job.** They will run one AU organisation and
  hit the single-country model. Multi-jurisdiction tenancy is not in scope.
- **General builders doing occasional water damage.** Same as Australia — they want a
  general CRM.
- **Franchise networks with central IT.** Same as Australia — wrong procurement motion.
- **Anyone we would have to tell "the ABN field is fine, just ignore it".** Until §7 is
  fixed, an NZ operator who needs hydration to work is not yet our customer, and selling to
  them produces a churned account and a public complaint.

---

## 10. What would close the gaps — five interviews

The skill this document follows requires that thin sources be named rather than filled in.
Sections 1 (size), 4 (trigger language), 5 (vocabulary) and 6 (watering holes) are the thin
ones. Five conversations would close all four:

1. **Two owner-operators, 1–5 technicians, one North Island one South Island.** Ask what
   they call the work, what software they run, and what happened on their last mixed
   NHCover/private claim.
2. **One loss adjuster or insurer claims handler.** Ask what makes a restoration report get
   queried in New Zealand, and whether IICRC citations carry weight there.
3. **One bookkeeper serving restoration trades.** Ask what breaks between job software and
   Xero at 15% GST.
4. **One equipment supplier or trainer.** They know where operators gather, which §6 cannot
   answer from a desk.

Until then: **do not generate New Zealand campaign copy from this document's §5.** Use §7
and §8, which are code-verified, and which are enough to fix the three live defects and to
brief the NZBN hydration decision.

---

## Provenance

- Product claims: read from the RestoreAssist repository at
  `claude/feature-enablement-check-f3yxs4`, 2026-08-31, with the file and line cited inline.
  Test counts from `npx vitest run --config config/vitest.config.js` on the named suites.
- NHCover rules: `lib/nz/nhcover.ts`, which cites naturalhazards.govt.nz and carries a
  source-confirmation date of 2026-06-09. Not independently re-verified here.
- Market claims: desk research. No New Zealand operator was contacted.
- The Australian ICP (2026-05-13) is 110 days old — inside this skill's 180-day refresh
  window — so this document is additive, not a replacement.
