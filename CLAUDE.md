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
No new env vars added for V2. Existing vars used:
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase Storage
- `DATABASE_URL` — Prisma (for PropertyLookup + ClaimSketch caching)

---

## V2 Milestone Status (as of 2026-03-29)
| Milestone | Status |
|-----------|--------|
| M1: Foundation | Partial (RA-88 ✓, RA-89 ✓, RA-91 ✓, RA-92 ✓; RA-90 pending) |
| M2: Core Sketch Tool | Complete (RA-93–RA-101 ✓) |
| M3: Property Data Scraper | Mostly complete (RA-102–RA-105 ✓; RA-108 pending) |
| M4: Moisture Mapping | Complete (RA-110–RA-113 ✓) |
| M5: Equipment Placement | Complete (integrated into M4) |
| M6: Reporting & Export | In progress (RA-120–RA-126 pending) |
