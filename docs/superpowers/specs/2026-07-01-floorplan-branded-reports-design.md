# Design — Floorplan completion + fully-branded reports

> 2026-07-01 · grounded by 2 read-only audits (floorplan completeness; report floorplan/photo/branding/layout).
> Goal (Phill): "Ensure the floorplan is complete, full build with all features; ensure final reports include the
> floor plan, the images, full company branding, clean and easily readable."

## Current state (audited)
**Floorplan-underlay** — works: address→floorplan scrape (`/api/properties/scrape`, OnTheHouse + Domain
fallback, cache, circuit-breaker, rate-limit), apply to Fabric canvas with opacity slider, **per-floor**
`backgroundImageUrl` persisted, calibration, auto-fetch workspace toggle. Gaps:
- Opacity stored in React state only — resets to 0.35 on reload (`ClaimSketch` has no opacity field). **Data loss.**
- Manual upload is a base64 data-URL (no validation, no server storage → DB bloat).
- No underlay reposition/scale/rotation controls.
- **Underlay is a Fabric `backgroundImage` and is NOT in the canvas PNG export** → exported/embedded sketch loses it.
- No subscription/entitlement gate (free to all today).

**Reports** — generators: IICRC (`/api/reports/[id]/pdf`, 9/10 layout, S500-structured, has a `theme` param but
the route never passes it), Forensic (9/10, hardcoded colours), Enhanced (hardcoded "RestoreAssist"), and the
**default client download** (`/api/reports/[id]/download`, 6/10 ad-hoc). `generate-sketch-pdf.ts` has
`embedSketchesInPdf()` — **never called by any report**. Gaps:
- No report embeds the floorplan/sketch.
- No report embeds photos (zero support).
- Per-org branding not activated; `resolveClientBrandTheme` exists (`lib/clients/brand.ts`) but is unused by the route.
- The default client report is the weakest layout.

## Approach
Reuse existing infrastructure; don't rebuild. Make the **IICRC report the canonical client report** (already the
best layout + branding-ready), add a **shared image-embed layer** for sketch + photos, and **persist + export**
the underlay so it flows into the report. Gate the floorplan capability behind an org **entitlement** (default:
included in Premium) with an upgrade CTA.

## Build sequence (each = its own tested PR, off main, no merge — rule 18)

### PR1 — Branded reports foundation
- Wire `resolveClientBrandTheme(org/client)` into `/api/reports/[id]/pdf` → pass `theme` (logo, primaryColor,
  business name/ABN/contact) into `generateIICRCReportPDF`. Select the brand fields in the route query.
- Parameterise the hardcoded colours/"RestoreAssist" in Forensic + Enhanced + Sketch PDFs to accept the same
  `theme`/`businessInfo` (fallback to RestoreAssist when absent).
- Make the client-facing download use the IICRC (clean) report.
- Tests: PDF smoke asserts logo bytes embedded + business name in header + non-default colour when theme supplied.

### PR2 — Floorplan in the report  — BUILT (feat/branded-reports-pr2-2026-07-01)
**Premise correction (verified 2026-07-01):** the earlier audit claimed the Fabric `backgroundImage`
(underlay) is excluded from `canvas.toDataURL()`. That is **wrong** for Fabric v7 — `toDataURL` renders
background → objects → overlay into the bitmap, so the underlay IS already in the export. Proof: the
shipping `POST /api/inspections/[id]/sketches/pdf` route already builds standalone floor-plan PDFs from
that exact `toDataURL` output; if the underlay were dropped, those PDFs would be blank floor plans.
→ No client-side raster compositing was needed. The real gaps were *persisting* the composited PNG and
*embedding* it in the canonical report.

Implemented:
- Schema `ClaimSketch.renderedPngUrl String?` (migration `20260701000000_claimsketch_rendered_png`).
- Client (`SketchEditorV2.performSave`): on **flush** saves only (floor switch / PDF export / scope gen),
  rasterise each floor via `toDataURL({format:'png',multiplier:2})` and upload through
  `uploadRenderedSketch()` (stable `exports/floor-{n}.png` path → overwrite, no churn). Best-effort —
  never blocks the authoritative `sketchData` save.
- Save route `POST /api/inspections/[id]/sketches`: persists `renderedPngUrl`.
- `lib/reports/claim-sketch-floors.ts`: maps stored sketches → `SketchFloor[]` (filter renderedPngUrl,
  sort by floor, fetch URL→data-URL; a failed fetch skips that floor, never fails the report).
- `lib/reports/append-sketch-pages.ts`: re-opens the IICRC report bytes and calls `embedSketchesInPdf()`.
- Report route `GET /api/reports/[id]/pdf`: fetches `inspection.claimSketches`, appends a page per floor.
- Tests (TDD, 11 new cases): floor mapping, real-PDF page-append, end-to-end route page-count growth,
  save-route persistence, stable upload path. tsc clean on touched files; standards + no-verbatim green.

