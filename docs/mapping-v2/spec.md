# RestoreAssist Mapping V2 — canonical specification

**Status:** Canonical. **Reconstructed from the shipped implementation** — the original
spec was supplied via prompt and never committed, leaving 80+ `spec §…` references across
`lib/`, `app/`, and `components/` pointing at a missing file. This document restores the
referenced sections, each grounded in the code that cites it (file:symbol in _italics_).
Where a section is governed by a deeper artifact, it links to it rather than duplicating.

Mapping V2 is an **ANZ-native** loss-documentation-and-scoping canvas for water-damage
restoration. No North-American estimating tool/format is referenced; the ANZ knowledge
layer is the moat.

---

## §1 Overview & scope

A Fabric.js canvas (multi-floor) where a technician documents a loss: draws rooms,
assigns ANZ materials, captures S500 moisture readings, flags WHS hazards, attaches NCC
references, records the insurance pathway, and exports a compliant scope (PDF + structured
contract + narrative). Persistence is Prisma + Supabase Postgres (`ClaimSketch` Fabric
blob authoritative; normalized `SketchElement` rows derived on save).

## §2 Capture modes

`ClaimSketch.captureAdapter ∈ { manual, roomplan, cloud_ai, underlay_import }`.

- **manual** — technician draws (shipped).
- **homeowner self-capture** — guided subset, public token-write (Phase 2, gated; design
  `homeowner-capture-security-design.md`, plan `homeowner-capture-implementation-plan.md`).
- **roomplan** — Apple LiDAR capture (Phase 2, gated; `roomplan-lidar-implementation-plan.md`).
- **underlay_import** — existing-plan import (Phase 2, legally gated; `existing-plan-import-implementation-plan.md`).

## §4 Canvas & editor

### §4.1 Tools & selection surface

The dock toolbar exposes select / room / wall(line) / freehand / text / arrow / measure /
photo(moisture) / pan; the selection panel edits the active element.
_`components/sketch/SketchEditorV2.tsx`, `SketchDockToolbar.tsx`, `lib/anz/material-options.ts`._

## §5 ANZ domain layer (the moat)

### §5.1 Materials library

AU/NZ material catalogue (Gyprock, fibro, weatherboard, Colorbond…), `isPotentialAcm`
flag, offline-bundled fallback (`ANZ_MATERIAL_OPTIONS`). _`lib/anz/materials.ts`,
`app/api/materials/route.ts`, `SketchSelectionPanel.tsx`._

### §5.2 S500 water category + drying validation

AS-IICRC S500:2021. Water category Cat 1/2/3 per room; class-of-water §8.1; moisture
readings → `dryStandardMet` from current vs target MC; clear "DRY / NOT YET DRY" status.
_`lib/anz/water-category.ts`, `class-of-water.ts`, `dry-standard.ts`, `lib/sketch/pin-drying.ts`,
`SketchMoistureLayer.tsx`._

### §5.3 WHS asbestos gate

Suspected-ACM material on a pre-2004 build → `Hazard` (status `suspected`); **strip-out
scope is blocked** until a WHS pathway note is recorded (friable/non-friable, licensed
removal, sampling). _`lib/anz/whs-gate.ts`, `.../hazards/route.ts`, `SketchSelectionPanel.tsx`._

### §5.4 NCC references

Reinstatement items carry the current-edition NCC reference; **edition is configurable**
(not hardcoded) so it rolls forward. _`lib/anz/ncc.ts`, `ncc-edition.ts`._

### §5.5 Insurance context (AU private / NZ NHCover)

Jurisdiction toggle AU/NZ. NZ routes damage cause → NHCover vs private insurer (Natural
Hazards Insurance Act 2023: building cap NZ$300,000+GST, flat $500 excess, storm/flood =
land only). Pathway persisted per sketch. _`lib/nz/nhcover.ts`,
`.../insurance-context/route.ts`, `SketchSelectionPanel.tsx`._

