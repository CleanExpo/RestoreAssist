# RestoreAssist Mapping V2 — Progress Log

Reporting cadence per `verification-and-evidence-protocol.md`: each session end logs
what was attempted, the evidence (test output + real-data run), and what's blocked.
"Progress" without evidence is not logged as progress.

Plan: `~/.claude/plans/restoreassist-mapping-specification-polished-mochi.md`

---

## 2026-06-09 — Pre-flight + ANZ domain core

### Reconciliation (verified against repo, supersedes the spec's greenfield assumptions)

- Stack is **Prisma + Supabase Postgres** (not raw Supabase JSONB). No `src/` dir.
  Tests are **Vitest** (`npx vitest run`), distributed `__tests__/`.
- **Sketch Editor V2 is already merged to `main`** (Fabric.js v7 canvas, multi-floor,
  moisture pins, scale calibration, PDF export, AI import). `ClaimSketch` /
  `SketchAnnotation` / (evidence-class) `MoistureReading` models exist.
- `feature/restoreassist-v2-sketch` is **1547 commits stale**; **no `develop` branch**.
  Decision: build on isolated worktree branch `claude/amazing-nash-a87632` (even with
  `main`), PR → `main`. Do not resurrect the stale feature branch.
- ANZ domain layer (the moat) and the normalized canonical schema do **not** exist.
- AU property: no Domain API client; working Apify + OnTheHouse scraper exists.
- **IICRC RAG already exists** (`IicrcChunk` model, S500/S520/S700 + pgvector,
  `scripts/ingest-iicrc.ts`) — the S500/NCC engine should query it, not hardcode.

### Decisions locked (Phill)

1. Both tracks in parallel (normalized schema + ANZ layer).
2. Schema A+B: spec-pure `sketch_elements`+provenance now AND keep Fabric blob bridge.
3. Property: Apify/OnTheHouse scraper now, Domain API in parallel.

### Done this session — T2-core: ANZ domain pure logic (no DB)

- `lib/anz/materials.ts`, `water-category.ts`, `dry-standard.ts`, `whs-gate.ts`.
- **Evidence:** `npx vitest run lib/anz/` → 4 files, **25 tests passing** (red→green).
  No-stub check on `lib/anz/` → zero hits. Commit `1538ca80`.

### Done — additional no-DB modules (TDD, green)

- `lib/anz/ncc.ts` + `ncc-edition.ts` (configurable NCC edition, B4) — commit `318577bd`.
- `lib/property/provider.ts` + `providers/onthehouse.ts` (C1 enrichment seam over the
  existing OnTheHouse scraper, fetch injected) — commit `7a4f2675`.
- `lib/anz/class-of-water.ts` (S500 Class 1–4 evaporation load) — commit `70281a9c`.
- **Evidence:** `npx vitest run lib/anz/ lib/property/` → **42 tests passing**. No-stub clean.

### DB path resolved — use the Supabase MCP (main/prod project)

- **Main DB = prod Supabase project `udooysjajglluvuxkijp` ("restoreassist-prod-2026")**;
  sandbox = `oxeiaavuspvpvanzcrjc`. Local `.env.local` creds remain stale (P1000) and the
  prod password isn't retrievable, but **all DB ops go through the connected Supabase MCP**
  (`apply_migration` / `execute_sql`). No worktrees, no local creds needed.

### Done — T1.1 schema migration APPLIED TO PROD + verified (commit `0e0d13ab`)

- Migration `20260609035105_mapping_v2_anz_schema` (additive only) applied via Supabase MCP.
- **Evidence:** inserted + read back one row of each new type on the main DB (country=AU,
  provenance=operator_measured, hazard=asbestos, pathway=au_private, moisture=cat3), then
  deleted — FK cascade verified, zero leftovers. Recorded in `_prisma_migrations`
  (checksum-matched) so `migrate deploy` is idempotent on prod and applies to sandbox.
- **B1 persistence:** 12 ANZ materials seeded to prod (2 ACM), `prisma/seed-anz-materials.ts`
  committed (`43ed9c03`).

### Done — T1.2/T1.3 dual-write + provenance guard (commit `d40a3f6b`)

- `lib/sketch/decompose-elements.ts` (Fabric JSON → SketchElement inputs, px→m, provenance)
  - `lib/sketch/measured-elements.ts` (only operator_measured feeds calcs/exports).
- **Evidence:** full lib suite **67 tests passing**; no-stub clean.

### Done — API wiring (commit `83678daf`)

- `app/api/materials/route.ts` GET (apiError envelope, ?region filter).
- Sketches POST now decomposes the Fabric blob → `SketchElement` rows (slug→id, provenance),
  non-fatal so the blob save stays authoritative.
- **Evidence:** mapping-v2 suite (lib + routes) **81 tests passing** across 13 files; no-stub clean.

### Verification constraint for UI work

- The Next.js dev server / preview uses **Prisma directly (not the Supabase MCP)**, so it needs
  a valid local `DATABASE_URL`. Local creds are stale (P1000) → `/api/materials` etc. 500 in
  preview. **To visually verify the SketchSelectionPanel wiring**, need a working `DATABASE_URL`
  in the worktree `.env.local` (DB ops themselves still go via MCP). Alternative: verify on the
  deployed sandbox after PR. Code + unit tests proceed regardless.

### MERGED to main

- **#1238** (squash `21f91622`): ANZ domain layer + canonical schema + dual-write + materials
  API. Now on `main`. Work continues on branch `feat/mapping-v2-ui-routes` off the new main.

### Done — moisture + hazard routes (PR #1239, open)

