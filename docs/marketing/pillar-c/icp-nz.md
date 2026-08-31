# RestoreAssist — Ideal Customer Profile: New Zealand

**Date:** 2026-08-31
**Companion to:** [[icp]] (Australia, 2026-05-13)
**Produced by:** `marketing-icp-research`, following `marketing-studio/frameworks/icp-canvas.md`

**Evidence grades used throughout.** `[code]` = read from this repository, file:line given.
`[primary]` = a government, insurer, standards body or association's own page.
`[secondary]` = trade or commentary. `[gap]` = looked for, not found. **No customer quote in
this document is invented** — the skill forbids it, so where the Australian ICP carries
operator language this one carries sourced terminology instead, and says which is which.

> **Revision note.** The first version of this document was failed by an independent review
> before it was used. It claimed the NZ Building Code gate was "blocking for NZ jurisdictions"
> when `nzbs-compliance-gate.ts:70` hardcodes `propertyCountry = "AU"` and the gate no-ops for
> everything; and it described the country selector as living in Settings when the setup wizard
> has offered AU/NZ all along. Both are corrected below, and the real onboarding defect turns
> out to be worse than the one originally reported. Recorded rather than quietly fixed, because
> a marketing document asserting a compliance capability the code does not have is the exact
> failure this document exists to prevent.

---

## Why this document exists

`docs/marketing/pillar-c/icp.md` mentions New Zealand **zero times**; its geography row reads
"All Australian states and territories." Published campaign copy tells New Zealand readers the
product is "built for Australian and New Zealand conditions: GST at 10%, 11-digit ABN
validation" — every specific in that sentence is Australia-only.

Meanwhile the product carries real New Zealand engineering, including claim-pathway routing
under the Natural Hazards Insurance Act 2023. Engineering built for New Zealand. Marketing has
been selling Australia to it.

---

## 1. Firmographics

| Attribute | Value | Grade |
|---|---|---|
| Industry | Property restoration — water, mould, fire and smoke, sewage, **and methamphetamine decontamination** (see §3, pain 4) | `[primary]` |
| Business count | **Unknown.** No ANZSIC class for restoration. Nearest proxy: 12,186 enterprises in ANZSIC N73 (building cleaning, pest control and other support services), Stats NZ Feb 2025 — restorers are a small unquantified subset | `[gap]` |
| Typical size | Very small. Named NZ operators run 2–20 staff (NZRS 4, RESTATE 2, Pure Services 8, Morgan Project Services 20). RIA describes "over 150 businesses" across **all of Australasia** | `[secondary]` |
| Geography | National. Auckland, Christchurch, Hamilton and Hawke's Bay carry the named operators | `[secondary]` |
| Entity type | Limited company · sole trader · look-through company. **NZBN, not ABN** — and see the design note below | `[primary]` |
| GST | 15%, registration threshold NZ$60,000 | `[primary]` |
| Accounting | Xero — NZ-founded, NZ-headquartered, the default among NZ accountants. Exact NZ share not verifiable from a primary source | `[secondary]` |
| Claims exposure | Two systems. **NHCover** for earthquake, landslip, volcanic, hydrothermal, tsunami and resulting fire. **Private insurer** for storm and flood *building* damage | `[code]` + `[primary]` |

### Two design notes that an Australian assumption gets wrong

**The NZBN is not the ABN.** It is free, automatic for companies, **optional** for sole traders
and partnerships, and it is **not a tax number**. There is no equivalent of Australia's 47%
ABN-withholding regime. The identifier that must appear on a New Zealand invoice is the **GST
number**. Make NZBN an optional field; never require it, never treat it as the tax identifier.
`[primary — MBIE, IRD]`

**"Tax invoice" is not a New Zealand term.** Since 1 April 2023 the statutory requirement is
**taxable supply information**; credit notes are **supply correction information**. Buyer details
are only required above NZ$1,000. `[primary — IRD]`

### The structural difference an Australian vendor will miss

**NHCover does not cover flood or storm damage to the building — land only.** A flooded house is
a *private insurer* claim for the dwelling. The 2023 Auckland Anniversary floods and Cyclone
Gabrielle produced 118,037 claims worth ~NZ$3.81bn, essentially all private. `[primary — ICNZ]`

