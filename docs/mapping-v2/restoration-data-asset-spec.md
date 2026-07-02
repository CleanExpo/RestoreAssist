# Restoration Data Asset — Architecture Spec

**Owner decision captured:** 2026-07-02 (Phill) — "build our own database of floor plans, where incidents occurred, what happened… store and keep this data so we can build our own value-add knowledge for Annual Reports, Industry topics."
**Status:** Spec for owner sign-off. Phase 1 is buildable immediately; Phases 2–3 are gated (see §6).
**Reframes:** RA-2948 (data-source decision) and RA-2947 (floor-plan epic) around the *data asset* as the goal, not the floor-plan convenience.
**Author:** Claude (Nexus) · 2026-07-02

---

## 1. The strategic insight: the moat is the incident data, not the floor plans

Every job RestoreAssist runs generates data nobody else has: a property, a damage classification (water Cat 1/2/3, fire, mould, structural), what happened, moisture readings over time, what remediation was done, timeline, and outcome. That is **first-party operational data** — RestoreAssist generated it, owns it outright, and it compounds. A longitudinal AU/NZ dataset of "what actually happens in restoration and how it resolves" is a defensible asset that powers annual reports, benchmarking, and industry content no competitor can replicate.

**The floor plan is the canvas; the incident data layered on it is the value.** This spec is built around that. Floor-plan acquisition (scrape or Vision import) is a *transient input* to a job, not something the asset hoards.

## 2. Two data layers — different rules, kept separate by design

The existing schema already draws this line and it must be preserved:

| | **Operational layer (exists)** | **Asset / analytics layer (new)** |
|---|---|---|
| Purpose | Serve the live job | Longitudinal intelligence, annual reports |
| Examples | `Inspection`, `PropertyLookup`, `ClaimSketch` | new `RestorationIncident` (de-identified aggregate) |
| Identifiability | Address-level, PII | **De-identified / aggregated — postcode/region, no address, no owner** |
| Retention | **Ephemeral** — `PropertyLookup` expires at 90 days and cascade-deletes with the `Inspection` (RA-1326, Privacy Act) | **Permanent** — this is the asset |
| Legal basis | Consent + retention policy for service delivery | Aggregated/anonymised data falls outside PII once de-identified |

**The rule:** the operational layer stays exactly as it is (ephemeral, cascade-delete, address-level — the Privacy Act safety valve). The permanent asset is built by **de-identifying at ingestion** into a separate store. You keep the trend, not the person or the address.

## 3. Floor plans: use them, don't hoard them (copyright/ToS)

realestate.com.au / domain.com.au / OnTheHouse floor-plan **images are copyrighted** (draftsperson/portal) and the portals' terms prohibit scraping — REA enforces this. The existing `PropertyLookup.dataSource` already scrapes (`domain|realestate|onthehouse|corelogic`) as a **transient** cache (90-day expiry, cascade-delete). That transient-tracing pattern is the safe one and aligns with the RA-5689 provenance firewall: an imported plan is `underlay_reference` (watermarked, non-exported) until a technician traces their own geometry over it and promotes it to `operator_measured`.

- **Keep:** the technician's *derived vector geometry* (their own work product — legally RestoreAssist's) + the incident data.
- **Do not keep/redistribute:** the portal's raw floor-plan *image* as a permanent commercial library. That flips transient-tracing into building a product on someone else's copyrighted assets — the cease-and-desist version.

A one-page IP/ToS opinion on transient-vs-permanent use is a Phase-3 gate; it rides on the open `au-ip-opinion-brief.md` engagement.

## 4. Phase 1 (build now — safe, high-value): the incident schema

No legal blockers — this is first-party data. Add a de-identified aggregate derived on job close, grounded in existing models/enums (`WaterCategory` CAT_1/2/3, `DamageClass` CLASS_1-4, `LossSourceType`, `Inspection`):

