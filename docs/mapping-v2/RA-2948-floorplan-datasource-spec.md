# RA-2948 — Pre-loaded Property Floor Plan: Data-Source Decision Spec

**Linear:** RA-2948 (research synthesis + data-source decision) · Epic: RA-2947 · Reconciles with: RA-5689 (ADR-001 geometry), RA-1615 (property-data API investigation)
**Status:** Finalised for owner decision. Not yet built — the build is gated on ADR-001 (§7).
**Author:** Claude (Nexus) · 2026-07-02

> **Reframed 2026-07-02:** the owner's direction is to build a **proprietary restoration data asset** (incidents + outcomes for annual reports / industry intelligence), not just a pre-load convenience. Under that framing, floor-plan acquisition (scrape *or* Vision import) is a **transient input to a job**, and the durable value is the first-party incident data. See **`docs/mapping-v2/restoration-data-asset-spec.md`** — that is now the primary spec; this document is the narrow "which floor-plan source" sub-decision within it. Key consequence: portal floor-plan *images* are used transiently (underlay_reference) and **not** hoarded; only technician-derived geometry + incident data are kept.

---

## 0. What already exists (read first — do not re-litigate)

1. **RA-1615** (`docs/compliance/property-data-api-investigation.md`, merged 2026-04-26) already investigated *floor-plan images* from AU property-data vendors (CoreLogic, Domain, PropTrack, OnTheHouse) and concluded: **no vendor delivers floor-plan images via API**, and listing floor plans die 3–6 months after a sale closes. The durable answer shipped as **Claude Vision import** (photograph a paper plan or hand sketch → polygon geometry).
2. **RA-6757** (Sketch epic, 14 PRs, 2026-06-16) shipped that Vision import: `app/api/inspections/[id]/sketches/import-from-image`, `SketchEditorV2.handleImportSketch`, `FloorPlanUnderlayLoader.tsx`.
3. **The provenance ADR (RA-5689) already exists** in `docs/mapping-v2/spec.md` §6.4/§8.1: every sketch element carries `provenance ∈ { operator_measured, underlay_reference }`, and **only `operator_measured` geometry may feed S500/scope/PDF exports**. Imported/pre-loaded geometry is `underlay_reference` — faded, watermarked, non-exported — until a technician verifies and promotes it.

**Reconciliation:** no conflict. Any pre-loaded footprint, if built, MUST enter as `underlay_reference` under the existing firewall. This spec adds no new geometry model.

---

## 1. The load-bearing distinction

RA-2947's promise is "the tech arrives with the floor plan already on screen." That needs **interior room layout**. **No ANZ data source delivers interior floor plans by API** (RA-1615). The paid candidate below (Geoscape) sells a **building footprint** — the roof-outline polygon, nothing inside it. A footprint gives orientation, scale, and exterior shape to trace against; it is **not a floor plan**. Paying for it does not deliver the epic's headline promise — it buys a tracing outline.

---

## 2. Goals

- Decide the AU/NZ data source (if any) for pre-loading a residential property's approximate **footprint** before a technician starts a sketch, to speed on-site drawing (trace-over, not measure-from).
- Keep the decision commercially viable for a multi-tenant SaaS (licence must permit displaying the data to the property owner during a paid job).
- Produce acceptance criteria the RA-2947 build ticket can implement without re-researching.

## 3. Non-goals

