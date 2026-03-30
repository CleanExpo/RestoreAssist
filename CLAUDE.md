# RestoreAssist V2 — Claude Code Session Protocol

## Project Overview
RestoreAssist V2 adds a Fabric.js-based sketch & property data layer onto the
existing V1 Next.js platform. All V2 code lives in the worktree branch
`claude/inspiring-ardinghelli` and will be merged to `main` via a single PR.

---

## Architecture: Sketch Tool

### Core Components (`components/sketch/`)
| File | Purpose |
|------|---------|
| `SketchCanvas.tsx` | Fabric.js canvas with forwardRef + imperative handle (undo/redo, zoom, pan, tool modes) |
| `SketchToolbar.tsx` | Vertical icon toolbar — 9 tool modes + history + zoom + export |
| `SketchEditor.tsx` | Orchestrator: multi-floor tabs, tool event handlers, auto-save, floor plan underlay |
| `FloorPlanUnderlayLoader.tsx` | Collapsible panel for fetching/uploading a floor plan background image |

### Tool Modes (`ToolMode`)
`select | room | line | freehand | text | arrow | measure | photo | pan`

Keyboard shortcuts: V / R / L / P / T / A / M / C / H

### Fabric.js Notes
- Always `dynamic(() => import("./SketchCanvas"), { ssr: false })` — never import server-side
- Dynamic `import("fabric")` inside `useEffect` for SSR safety
- `canvas.toJSON()` / `canvas.loadFromJSON(data, cb)` for persistence
- Undo/redo: 50-step JSON snapshot stack, keyed per floor canvas
- Background image loaded at configurable opacity (default 0.35)

---

## Architecture: Property Data Scraper

### Scrape API
`POST /api/properties/scrape` — accepts `{ address, postcode?, inspectionId?, url? }`
- Checks `PropertyLookup` cache (90-day TTL) before hitting OnTheHouse
- Returns `ScrapedPropertyData` (beds, baths, land size, floor plan images, gallery images)

### Parser (`lib/property-data-parser.ts`)
Three-tier extraction (priority order):
1. `__NEXT_DATA__` JSON (OnTheHouse is a Next.js site)
2. JSON-LD structured data (Schema.org)
3. HTML text pattern fallback

### Address Autocomplete
`components/forms/AustralianAddressSearch.tsx` — OpenStreetMap Nominatim, 420ms debounce,
returns `ParsedAddress` with suburb / state / postcode auto-fill

---

## Architecture: Moisture Mapping

`components/inspection/MoistureMappingCanvas.tsx`
- SVG-based (not Fabric.js) — lighter weight for read-heavy moisture map
- Modes: `structural | moisture | equipment`
- Per-material IICRC S500 thresholds from `lib/iicrc-dry-standards.ts`
- Equipment placement with IICRC ratios (dehu 1/40m², air mover 1/15m², scrubber 1/100m²)

---

## Database Schema Additions (V2)
```
ClaimSketch      — per-floor Fabric.js JSON state, linked to Inspection
SketchAnnotation — labels/arrows/measurements/photo markers for a sketch
PropertyLookup   — 90-day cache for OnTheHouse scrape results (already existed in V1)
```

Migration file: `prisma/migrations/20260329000000_add_claim_sketches_annotations/migration.sql`

Run before deploy:
```bash
npx prisma migrate deploy
```

---

## Sketch REST API
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/inspections/[id]/sketches` | List all floors + annotations |
| POST | `/api/inspections/[id]/sketches` | Upsert floor by floorNumber |
| PUT | `/api/inspections/[id]/sketches/[sketchId]` | Patch individual sketch |
| DELETE | `/api/inspections/[id]/sketches/[sketchId]` | Remove sketch |

---

## Key Patterns for Agents

### Adding a new tool mode
1. Add to `ToolMode` union in `SketchCanvas.tsx`
2. Add button to `TOOLS` array in `SketchToolbar.tsx`
3. Wire click handler in `SketchEditor.tsx` `useEffect` watching `[toolMode, activeFloor.id]`
4. Return cleanup to remove the handler

### Multi-floor canvas
Each `Floor` has its own `canvasRef: MutableRefObject<FabricCanvasRef | null>`.
Hidden floors use `className="hidden"` — canvas state is preserved.

### Auto-save
2-second debounce → `POST /api/inspections/${id}/sketches` with Fabric.js JSON.
Triggered from `onModified` callback and explicit tool actions.

---

## Environment Variables (V2 Additions)
```bash
# Ascora integration (RA-262)
# NODE_TLS_REJECT_UNAUTHORIZED=0   # Required — Ascora uses non-standard SSL cert
#                                  # Set in .env.local (dev) or Vercel env vars (prod)
#                                  # TODO: supply cert via NODE_EXTRA_CA_CERTS instead
ASCORA_API_KEY=                    # System-level Ascora key — SET IN VERCEL ✓
                                   # Enables /api/ascora/sync without per-user /connect step
                                   # Auto-provisions AscoraIntegration DB record on first sync
