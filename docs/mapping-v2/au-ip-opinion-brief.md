# Brief for AU IP counsel — RestoreAssist Mapping "existing-plan import" feature

**Status:** DRAFT for Phill to send to an Australian IP lawyer. **Not legal advice.**
**Purpose:** obtain an Australian copyright opinion **before** launching the paid
existing-plan import feature (spec §8.1). The product gate: this feature must not
ship until counsel signs off.

---

## 1. What we're asking you to opine on

When a restoration operator imports an existing floor-plan/property record for an
address as an **orientation guide**, then produces RestoreAssist's own floor-plan
drawing, does that infringe copyright in the source floor-plan drawing — and do the
controls below adequately mitigate that risk for a paid, multi-tenant feature?

## 2. How the feature works (the facts)

1. The operator supplies their **own** API credentials (BYOK). Property data is
   preferred from a **sanctioned source** (the official Domain API). Scraping via a
   third party (Apify) is a **fallback only**, run under the **client's own account**
   — Unite-Group never runs or pays for the scraping.
2. An imported outline loads as a **faded (~50%) underlay** beneath the sketchpad.
   It is an **orientation guide**, not the deliverable.
3. The operator **verifies against reality** and re-derives the authoritative
   drawing from independent measurement — on-site dimensions, a LiDAR scan, or
   manual dimensioning. Each element is tagged with **provenance**:
   `operator_measured` vs `underlay_reference`.
4. **Only `operator_measured` geometry** feeds the scope, compliance calcs, and any
   **export/PDF**. The underlay (and any scraped image) is a **watermarked reference
   layer that is never exported** as part of the deliverable.
5. "Accept the imported outline as-is" is permitted but **tagged higher-risk** and
   is not the default.
6. Before first use the client must **attest** they hold the right to use imported
   content and will comply with each source's terms.

## 3. Our understanding of the relevant law (please correct/confirm)

- The real-world **layout of a property is a fact** and not, of itself, protected by
  copyright; the **floor-plan drawing** is a protected artistic work even when simple.
- AU case law (the _Look_ line — please cite the authoritative current case) found
  infringement where the defendant worked **from a copy** of the original drawing,
  even with **minor cosmetic variation**. We therefore treat **cosmetic variation of
  windows/doors/fixtures as a product feature, NOT a legal safeguard**.
- We believe the durable position is **independent derivation**: a drawing
  re-measured from the real property is the operator's own work; two
  independently-measured drawings of the same house resembling each other is
  factual correlation (independent creation), not copying.

## 4. Specific questions for counsel

1. Does using an imported floor-plan as an on-screen **orientation underlay** (not
   traced, not exported, watermarked) create copyright risk if the exported drawing
   is **independently re-derived** (`operator_measured`)?
2. Is our **provenance control** (only independently-derived geometry is exported;
   underlay never exported) sufficient to rely on the "independent creation"
   position?
3. What is the residual risk of the **"accept as-is"** path, and should we **remove
   it** for the paid feature or is the higher-risk tag + attestation adequate?
4. **ToS / source liability:** with BYOK + client attestation, does contractual
   exposure for breaching a portal's scraping terms sit with the client, and what
   wording should the attestation and our T&Cs carry?
5. Any **disclosure/record-keeping** we should retain (e.g. the provenance log) as
   evidence of independent derivation if challenged?
6. Does preferring the **official Domain API** materially reduce risk vs the Apify
   scraping fallback, and should we **disable the scraping fallback** for paid use?

## 5. What we can change if advised

Provenance tagging, "never export the underlay", the attestation gate, disabling
"accept as-is", and disabling the scraping fallback are all **configurable controls**
we can tighten on your advice before launch.

---

_Prepared by the RestoreAssist build team. This brief states facts + our lay
understanding only; we are seeking your formal Australian IP opinion._

---

## 6. SECOND QUESTION (RA-6917) — persisting a de-identified data asset

**Status:** the code is built behind a gate and DOES NOT persist any third-party
drawing; we want your opinion before treating the retained geometry as an asset
we can publish aggregate statistics from.

### 6.1 What we now retain (the facts)

On job close, RestoreAssist derives a **de-identified** `RestorationIncident`
record for a permanent internal data asset used to produce **aggregate** industry
statistics (annual reports). Per record we keep, at most:

- Geography at **postcode** granularity (no street address, no owner, no names).
- Damage classification (water category, damage class, loss source).
- **Derived floor geometry: a room count and a total floor area, rounded to the
  nearest 10 m².** This is computed **only** from sketch elements tagged
  `operator_measured` — i.e. the operator's **own on-site measurements**.
  Geometry tagged `underlay_reference` (anything traced over an imported plan)
  is **excluded from the asset entirely**.
- **No floor-plan image, no vector drawing, no coordinates** are stored in the
  asset — only the two scalar metrics above.
- Published outputs suppress any group with fewer than 5 incidents (k-anonymity).

### 6.2 Specific questions

1. Given we retain only **scalar metrics** (room count, rounded area) derived from
   the **operator's own measurements** — and never the source plan, image, or
   coordinate geometry — is there any residual copyright interest of a third-party
   floor-plan author in that retained data?
2. Does excluding all `underlay_reference`-derived geometry from the asset (i.e.
   only the independently-measured layer contributes) put this cleanly on the
   "independent creation" side of the _Look_ line for the retained metrics?
3. **Privacy (APPs), not copyright:** with postcode-level geography, rounded area,
   month-level dates, no address/owner, and 5-incident suppression on outputs, do
   you agree the aggregate asset falls outside "personal information", and is there
   any additional de-identification control you would require before we publish?
4. If you advise it, we can (a) coarsen area rounding further, (b) drop area/room
   count entirely and keep classification only, or (c) raise the suppression
   threshold. Which controls, if any, do you require for the **publishable**
   (annual-report) use as distinct from the **internal** retained data?

### 6.3 What we can change if advised

Area rounding granularity, the suppression threshold, whether geometry is retained
at all, and whether the asset is used only internally vs published — all
configurable before any external annual report is issued.