## §6 Data model & persistence

### §6.4 Provenance & sketch elements

On save the Fabric blob is decomposed into `SketchElement` rows with `provenance ∈
{ operator_measured, underlay_reference }` (default `operator_measured`). Phase-1 manual
draws are all `operator_measured`. _`lib/sketch/decompose-elements.ts`,
`app/api/inspections/[id]/sketches/route.ts`._

## §7 Property enrichment

Property metadata behind a provider interface (`PropertyEnrichmentProvider`): Apify/
OnTheHouse scraper now, official Domain API in parallel (BYOK). _`lib/property/provider.ts`,
`providers/onthehouse.ts`, `app/api/property/parse/route.ts`._

### §7.1 Error semantics

Routes return the `apiError` envelope; no `error.message` leaked in 500s; auth via
`getServerSession` + `assertInspectionTenancy` (401/403/404-unified).

## §8 IP & accuracy firewall

### §8.1 Underlay provenance — measured-quantity firewall

**Only `operator_measured` geometry may feed S500 drying/scope calcs and exports.**
`underlay_reference` geometry (from an imported plan) is orientation-only and **must never
contribute measured quantities** — both an accuracy and an IP requirement. Imported plans
are additionally watermarked and never exported. _`lib/sketch/measured-elements.ts:measuredElements`;
governed by `au-ip-opinion-brief.md` + `existing-plan-import-implementation-plan.md`._

### §8.3 S500 equipment ratios

Drying-equipment recommendation derived from S500 §8.3 ratios feeds the scope contract,
narrative, and PDF. _`lib/sketch/iicrc-utils.ts` (recommendedEquipment), scope contract._

## §9 Exports — structured scope contract

Versioned machine-readable scope (`schemaVersion "1.0"`) is the twin of the PDF, built
from the same `buildComplianceAnnex` + `extractRooms` source to prevent drift; deterministic
Markdown narrative built from the same contract. _`lib/export/scope-contract.ts`,
`scope-narrative.ts`._ Insurer-export format remains unresolved (PDF scope only for Phase 1).

## §11 PDF scope export (Phase-1 DoD)

A4-landscape branded PDF: rooms + dimensions + materials + water category + S500 drying-log
table + WHS hazard flags + NCC references + (NZ) NHCover routing block. All user text passes
the WinAnsi `safe()` sanitiser (#1264). _`lib/generate-sketch-pdf.ts`, `lib/sketch/pdf-scope.ts`,
`app/api/inspections/[id]/sketches/pdf/route.ts`._

## §12 Data model (Prisma)

Canonical schema (T1.1). `ClaimSketch` holds the authoritative Fabric blob + `country`,
`captureAdapter`, `totalFloorAreaM2`. Normalized rows derived on save:

- **`SketchElement`** — `type (wall|opening|room|fixture)`, `geometryJson`, `dimensionsM`,
  `materialId?`, `provenance` (§6.4/§8.1).
- **`Material`** — ANZ catalogue, `region`, `dryStandardMc`, `isPotentialAcm` (§5.1).
- **`SketchMoistureReading`** — `materialId`, `waterCategory (cat1|cat2|cat3)`, `targetMc`,
  `currentMc`, `dryStandardMet`, `readingDatetime` (§5.2). Distinct from the evidence-class
  `MoistureReading` model — naming collision is intentional and kept separate.
- **`Hazard`** — `type`, `status`, `whsPathwayNote` (§5.3).
- **`InsuranceContext`** — `pathway` per sketch (§5.5).

_`prisma/schema.prisma`; cited by `lib/anz/materials.ts`, `lib/anz/water-category.ts`._

---

_Sections not listed here (e.g. §3, §10) appear only in discovery/brainstorm
artifacts under `docs/discovery/` and `docs/superpowers/`, not in shipped code, and are
out of scope for this canonical reconstruction._