- Not re-deciding floor-plan **image** sourcing (RA-1615 closed it; Vision import is the answer).
- Not proposing a new geometry/provenance model (RA-5689's firewall stands).
- Not evaluating US/CA sources as primary (AU/NZ only, per project policy).
- Not deciding RoomPlan/LiDAR capture (separate track; see the RA-2974 patent risk in §6).

## 4. Candidate sources compared

| Source | Returns | AU/NZ coverage | Licence | Cost (indicative) | Integration effort | Floor-plan image? |
|---|---|---|---|---|---|---|
| **Geoscape Buildings** | Building footprint polygons + height (aerial/LiDAR-derived) | AU national, ~15M buildings, high | Commercial (Geoscape / resellers); redistribution terms vary by tier | Enterprise-tier, ~$10k+/yr class at SaaS scale — **unpublished, needs a quote** | Medium (REST, GeoJSON) | No — footprint only |
| **LINZ Building Outlines** | Footprint polygons | NZ national, high | **Open — CC-BY 4.0** (LINZ Data Service) | **Free** | Low (REST/WFS, GeoJSON) | No |
| **OpenStreetMap** | Community footprints | AU metro dense; **regional/rural patchy**; NZ moderate | ODbL (attribution + share-alike on derived data) | Free | Low (Overpass / vector tiles) | No |
| NSW Spatial / state cadastres | Footprints/lot boundaries | State-by-state, inconsistent | Mixed open | Free–low | High (8 integrations for full AU) | No |
| CoreLogic RP Data | Property attributes; footprint unconfirmed | National | **Disqualified** — TOS prohibits display to third party (owner) during a job | Enterprise | High | No |
| Domain Group API | Property metadata; no footprint | National (listings) | Self-serve free tier | $0–low | Already integrated (metadata) | No |

## 5. Ranked recommendation

**1st — defer the paid build (recommended).** Do not build pre-load until a technician-facing need is validated. RA-1615 established the real pain (a usable floor plan) is unsolvable by AU data feeds and already solved by Vision import. A bare footprint is a modest convenience, not a core capability. Defer pending a usage signal (e.g. "% of sketches started from blank canvas").

**Cheap middle path (recommended if any demand signal exists):** spike the **free** sources first — LINZ for NZ (open, national), OSM for AU metro — behind the existing `underlay_reference` firewall. A few days validates whether an outline underlay is even valued, at near-zero cost, **before** committing to Geoscape's paid national coverage. Validate, then pay.

**2nd — if the owner commits to national AU coverage now:** Geoscape Buildings (AU) + LINZ (NZ), with OSM as the no-match fallback (mirrors the existing Domain→OnTheHouse fallback chain — free for the common case, safety-net coverage). Not CoreLogic (TOS disqualifier). Integrate via the existing `PropertyEnrichmentProvider` interface (`lib/property/provider.ts`) with a new `getBuildingFootprint(address)` capability — not a parallel system.

## 6. Acceptance criteria (Given/When/Then — for the RA-2947 build ticket)

```gherkin
Feature: Pre-loaded property footprint as sketch underlay

Scenario: Footprint found for an AU address
  Given a technician opens a new inspection sketch for an AU property address
  And the configured source returns a footprint polygon for that address
  When the technician selects "Load property outline"
  Then the footprint renders as a faded (~50%), watermarked underlay
  And every element traced over it is tagged provenance "underlay_reference"
  And the underlay is excluded from S500/scope calculations and from any PDF/export
  Until the technician explicitly verifies and promotes a room to "operator_measured"

Scenario: No footprint available (regional property / OSM gap)
  Given the primary source returns no match for the address
  When the OSM fallback also returns no match
  Then the sketch opens with a blank canvas
  And the technician sees "Property outline not available — draw manually"
  And no error is thrown

Scenario: NZ address
  Given the inspection country is "NZ"
  When the technician requests a property outline
  Then LINZ Building Outlines is queried instead of the AU source
  And the same underlay/provenance rules apply

Scenario: Licence-restricted source excluded
  Given a source's licence prohibits display to the end-client
  Then that source is never called for this feature (enforced by provider config, not convention)
```

## 6a. Related risk (carry into RA-2947, not this spec)

RA-2947's fallback layer is **RoomPlan LiDAR**. **RA-2974 flags a US patent blocker** (Locometric US 11,269,060 + 8,868,375) with an **open question on AU equivalents**. Any LiDAR/RoomPlan commitment must go to legal first. A bare footprint polygon (fact data, not an artistic drawing) is a materially lighter copyright question and likely does **not** need the same sign-off — but flag it to the existing IP counsel engagement (`au-ip-opinion-brief.md`) rather than opening a second review track.

## 7. Constraints

- **AU/NZ only.** No US/CA source as primary.
- **Provenance firewall non-negotiable.** Pre-loaded geometry = `underlay_reference`; never auto-promoted. No exception to RA-5689 §8.1.
- **Licence must permit B2B SaaS display to the property owner during a paid job** — the disqualifier for CoreLogic. Confirm in writing before any paid integration.
- **Privacy:** footprint data is about the structure, not the occupant (lower sensitivity than floor-plan images), but address-level lookups reuse the existing `PropertyLookup` 90-day cache + cascade-delete pattern (Privacy Act, RA-1326). Reuse, don't duplicate.

## 8. The single decision that unblocks the build — ADR-001 (owner: Rana/Phill)

The feature cannot be built until **RA-5689's ADR-001 geometry model** is chosen, because how a footprint underlay integrates depends on it:
- **Option A** — Fabric blob only (`ClaimSketch.sketchData`): footprint becomes another blob layer; provenance is app-enforced only.
- **Option B** — normalized `SketchElement` rows only.
- **Option C (recommended in RA-5689)** — hybrid: blob as render source + derived normalized `SketchElement` rows on save → **DB-enforceable** provenance for the §6.4 drying guard and §8 IP evidence.

Option C makes the `underlay_reference` firewall enforceable at the database layer, which is the correct home for a legal/compliance control. **Pick the ADR-001 option and the free-source spike can proceed; the paid Geoscape integration additionally needs the §5 budget + licence sign-off.**

## 9. Open questions for the owner

1. Is RA-2947 pre-load still wanted at all, given Vision import already ships the higher-value capability?
2. If yes — approve a Geoscape commercial quote (~$10k+/yr class, needs a direct vendor quote), or start with the free LINZ/OSM spike to gather demand first?
3. ADR-001 geometry option (recommend C).
4. Route the RA-2974 LiDAR patent + AU-equivalent question to legal before any Adapter B / RoomPlan commitment.
5. If deferred: what usage signal (e.g. "% of sketches started blank," or a technician survey) triggers revisiting?
