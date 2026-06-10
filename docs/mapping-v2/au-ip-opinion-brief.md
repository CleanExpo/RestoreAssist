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