Deferred to PR4 (not blocking the report): the **freshness edge** — a user who draws but never triggers a
flush before downloading the report gets the last flushed render. Options: render on a throttled autosave,
or a Supabase CDN cache-bust (`?v=updatedAt`) if overwrite staleness is observed.

### PR3 — Photos in the report  — BUILT (feat/branded-reports-pr3-2026-07-01)
Same post-process pattern as PR2 (pure mapper + pdf-lib appender, wired into the report route):
- `lib/reports/inspection-photos-to-images.ts`: maps `InspectionPhoto` rows → `{bytes,isPng,caption}`.
  **Prefers `thumbnailUrl`** over `url` so embedded bytes stay bounded (bloat control without server resize);
  sniffs PNG vs JPG from the bytes (robust to stale `mimeType`); caption = description → location → roomType;
  a no-url / failed-fetch photo is skipped (never fails the report).
- `lib/reports/append-photo-pages.ts`: A4 2×3 captioned grid, `embedPng`/`embedJpg`, paginates (6/page); a
  single un-decodable image is skipped, not fatal; no photos → original bytes unchanged.
- Report route: selects `inspection.photos` (ordered by timestamp) and appends the grid after the sketch pages.
- Tests (TDD, 10 cases): mapper (fetch/thumbnail-pref/caption/format-sniff/skip), real-PDF grid pagination
  (incl. JPG path + corrupt-skip), end-to-end route page growth. tsc clean; standards + no-verbatim + lint green.

### PR4 — Floorplan feature completeness  — BUILT (feat/floorplan-completeness-pr4-2026-07-01)
Scoped to the two highest-value, fully-testable items (the data-loss fix + upload safety):
- **Opacity persistence (fixes the data-loss bug):** `ClaimSketch.backgroundImageOpacity Float?`
  (migration `20260701000100_…`); POST `/sketches` persists it **clamped 0..1**; GET already returns it
  (include returns all scalars); `SketchEditorV2` sends `fd.backgroundOpacity` on save and **restores**
  `s.backgroundImageOpacity ?? 0.35` on hydrate (was hardcoded `0.35` → reset every reload).
- **Upload validation:** pure `lib/sketch/validate-underlay-upload.ts` (allow-list png/jpeg/webp + 10 MB cap),
  wired into `FloorPlanUnderlayLoader.handleFileUpload` (rejects with a message) + `accept` tightened.
- Tests (TDD, 8 cases): opacity persist + clamp + omit; validator allow-list/size/boundary.
  tsc clean; standards + no-verbatim green; lint clean (one pre-existing unrelated img warning left as-is).

**Deferred to a PR4b follow-up** (separable, UI-heavy / lower-risk-to-leave; noted, not silently dropped):
- Base64 → Supabase **server-side storage** of manual uploads (the `uploadFloorPlanUnderlay` helper exists;
  needs an async upload-on-apply path + handling). Validation (above) already gates the input.
- Underlay **reposition/scale (+ lock-aspect) controls** (pure Fabric/React UI).
- The PR2 **freshness edge** (draw-without-flush serves last flushed render) — fold in with the upload-on-apply work.

### PR5 — Upgrade gating
- `hasFloorPlanUnderlay(org)` entitlement (plan tier, extensible to add-on); gate `/api/properties/scrape`
  (server) + the `FloorPlanUnderlayLoader` panel (client → "Upgrade to unlock" CTA → existing billing checkout).
- Tests: unentitled → 402 + CTA; entitled → works.

## Cross-cutting
- **Branding source of truth:** `Organization` brand fields (logo, colours, business name/ABN/contact) +
  `resolveClientBrandTheme`; one `theme`/`businessInfo` shape shared by all generators.
- **Copyright note (owner decision):** floorplans scraped from listings are typically copyrighted; once this is
  a paid feature, prefer the **upload path** (firm-owned floorplan) and/or a licensed provider. Flagged, not blocking.
- **Verification per PR:** vitest + `npx tsc --noEmit` (touched) + lint within ratchet + standards gates; PR opened,
  not merged.

## Acceptance (the user's words, made checkable)
- [ ] Final client report is **per-org branded** (logo, colours, business name/ABN/contact) — not "RestoreAssist".
- [ ] Final report **embeds the floor plan** (sketch + underlay), one per floor.
- [ ] Final report **embeds the photos** (captioned grid).
- [ ] Report layout is the clean IICRC structure (9/10), not the ad-hoc 6/10 one.
- [ ] Floorplan feature: opacity persists, uploads validated + server-stored, underlay in export, controls present.
- [ ] Floorplan capability gated behind an upgrade with an unlock CTA.