- POST `.../sketches/[sketchId]/moisture-readings` (server computes S500 dryStandardMet) and
  `.../hazards` (validates type/status, records pathway). Commits on `feat/mapping-v2-ui-routes`.
- **Evidence:** combined mapping-v2 suite (lib + all routes) **90 passing**; no-stub clean.

- **#1239** merged: moisture-reading + WHS hazard API routes.

### Done — SketchSelectionPanel ANZ controls (PR #1241, open; branch feat/mapping-v2-panel-ui)

- Material picker (`materials` prop from /api/materials) + WHS asbestos gate (blocks strip-out
  on pre-2004 ACM until pathway recorded; reuses `lib/anz/whs-gate`). Backward-compatible props.
- **Evidence:** 5 jsdom/@testing-library component tests red→green; no-stub clean.

### Done — SketchEditorV2 wiring (PR #1242, open; branch feat/mapping-v2-editor-wiring)

- `SketchCanvas` now emits selection (new `onSelect` prop; selection:created/updated/cleared) via
  pure tested `lib/sketch/selected-object.ts` — was unwired, so the panel never appeared before.
- `SketchEditorV2` fetches `/api/materials`, passes `materials`+`onSelect`, persists
  material/whsPathwayNote onto Fabric `data` via scheduleSave (→ SketchElement rows on save).
- **Evidence:** mapper 3 tests red→green; sketch+anz suites **70 passing**; `tsc` clean.
- **Phill Check** (visual, on deploy) in PR #1242: select a room → material dropdown (ANZ names);
  pick Fibro → WHS asbestos block; record pathway → clears; Gyprock → no warning.

### Done — PDF compliance annex (PR #1244, open; branch feat/mapping-v2-drying-pdf)

- `lib/sketch/pdf-scope.ts` (pure, tested): materials-per-element + ACM flags + NCC references
  (configured edition) from the Fabric blob + Material lib.
- `generate-sketch-pdf.ts`: Compliance Annex page (materials / WHS-ACM / NCC); pdf route fetches
  the Material lib. **Realizes the Phase-1 DoD capstone (spec §11).**
- **Evidence:** 4 annex tests red→green; mapping suite **69 passing**; `tsc` clean; no-stub clean.

### Done — S500 drying status on pins + PDF drying log (PR #1245, open)

- `lib/sketch/pin-drying.ts` (pure, tested) + live DRY/NOT-YET-DRY badge in SketchMoistureLayer;
  S500 drying-log section in the PDF compliance annex (pins fetched in pdf route).
- **Evidence:** 7 tests red→green; sketch+anz+components **81 passing**; tsc clean; no-stub clean.

## PHASE 1 FEATURE-COMPLETE (pending #1245 merge)

DoD chain shipped via PRs #1238/#1239/#1241/#1242/#1244/#1245:
draw → ANZ materials → S500 water category → WHS asbestos gate → S500 drying validation →
PDF scope with NCC references. Schema live on prod; ~120 vitest tests; tsc clean throughout.

### Done — NZ NHCover pathway (PR #1248, open; the one ungated Phase-2 item)

- `lib/nz/nhcover.ts` (pure, tested, source-cited NHI Act 2023): cause→cover classifier
  (natural hazards→NHCover building; storm/flood building→private; land→NHCover) + cap
  (NZ$300k+GST) / flat excess ($500/home, max $5k >10 homes) calc.
- Panel AU/NZ toggle + NZ cause→routing badge; editor persists ClaimSketch.country + cause.
- PDF: NZ swaps NCC refs for an NHCover routing block. pdf route reads country.
- **Evidence:** 24 tests red→green; full mapping-v2 suite **126 passing**; tsc + no-stub clean.
- **Open Phill Check:** $500 excess / $300k cap are org-overridable constants — confirm vs
  current NHC schedule before relying on payout figures.

### Done — versioned ANZ scope export contract v1 (PR #1249, open)

- `lib/sketch/extract-rooms.ts` (shared by PDF + export → no drift); `lib/export/scope-contract.ts`
  (pure, tested): `schemaVersion "1.0"` structured twin of the PDF, reusing buildComplianceAnnex.
- `POST /api/inspections/[id]/sketches/scope-export` emits the JSON alongside the PDF.
- OUR contract — no ESX/Xactimate/Cotality. Versioned for stable future carrier binding.
- **Evidence:** 10 tests red→green; **full repo lib/route vitest 1663 passed / 30 skipped**;
  tsc + eslint + no-stub clean.

### Phase 2 — GATED (do NOT start without Phill/Board)

- Apify existing-plan import + $11/mo flag → blocked on **AU IP sign-off** (spec §8.1).
- Insurer export (ESX/Cotality) → **format unresolved** (spec §9 spike).
- RoomPlan LiDAR (Adapter B) → blocked on **iOS/Swift resourcing**.
- NZ pathway (NHCover) → can proceed (pure logic) but is post-RIA Phase 2.

### Superseded note (was: FINAL remaining Phase-1 item)

- S500 drying status on moisture pins: map the moisture layer's `MaterialTypeId` → ANZ dry
  standard, surface dry/not-dry via `lib/anz/dry-standard` in `SketchMoistureLayer`/panel; add a
  drying-log table to the PDF annex. Then **Phase 1 is feature-complete** → post full
  vitest+tsc summary + consolidated Phill Checks.
- Pre-merge: full `npx vitest run` + `tsc` + no-stub clean → PR to `main`.
- Visual acceptance = Phill Check on the deployed app (protocol delegates it to Phill).
