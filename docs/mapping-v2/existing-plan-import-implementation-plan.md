# Existing-plan import — implementation plan (pre-build, legally gated)

**Status:** Plan for sign-off. **Hard gate: no build ships until AU IP counsel signs off**
(brief `au-ip-opinion-brief.md`, #1265). Grounds the feature in the real codebase so
execution is instant on approval.

**Researched with:** ultrathink + an opus discovery agent. **Execution model:** Opus 4.8, TDD, one PR per phase, no auto-merge.

**Feature:** ingest an existing floor plan (image/PDF, via the property scraper or a
client upload) as a faded, watermarked **underlay reference** in the sketch editor —
orientation only. The technician re-derives geometry on top; imported shapes are
`underlay_reference` and never feed scope/compliance/PDF.

---

## 0. Critical findings (read first)

1. **Live provenance defect.** The already-shipped AI import
   (`app/api/inspections/[id]/sketches/import-from-image` → `SketchEditorV2.handleImportSketch`)
   creates rooms as `data:{type:"room"}` with **no provenance**, so `decomposeElements`
   defaults them to **`operator_measured`** — imported geometry can silently feed
   S500/scope calcs _today_. This must be resolved (see Decision A — it's a genuine design
   question, not a silent flip).
2. **`spec §8.1` does not exist as a file.** `measured-elements.ts`, `decompose-elements.ts`,
   the IP brief, and the demo runbook all cite "spec §8.1", but there is no
   `docs/mapping-v2/spec.md`. Authoring that section is a plan deliverable.
3. **Apify returns HTML, not files.** `fetchViaApify` yields `{html}`; floor-plan _images_
   come from the parser's `floorPlanImages[]` extracted from that HTML — import depends on
   the source page actually embedding a floor-plan image URL. PDF ingestion needs a new raster step.

---

## 1. Hard legal guardrails (from the IP brief — non-negotiable, all configurable)

- **Gate:** must not ship until AU IP counsel signs off.
- **BYOK only;** Unite-Group never runs/pays for scraping. **Prefer official Domain API;**
  Apify is fallback only — and a flag must allow disabling the scraping fallback for paid use.
- **Underlay is orientation-only:** ~50% faded, **watermarked**, and **NEVER exported** in the deliverable.
- **Only `operator_measured` geometry** feeds scope/compliance/PDF; imports are `underlay_reference`.
- **"Accept as-is"** (use imported geometry directly) is non-default, higher-risk — behind a flag counsel can force off.
- **Pre-use attestation** that the client holds rights + complies with source ToS.
- **Cosmetic variation is NOT a legal safeguard** — rely on independent re-derivation + a provenance log, not on shape-fuzzing.

---

## 2. Decisions for sign-off (recommendation leads each)

| #   | Decision                              | Recommendation                                                                | Why                                                                                                                                                   |
| --- | ------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Provenance of AI/photo-imported rooms | **`underlay_reference`, tech promotes per-room after verifying on site**      | The IP brief requires imports be reference-only; a tech "verifying" an AI guess is not the same as measuring. Promotion makes the human act explicit. |
| B   | PDF ingestion                         | **Rasterize PDF→PNG server-side (pdf-lib/pdfjs), then reuse the Vision path** | Reuses `import-from-image`; no second AI pathway                                                                                                      |
| C   | Scraping fallback default             | **Off by default; Domain API primary; Apify behind a BYOK flag**              | Matches brief; lowest legal exposure                                                                                                                  |
| D   | "Accept as-is" default                | **Off; re-derivation is the default workflow**                                | Brief flags as-is as higher-risk                                                                                                                      |
| E   | Provenance/derivation log             | **Persist an import audit record (source, attestation, timestamp, user)**     | Evidence of independent derivation (brief Q5)                                                                                                         |

**Phase 0 gate:** AU IP counsel sign-off + author `spec §8.1` + Phill confirms A–E. Nothing below starts first.

---

## 3. Build phases (TDD; each = one PR; all gated on §1 + §2)

### Phase 1 — Provenance correctness (the defect)

- Tag Vision/photo-imported rooms `provenance:"underlay_reference"` at creation in
  `handleImportSketch`; thread through `decomposeElements`. Add a per-room **"Verify →
  measured"** promotion action (Decision A).
- **Tests:** imported rooms are excluded from `totalMeasuredFloorAreaM2` until promoted.

### Phase 2 — Reference underlay layer (watermark + never-export)

- Render the underlay watermarked + ~50% faded (extend `handleApplyBackground`); guarantee
  the PDF/scope export **omits** `backgroundImageUrl`. Add an export-exclusion test.

### Phase 3 — PDF ingestion

- Server-side PDF→PNG rasterization, then the existing Vision import. Extend `ALLOWED_TYPES`;
  size/type guards + `safe()` sanitisation on labels.

### Phase 4 — Attestation gate + legal feature flags

- Pre-use attestation modal; feature flags: `IMPORT_EXISTING_PLAN_ENABLED`,
  `IMPORT_SCRAPE_FALLBACK_ENABLED`, `IMPORT_ACCEPT_AS_IS_ENABLED` — all default off,
  config-driven so counsel can toggle without a deploy.

### Phase 5 — Derivation/provenance log

- Persist an import audit record (source URL/upload, attestation, user, timestamp) per Decision E.

### Phase 6 — Legal + security verification

- `opus-adversary`/`curator-security` pass; confirm never-export + provenance firewall hold
  end-to-end; 3-line verification ledger.

---

## 4. Reuse map

| Need                       | Reuse                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Floor-plan image discovery | `lib/property-data-parser.ts` (`floorPlanImages[]`) + `POST /api/properties/scrape` |
| Fetch/upload/opacity UI    | `components/sketch/FloorPlanUnderlayLoader.tsx`                                     |
| Background persistence     | `SketchEditorV2.handleApplyBackground` → `ClaimSketch.backgroundImageUrl`           |
| Image→polygons             | `lib/services/ai/import-sketch-from-image.ts` (claude-sonnet-4-6)                   |
| Provenance firewall        | `lib/sketch/decompose-elements.ts`, `measured-elements.ts`                          |
| Scraper transport (BYOK)   | `lib/scraping/providers/apify.ts` (fallback only)                                   |

## 5. Do-NOT

- Do **not** ship before AU IP counsel sign-off.
- Do **not** let imported geometry default to `operator_measured` (the live defect).
- Do **not** export the underlay in any deliverable.
- Do **not** rely on cosmetic shape variation as a legal safeguard.
- Do **not** make Unite-Group run/pay for scraping — BYOK only.