So "an EQC job" is the wrong mental model. What *is* New Zealand-specific is that a single claim
can carry an under-cap NHCover portion and an over-cap private portion, administered by one
insurer acting as NHC's agent. **RestoreAssist already routes this correctly in code** — and has
never said so in a line of marketing.

---

## 2. Roles in the buying group

| Role | Title variants | Seniority | Measured on | Change vs Australia |
|---|---|---|---|---|
| Decision maker | Owner, director, owner-operator | Principal | Cash collected, jobs closed | Same |
| Champion | Lead technician, restoration technician | Senior tech | Whether phone-to-report works on site | Same |
| User | Technician, drying tech, meth decon operator | Field | Time to finish a job file | **Meth decon is a distinct NZ role** |
| Blocker | Bookkeeper, external accountant | External | Clean line items in Xero at 15% | **Stronger** — Xero is the home-market default |
| Silent influencer | **Morgan Project Services** (Vero / AA / Suncorp building claims), loss adjuster, NHC assessment | External | Whether the report supports the claim | **New.** Australia has no MPS-equivalent named intermediary |

**Morgan Project Services is a named counterparty worth knowing.** It centrally manages Vero
building claims and is "trusted by Vero Insurance, AA Insurance and Suncorp". An MPS project
manager writes the Scope of Works, arranges make-safe, sends the agreed scope out for quote and
appoints the contractor. `[primary — vero.co.nz]`

---

## 3. Pain hierarchy (ranked)

Pains 1–3 carry over from Australia unchanged — restoration admin is restoration admin — and
their frequency and severity figures are the Australian ones, not New Zealand measurements.
Pains 4–7 are New Zealand-specific.

| # | Pain | Frequency | Severity | Awareness |
|---|---|---|---|---|
| 1 | Admin overhead eating the evening | Daily | 2–3 hrs/night `[AU figure]` | Actively shopping `[AU]` |
| 2 | Insurer pushback on report evidence | Weekly | Job stalls; cash stops | Aware `[AU]` |
| 3 | Re-keying line items into Xero | Weekly | Hours + errors | Aware `[AU]` |
| 4 | **Meth decontamination has no software support.** NZS 8510:2017 became partly binding for rentals on **16 April 2026** — 15 µg/100 cm² room-by-room, 30 µg triggers termination, detailed testing by a qualified professional **independent of the decontaminator** | Per meth job | A whole revenue line unsupported | **Latent** — unmeasured |
| 5 | **Reports cite the wrong standards and the wrong building code** (see §8) | Every report | Assessor queries; credibility | **Latent** — unmeasured |
| 6 | **The setup wizard's NZ path skips every hydration job** | At every evaluation | Trial abandoned | Unmeasured |
| 7 | Getting the NHCover / private split wrong on a mixed-cause loss | Per hazard event | Claim to the wrong payer | Unmeasured |

**Awareness for pains 4–7 is not graded.** The Australian ICP's awareness column came from
operator contact. Grading a New Zealand market nobody has spoken to would be the same mistake
the current campaign copy already makes.

**Pains 5 and 6 are ours, not theirs.** See §8.

---

## 4. Trigger events

- A natural-hazard event puts NHCover and private portions on one job.
- A meth job arrives and the tenancy regulations now dictate thresholds, testing independence
  and documentation the current toolchain cannot produce. `[primary — HUD, Tenancy Services]`
- An adjuster queries a report citing an Australian building code.
- An Australian competitor's trial dies at the ABN field.
- The bookkeeper refuses another month of manual entry at 15%.

**Not verified.** Australian triggers were quoted from operators. These are derived from statute
and from our own code, and are the highest-value thing to test in interviews.

---

## 5. Vocabulary

Terminology whose existence and meaning are sourced. **These are not operator quotes** — no New
Zealand operator has been contacted — but they are the words the statutes, insurers, standards
bodies and NZ trade sites actually use, and they are safe to write from.

### The standards trap — the most important entry in this table

> The two designations in the next sentence are **Standards Australia** publications, not the
> ANSI/IICRC editions `standardCite()` owns. Naming them exactly is the point of this section:
> they are a different document from ANSI/IICRC S500:2021 and S520:2024, and citing them in a
> New Zealand report is the mistake being described. Rewriting them to the editions the gate
> expects would delete the finding, so the literals are exempted on their own line.