```prisma
/// De-identified restoration incident record for the permanent data asset.
/// Derived from an Inspection on close; carries NO address, owner, or free-text PII.
/// This is the analytics store — never cascade-deleted with the Inspection.
model RestorationIncident {
  id            String        @id @default(cuid())
  // Geography: region-level only, never street address
  state         String        // AU state / NZ region code
  postcode      String        // postcode granularity is the finest allowed
  // Classification (reuse existing enums)
  waterCategory WaterCategory?
  damageClass   DamageClass?
  lossSource    LossSourceType?
  hazards       String[]      // asbestos/mould/electrical flags, no narrative
  // Structure context (from derived geometry, not the portal image)
  buildingType  String?       // detached/unit/commercial
  floorAreaM2   Int?          // rounded to reduce re-identification
  roomCount     Int?
  // Outcome (the intelligence)
  remediationDays Int?
  outcome       String?       // resolved / escalated / etc. (controlled vocab)
  // Provenance + privacy
  sourceInspectionHash String  // one-way hash — links back for audit, not identity
  capturedAt    DateTime      // truncated to month for reporting
  createdAt     DateTime      @default(now())

  @@index([state, postcode])
  @@index([waterCategory, damageClass])
  @@index([capturedAt])
}
```

Ingestion: a fire-and-forget hook on `Inspection` close (mirrors the existing `exportClosedJobToBYOKStorage` close-hook pattern) derives one `RestorationIncident`, stripping address/owner/free-text and rounding quasi-identifiers. **This never reads or keeps the portal image.**

## 5. Phases 2–3

- **Phase 2 (analytics pipeline):** aggregate queries over `RestorationIncident` for the annual-report / industry-topic outputs — always ≥ N-anonymity thresholds (suppress cells below a minimum count so a postcode+category can't re-identify a single job). De-identified from the start.
- **Phase 3 (gated):** decide whether to persist derived floor-plan *geometry* beyond the job (owned work product — likely fine) — but **not** portal images. Requires the §3 IP opinion.

## 6. Gates before each phase

| Phase | Gate | Owner |
|---|---|---|
| 1 — incident schema | ADR-001 geometry option (RA-5689) if geometry fields are populated from sketches; none if starting classification-only | Phill/Rana |
| 2 — analytics | Privacy sign-off on the de-identification method + N-anonymity threshold | Phill |
| 3 — floor-plan permanence | IP/ToS opinion (transient vs permanent portal-image use) via `au-ip-opinion-brief.md` | Phill + legal |
| Any LiDAR/RoomPlan | RA-2974 Locometric patent + AU-equivalent question to legal | Phill + legal |

## 7. Acceptance criteria (Phase 1)

```gherkin
Scenario: Incident derived on job close, de-identified
  Given an Inspection is closed with a water category and loss source
  When the close hook runs
  Then exactly one RestorationIncident row is written
  And it contains NO street address, owner name, or free-text narrative
  And geography is stored at postcode granularity only
  And deleting the source Inspection does NOT delete the RestorationIncident
     (the asset is de-identified and survives operational deletion)

Scenario: Portal image never persisted to the asset
  Given a job used a scraped floor plan as an underlay_reference
  Then no portal floor-plan image is written to RestorationIncident or any permanent store
  And only technician-derived geometry (if any) is retained

Scenario: Analytics respects anonymity threshold
  Given an annual-report query groups incidents by postcode and category
  When a group contains fewer than N incidents
  Then that group is suppressed from the output
```

## 8. Open decisions for the owner

1. **Phase 1 scope:** start classification-only (safest, zero geometry dependency), or include derived floor-area/room-count from sketches (needs ADR-001)?
2. **N-anonymity threshold** for published aggregates (recommend N ≥ 5 per cell).
3. **Retention position** on operational `PropertyLookup` — confirmed unchanged (stays ephemeral/cascade-delete)?
4. **Phase-3 appetite** — is persisting derived geometry worth the IP opinion now, or defer until the incident asset proves its value?