ASCORA_BASE_URL=                   # Optional override — defaults to https://api.ascora.com.au
ANTHROPIC_API_KEY=                 # Claude API for scope narrative generation (RA-264) — SET IN VERCEL ✓
```

Existing vars used:
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase Storage
- `DATABASE_URL` — Prisma (for PropertyLookup + ClaimSketch + Ascora caching)
- `NEXTAUTH_URL` — Used to construct webhook URLs for DR-NRPG

---

## V2 Data Layer API (RA-260, RA-262, RA-264, RA-27)

### Equipment Calculator
`POST /api/inspections/[id]/equipment-calculator`
- Calculates IICRC S500 equipment quantities from affected area + damage class/category
- Creates autoDetermined=true ScopeItems with IICRC justifications
- Performs AS/NZS 3012:2019 80% electrical load check

### Scope Narrative Generator
`POST /api/inspections/[id]/generate-scope`
- Streaming Claude API response (SSE text/event-stream)
- Produces 7-section IICRC-cited scope narrative
- Uses prompt caching on system prompt for ~90% token savings on repeat calls

### Drying Goal Validation
`GET|POST|PUT /api/inspections/[id]/drying-goal`
- POST: initialise with target Category/Class
- PUT: evaluate all moisture readings vs IICRC S500 §11.4 EMC targets
- Returns "Drying Goal: ACHIEVED" certificate when all readings ≤ target

### Ascora Integration
`GET|POST|DELETE /api/ascora/connect` — connect API key, verify connectivity
`POST /api/ascora/sync` — full historical import with price uplift factor
  - `?minValueAud=1000` — focus on Private/Larger-Loss scoped jobs
  - `?priceUpliftFactor=1.12` — apply 12% CPI uplift (AU restoration 2025)
  - `?dryRun=true` — analyse without writing to DB
`GET|POST /api/ascora/pricing-database` — query + record acceptance/rejection

### DR-NRPG Integration
`GET|POST|DELETE /api/dr-nrpg/connect` — save credentials, get webhook URL
`POST /api/webhooks/dr-nrpg` — inbound job dispatch events (HMAC verified)
  - Events: job.dispatched, job.updated, job.completed, job.cancelled
  - Auto-creates Inspection on job.dispatched

---

## V2 Milestone Status (as of 2026-03-30)
| Milestone | Status |
|-----------|--------|
| M1: Foundation | Mostly complete (RA-88 ✓, RA-89 ✓, RA-91 ✓, RA-92 ✓; RA-90 code ✓ — Supabase bucket human action pending) |
| M2: Core Sketch Tool | Complete (RA-93–RA-101 ✓) |
| M3: Property Data Scraper | Mostly complete (RA-102–RA-105 ✓; RA-108 ✓) |
| M4: Moisture Mapping | Complete (RA-110–RA-113 ✓) |
| M5: Equipment Placement | Complete (RA-260 integrated) |
| M6: Reporting & Export | Mostly complete (RA-120 ✓, RA-121 ✓, RA-123 ✓, RA-124 ✓, RA-125 ✓; RA-122, RA-126 TBC) |
| M7: AU Data Layer | Mostly complete (RA-260 ✓, RA-262 sync fixed ✓, RA-264 ANTHROPIC_API_KEY set in Vercel ✓; RA-27 ✓) |
| AI Lab (autoresearch) | Complete — PromptVariant/EvaluationRun DB ✓, scope quality evaluator ✓, evaluation harness ✓, prompt optimizer ✓, admin UI ✓ |
| DR-NRPG Integration | Complete — API ✓, webhook ✓, UI ✓ |
| lossDescription | Complete — schema ✓, migration ✓, PATCH endpoint ✓, NIR form ✓ |

### ⚠️ Blocked / Human Actions Required
- **RA-262 live sync**: `ASCORA_API_KEY` now set in Vercel ✓ — still needs `NODE_TLS_REJECT_UNAUTHORIZED=0` set in Vercel env vars to bypass Ascora's self-signed SSL cert, then POST /api/ascora/sync
- **RA-262 line items**: `/invoicedetails` doesn't exist — contact Ascora support for correct line item API endpoint
- **RA-264 live test**: `ANTHROPIC_API_KEY` now set in Vercel ✓ — needs completed inspection with IICRC classification to test SSE stream
- **Migrations**: `npx prisma migrate deploy` (run against prod DB — includes lossDescription, PromptVariant, EvaluationRun, e-signature, moisture map coords)
- **Prisma generate**: Run `npx prisma generate` after migrate deploy to update client types (lossDescription field)
- **RA-90 Supabase bucket**: Create `sketch-media` bucket in Supabase — SQL in `lib/sketch-storage.ts` header
- **RA-4, RA-241, RA-246, RA-247**: Human actions (social accounts, App Store, Supabase, Google)