**`AS-IICRC S500:2025` and `AS-IICRC S520:2025` are Australian Standards with no NZ status.** <!-- standards-cite-ignore -->
 Standards Australia published them via committee ME-094, whose membership is entirely
Australian bodies. **No Standards New Zealand adoption was found.** New Zealand practitioners
cite **ANSI/IICRC S500 (2021, 5th ed.)** and **ANSI/IICRC S520 (2024, 4th ed.)** directly, and
NZQA unit standard 29390 requires evidence reflecting ANSI/IICRC S500:2021 and S520, plus
**AS/NZS 3733:2018**. A New Zealand supplier states it plainly: S520-2024 "is not a legally
binding regulation in New Zealand, but it serves as the definitive 'standard of care'."
`[primary — NZQA, IICRC, Standards Australia front matter]`

**IICRC certification itself transfers** — it is individual and international. What does *not*
transfer: an Australian asbestos licence (WorkSafe NZ issues its own), an Australian builder's
licence (NZ requires an LBP for restricted building work), and any reliance on AS-IICRC.

### Trade terms — genuinely different words for the same things

| NZ term | Meaning | Why it matters |
|---|---|---|
| **GIB**, "gib-stopping", "gibbing" | Plasterboard. Used as a verb | AU says Gyprock. Appears in every strip-out scope |
| **Dwang** | Horizontal nog between studs | AU says noggin |
| **Scrim and sarking** | Hessian over board, wallpapered directly. Pre-WWII housing, often over **rimu** | A soaked scrim wall is a NZ-only drying problem, and an insurance-loading issue |
| **Monolithic cladding** | Plastered sheet cladding | Central to the leaky-building crisis |
| **Leaky home / weathertightness** | The NZ crisis, late-1980s to mid-2000s | No AU equivalent as a national category. Colours every moisture finding in that build era |
| **Bach** (North Is.) / **crib** (Otago, Southland) | Holiday home | NHCover covers these as dwellings |
| **Kāinga Ora** | The state housing landlord | A major restoration client |
| **Reinstatement** | The rebuild phase | NZ firms self-describe as "Insurance Reinstatement specialists" |
| **Spouting** | Guttering | `[secondary]` |

### Insurance and compliance terms

| NZ term | Note |
|---|---|
| **NHCover** / **EQCover** | Two live regimes split at 1 July 2024 by date of damage. A property with old and new damage sits under **two statutes with different excesses** |
| **Toka Tū Ake** / **NHC** | The Natural Hazards Commission. "EQC" still in colloquial use |
| **Under cap / over cap** | The NZ$300,000 + GST split |
| **Scope of Works** | Identical to Australia, capitalised in insurer and court documents |
| **Cash settle** | Central to NZ practice. **NHC land claims are always cash settled** |
| **Building consent** / **Code Compliance Certificate** / **LIM** | Not "development approval" / "occupancy certificate" |
| **RBW** / **LBP** / **Record of Work** | Restricted Building Work licensing. Bites the moment reinstatement touches framing, cladding, flashings, membranes or damp-proofing under a consent — penalties to NZ$50,000 |
| **Category 1 / 2 / 2P / 3** | Post-2023 flood risk categorisation. **Categories 2 and 3 appear on the LIM permanently** |
| **Meth** / **"P" decontamination** | A named service line NZ firms advertise |
| **ACC** | Replaces every mention of workers' compensation |
| **IRD number** / **GST number** | Replaces TFN / ABN |
| **Taxable supply information** | Replaces "tax invoice" since 1 April 2023 |
| **Healthy Homes standards** | All private rentals since 1 July 2025 |

---

## 6. Watering holes

Split into what desk research settled and what still needs an operator on the phone — the
distinction the first version of this document failed to make, deferring desk-answerable
questions to interviews and turning a gap into a permanent one.

### Settled by desk research

- **There is no New Zealand restoration association.** **RIA Inc. Australasia** is the chapter
  body for both countries: "All restoration contractors and professionals located in Australia
  and New Zealand must join and renew their RIA membership through RIA, Inc. Australasia."
  Membership from NZ$649 (under $500k revenue). `[primary — restorationindustry.org]`
- **The first dedicated New Zealand RIA meeting was 14 July 2026, in Auckland**, sponsored by RIC
  Solutions. That is how young the organised NZ side is. `[primary — RIA Australasia]`
