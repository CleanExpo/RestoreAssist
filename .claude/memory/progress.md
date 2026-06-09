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

### Next (toward all-green + merge to main)

- Wire `SketchEditorV2` to fetch `/api/materials`, pass `materials`/`propertyYearBuilt` to the
  panel, persist material (sketch save) + hazard (hazards route) selections. **Verify the live
  flow on the PR's Vercel preview deployment** (working DB env) rather than waiting on a local
  `DATABASE_URL`; drive via Chrome MCP against the preview URL.
- Add S500 drying status to the moisture layer/panel; extend `lib/generate-sketch-pdf.ts`
  (materials / water category / drying log / WHS / NCC).
- Pre-merge each batch: full `npx vitest run` + `tsc` + no-stub clean → PR to `main`.
