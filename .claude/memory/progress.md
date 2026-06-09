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

### Next (toward all-green + merge to main)

- Wire `decomposeElements` into `app/api/inspections/[id]/sketches/route.ts` POST (write
  SketchElement rows on save) + materials/hazard/moisture API routes (apiError envelope);
  unit-test with mocked prisma (repo convention).
- Wire materials picker + drying status (S500) + WHS asbestos gate into
  `SketchSelectionPanel.tsx`; verify in preview against prod.
- Extend `lib/generate-sketch-pdf.ts` (materials, water category, drying log, WHS, NCC).
- Pre-merge: full `npx vitest run`, `tsc`, no-stub clean → PR to `main`.