- **The annual conference is in Australia** — The Star, Gold Coast, 25–27 August 2026.
- **IICRC training in NZ runs through two named providers:** **Cleaning Systems Ltd / CSL Ascend
  Training** (East Tamaki, Auckland — an IICRC-approved facility with in-house instructors, also
  running NZQA Level 3 qualifications) and **The Restoration Group NZ** (Auckland and
  Christchurch). Deconsystems (AU) also runs NZ courses. `[primary — provider sites]`
- **LinkedIn is where the visible NZ restoration conversation happens** — RIA Australasia, RIC
  Solutions, Cleaning Systems, Pure Services, Morgan Project Services and NZRS post and engage
  each other. `[secondary]`
- **Trade media: INCLEAN** covers the Australasian sector. **No NZ-only restoration publication
  was found.** `[gap]`

### Still needs an operator on the phone

- **No named New Zealand restoration Facebook group could be found.** Searches returned company
  pages only. The open question — and it decides channel strategy entirely — is whether NZ
  operators are already in the three *Australian* groups the AU ICP names. `[gap]`
- Whether NZ operators read Australian restoration content already.
- Equipment supplier trade nights, which are a real channel in Australia.

---

## 7. Buying process

| Step | Activity | Duration | Common objection | Deal-breaker |
|---|---|---|---|---|
| Trigger | As §4 | — | — | — |
| Awareness | Search, word of mouth, LinkedIn | Days | "Is this an Australian product?" | Copy that says "Australian" and means it |
| Evaluation | Starts a trial | Minutes | "Does it know what an NZBN is?" | **The NZ setup path. See below** |
| Decision | Owner decides alone, evening | 0–14 days | "Will it break my Xero?" | GST at 15% wrong anywhere |
| Procurement | Card, self-serve | Same day | — | Pricing shown only in AUD |

### Where the evaluation actually breaks

The positioning statement is: *"RestoreAssist is the Australian water-damage CRM that is
AI-driven from the moment you type your ABN — not after the seventh setup screen."*
`docs/marketing/pillar-c/positioning.md:12`

The wizard **does** offer an AU/NZ country selector, as the first control of the Business details
step — `components/setup/BusinessDetailsCard.tsx:161`, rendered by `SetupShell.tsx:152`. Choosing
NZ correctly swaps the ABN input for Legal name, NZBN and Region. That much works. `[code]`

**The defect is what happens next.** At `BusinessDetailsCard.tsx:98–121` the NZ branch calls
`patchState` and **returns early — it never calls `/api/setup/hydrate` at all** — then sets:

```
setSectionStatus('branding', 'manual');
setSectionStatus('pricing', 'manual');
```

There are three hydration jobs (`app/api/setup/hydrate/route.ts:52–88`): **ABR, WEBSITE and
PRICING**. Only the first has anything to do with the Australian Business Register. **A New
Zealand operator loses all three** — including website branding and pricing, which have no
Australian dependency whatsoever and would work perfectly from the URL they just typed.

So the promise is not merely unavailable in New Zealand; two thirds of it is withheld for no
technical reason. An NZ operator's first 90 seconds end in `'manual'`, `'manual'` — which is
precisely the "seventh setup screen" the positioning defines itself against.

There is no NZBN lookup integration: `lib/integrations/` holds `abr/`, `ascora/`, `myob/`,
`quickbooks/`, `servicem8/`, `xero/`. The NZBN register publishes an API `[secondary]`, so ABR
parity is buildable. **Restoring the WEBSITE and PRICING jobs to the NZ branch needs no new
integration at all.**

---

## 8. What we can honestly claim in New Zealand today

### Verified working, with tests

| Capability | Where | Evidence |
|---|---|---|
| NHCover vs private claim pathway — NZ$300k cap, $500 flat excess, storm/flood land-only | `lib/nz/nhcover.ts` | 8 tests. `classifyCover` is called at runtime from `lib/sketch/pdf-scope.ts` and `components/sketch/SketchSelectionPanel.tsx`; four API routes and two libs take `DamageCause` as a **type-only** import |
| NZBN validation, GS1 mod-10 checksum | `lib/validation/nzbn-validator.ts` | 12 tests |
| GST 15%, NZD, Xero `OUTPUT2`, MYOB `GST15`, QBO `GST NZ` | `lib/gst-rules.ts` | Passing |
| `en-NZ` formatting, `NZ$` money | `lib/locale/format.ts` | Passing |
| Moisture advisory against AS/NZS 4849.1 — **warn-only by design** | `lib/compliance/nz-moisture-gate.ts` | Passing |
| US → AU/NZ unit and terminology conversion, 664 lines | `lib/anz/localisation.ts` | Passing |
| AU/NZ country selection in the setup wizard | `components/setup/BusinessDetailsCard.tsx:161` | See §7 for what it does not do |

**73 tests across 7 suites pass** — `nz/__tests__/nhcover`, `compliance/__tests__/`
(nz-moisture-gate, nzbs-compliance-gate), `validation/__tests__/nzbn-validator`,
`__tests__/gst-rules`, `anz/__tests__/localisation`, `locale/__tests__/format`. Run with
`npx vitest run --config config/vitest.config.js <those paths>`, 2026-08-31. The `--config` is
load-bearing: without it `globals` is unset and the suites fail with `describe is not defined`.

### Verified NOT ready

| Gap | Evidence | Consequence |
|---|---|---|
| **The NZBC gate does not gate anything.** `nzbs-compliance-gate.ts:70` hardcodes `const propertyCountry: string = "AU"` with `// TODO RA-1120 … no country field exists — default AU so this gate is a no-op` | `[code]` | It **can never block an NZ inspection.** Its own test header says "NZ blocking (currently always no-op due to RA-1120)". Do not claim NZ Building Code enforcement |
| Report footers cite the Australian building code on **every** report | `reportStandardsFooterLine()`, `lib/nir-standards-mapping.ts:871` — takes no country argument, unconditionally appends `standardDesignation("NCC")` | Every NZ PDF footer prints "NCC 2022". Not "may" — does, always |
| Standards cited may be the **Australian** IICRC adoptions | §5 | AS-IICRC has no NZ standing; NZ cites ANSI/IICRC directly |
| NZ setup path skips all three hydration jobs | `BusinessDetailsCard.tsx:98` | §7 |
| No NZBN → register lookup | `lib/integrations/` | §7 |
| WHS asbestos gate is jurisdiction-blind | `lib/anz/whs-gate.ts:14` — `ASBESTOS_BAN_YEAR = 2004`, "the relevant state regulator". No country parameter at all | NZ's asbestos import ban is later than Australia's `[secondary — confirm before launch]`, so a post-2004 NZ build could contain ACM and be treated as clear. Note it is called from one **client component** (`SketchSelectionPanel.tsx:187`) — a UI advisory, not server-enforced, in either country |
| No methamphetamine decontamination support | Searched `lib/`, `app/`, `prisma/` for NZS 8510 and µg/100 cm² thresholds — **no match**. Only a generic "the applicable guideline" string in `lib/restoration/claim-recommendations.ts:102` | A regulated NZ revenue line, binding for rentals since 16 April 2026, with no module |

### Live copy defects — reported, deliberately not edited here

1. `RA-5036-organic-launch-campaign-FINAL.md:42` — *"Built for Australian and New Zealand
   conditions: GST at 10%, 11-digit ABN validation… Sign-up starts with your ABN."*
2. `directory-listing-pack-2026-08-25.md:70` — claims NZ regulatory context, then lists "NCC 2022,
   state work health and safety regimes, and the relevant state regulators." New Zealand has **one**
   Act, **one** regulator (WorkSafe NZ), **no states**, and does not use the NCC. This is a
   **published directory listing**. It does at least say "GST at AU and NZ rates".
3. `restoreassist-facebook-linkedin-campaign-2026-06-23.md:341` — flagged in June, deferred, never fixed.

---

## 9. Channel and price

Carried from the Australian ICP and marked as such, because nothing here is measured in New
Zealand. Listed rather than omitted so a channel strategist has a starting hypothesis and knows
it is one.

- **Channel order (AU):** email > LinkedIn DM > phone. Replies at 6am or 9pm, not 2pm. Hates
  webinars; will watch a 60–120 second walk-through.
- **Price (AU):** A$80–A$200/month per seat, proves itself in week one, will not tolerate more
  than 30 minutes before the first useful action. **NZD pricing is not evidenced.**
- **NZ-specific hypothesis to test:** because RIA is a single Australasian body and the
  conference is in Australia, NZ operators may already sit inside the Australian channels — in
  which case New Zealand is a *messaging* problem, not a *channel* problem. That single question
  determines the strategy and §6 cannot yet answer it.

---

## 10. Secondary ICP: the claims chain

Not the buyer, and more structurally important than in Australia.

| Party | Role | Why it matters to us |
|---|---|---|
| **Morgan Project Services** | Writes the Scope of Works and appoints contractors for Vero / AA / Suncorp | Report format is judged here before it reaches an insurer |
| **IAG NZ** (State, AMI, NZI, Lumley) | **44.0% of all NZ claims received, 2024** | The single largest counterparty |
| **Suncorp NZ** (Vero, AA Insurance) | 27.5% combined | IAG + Suncorp = **71.6% of claims** `[primary — ICNZ; percentages are our arithmetic on their table]` |
| **NHC Toka Tū Ake** | Publishes a **Claims Manual binding on insurers' contractors** | A restorer on an NHC-portion job is inside that chain |
| Tower, FMG, MAS, Hollard | 5.6% / 7.4% / 1.4% / 7.7% | The long tail |

**There is no NHC contractor panel to get onto.** Since June 2021 the Natural Disaster Response
Model routes everything through the private insurer acting as NHC's agent. NHC land claims are
cash-settled, so the homeowner engages the contractor directly. `[primary — NHC, ICNZ]` `[gap:
no public NHC supplier register found]`

---

## 11. Anti-ICP

- **Operators doing only natural-hazard work.** NHC's assessment process is not our reporting flow.
- **Australian operators with an occasional NZ job.** One organisation, one country — multi-jurisdiction
  tenancy is not in scope.
- **General builders doing occasional water damage.** Same as Australia.
- **Franchise networks with central IT.** Chem-Dry NZ (21–26 units, NZ-owned since 2021) is the
  one real NZ franchise system; wrong procurement motion for us.
- **Meth-decontamination-led firms.** Until §8's gap is closed we cannot serve their regulated
  workflow, and NZS 8510 requires the detailed tester be independent of the decontaminator — a
  separation the product does not model.
- **Anyone we would have to tell "just ignore that field".** Until §7 is fixed, selling to an
  operator who needs hydration to work produces a churned account and a public complaint.

---

## 12. What would close the remaining gaps

Desk research settled the association, training providers, standards status, insurer
concentration and vocabulary. What genuinely needs people:

1. **Two owner-operators, one North Island one South Island.** What they call the work, what they
   run, what happened on their last mixed NHCover/private claim, and what a meth job costs them
   in admin.
2. **One loss adjuster or MPS project manager.** What makes a report get queried in New Zealand.
3. **One bookkeeper serving restoration trades.** What breaks between job software and Xero at 15%.
4. **One trainer at CSL Ascend or The Restoration Group.** They know where operators gather, and
   whether NZ operators sit in the Australian Facebook groups — the §6 question that decides
   channel strategy.

**Until then:** §5 is safe to write from — it is sourced terminology, not invented operator
speech — but do not attribute any of it to a person or imply we heard it from a customer. §8 is
the readiness ledger and is now reconciled with the code; use it to fix the three live defects
and to brief the setup-hydration decision.

---

## Provenance

- **Code claims:** read from RestoreAssist at `claude/feature-enablement-check-f3yxs4`,
  2026-08-31, file:line inline. Test counts from `npx vitest run --config config/vitest.config.js`
  on the named suites. Every citation re-verified after the independent review.
- **NHCover rules:** `lib/nz/nhcover.ts`, which cites naturalhazards.govt.nz with a
  source-confirmation date of 2026-06-09.
- **Market claims:** desk research, graded inline. `WebFetch` was blocked by the environment's
  egress proxy, so primary-source pages were retrieved through an alternate fetch path returning
  extracted page text. **No New Zealand operator was contacted.**
- **Review:** the first version was graded NOT FIT FOR PURPOSE by an independent reviewer with no
  sight of how it was produced. Four factual corrections and three missing sections came from that
  review. The reviewer did not verify any New Zealand market fact against external sources.
- The Australian ICP (2026-05-13) is 110 days old — inside this skill's 180-day refresh window —
  so this document is additive, not a replacement.
