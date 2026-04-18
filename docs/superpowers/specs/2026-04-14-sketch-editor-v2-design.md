# Sketch Tool V2 — Design Specification

**Date:** 2026-04-14  
**Author:** Claude (15+ year senior engineer level)  
**Status:** Approved for implementation  
**Approach:** Option B — SketchEditor V2 component redesign  
**Primary target:** Tablet → Phone → Desktop

---

## 1. Context & Goals

RestoreAssist's sketch tool gives water damage restoration technicians a way to draw floor plans, mark damage zones, place moisture readings, and produce insurer-ready documentation on-site. The current V1 implementation is functionally complete but has significant problems:

- The main editor is an 843-line component with tools, save logic, floor management, and drawing all tangled together
- 4 confirmed runtime bugs (silent failures)
- 2 toolbar tools completely unimplemented (line, arrow)
- No functional snap — the grid is a CSS overlay only
- Toolbar buttons are 32px — unusable on a tablet thumb
- Moisture readings exist in the DB schema but are never written to
- Scale is hardcoded at 100px = 1m with no calibration path
- SketchViewer never restores background images from DB

**Goal:** A professional, tablet-first sketch tool that competes with Encircle and exceeds Xactimate's UX on mobile. Technicians should be able to draw a complete moisture-mapped floor plan at a job site in under 5 minutes.

---

## 2. Architecture

### 2.1 What stays unchanged

| File                                                      | Change                                   |
| --------------------------------------------------------- | ---------------------------------------- |
| `components/sketch/SketchCanvas.tsx`                      | 2 targeted bug fixes only                |
| `components/sketch/SketchViewer.tsx`                      | 1 bug fix (background image restoration) |
| `components/sketch/FloorPlanUnderlayLoader.tsx`           | No changes                               |
| All API routes under `app/api/inspections/[id]/sketches/` | 2 targeted fixes                         |

### 2.2 New file structure

```
components/sketch/
├── SketchCanvas.tsx               ← patched
├── SketchViewer.tsx               ← patched
├── FloorPlanUnderlayLoader.tsx    ← unchanged
├── SketchEditorV2.tsx             ← new orchestrator (~200 lines)
├── SketchDockToolbar.tsx          ← new — draggable, touch-first
├── SketchSelectionPanel.tsx       ← new — context-sensitive right drawer
├── SketchFloorTabs.tsx            ← new — safe floor switching
├── SketchMoistureLayer.tsx        ← new — moisture pin placement + IICRC colours
├── SketchScaleModal.tsx           ← new — 2-click scale calibration
├── SketchEditorLegacy.tsx         ← renamed from SketchEditor.tsx (reference copy)
└── index.ts                       ← updated to export SketchEditorV2 as SketchEditor

lib/hooks/sketch/
├── useSketchTools.ts              ← new — tool state machine
├── useSketchSnap.ts               ← new — grid snap + alignment guides + live labels
└── useSketchHistory.ts            ← new — undo/redo with breadcrumb trail
```

### 2.3 Component hierarchy

```
SketchEditorV2
├── SketchFloorTabs              (top — floor tabs, safe-save, PDF export)
├── FloorPlanUnderlayLoader      (collapsible panel — unchanged)
├── [canvas wrapper div]
│   ├── SketchCanvas             (Fabric.js — patched)
│   ├── [React overlay divs]
│   │   ├── dimension label      (W×H pill, appears on drag)
│   │   ├── angle badge          (degrees, appears on rotate)
│   │   └── alignment guides     (rendered as SVG overlay, not Fabric objects)
│   ├── SketchMoistureLayer      (absolute overlay — moisture pins as React nodes)
│   └── SketchSelectionPanel     (right drawer — slides in on object select)
└── SketchDockToolbar            (draggable — defaults to bottom)
    └── SketchScaleModal         (full-screen modal — activated from toolbar)
```

### 2.4 V1 → V2 call-site migration

`app/dashboard/inspections/[id]/page.tsx` imports `<SketchEditor>` — no changes needed. The `index.ts` re-exports `SketchEditorV2` as `SketchEditor`. The legacy component is kept as `SketchEditorLegacy.tsx` for reference during development only.

### 2.5 Data flow

```
Tech draws room polygon
        │
        ▼
useSketchTools ──► Fabric.js polygon
                   (with data: { type:'room', area:14.2, material:'carpet' })
        │
        ▼
canvas.toJSON(['data']) ──► scheduleSave()
                        ──► POST /api/inspections/[id]/sketches
                            { sketchData, backgroundImageUrl, floorNumber, floorLabel }
        │
useSketchSnap ──► object:moving ──► grid snap (left/top round to 0.25m)
                              └──► SVG alignment guide overlay (React)
                              └──► dimension label overlay (React div)

Tech taps moisture tool + taps canvas
        │
        ▼
SketchMoistureLayer ──► local pins[] state
                    ──► POST /api/inspections/[id]/sketches (moisturePoints array)
```

---

## 3. Bug Fixes (SketchCanvas.tsx)

### 3.1 PencilBrush not instantiated

**Current code:** `canvas.freeDrawingBrush.color = ...` — accesses brush before it exists in Fabric.js v6.  
**Fix:** After canvas creation, add:

```ts
import { PencilBrush } from "fabric";
canvas.freeDrawingBrush = new PencilBrush(canvas);
```

### 3.2 Custom `data` not surviving JSON serialisation

**Current code:** `canvas.toJSON()` — Fabric.js v6 only serialises known properties by default.  
**Fix:** All calls become `canvas.toJSON(['data'])`. The `loadFromJSON` signature is unchanged — the `data` property is automatically re-hydrated on deserialisation once declared in `toJSON`.

### 3.3 `freeDrawingBrush` width/color reset on mode change

When `toolMode === 'freehand'` and the damage type changes, the brush is updated correctly — but the SketchCanvas `useEffect` on toolMode also sets `isDrawingMode`. These two effects must be unified in `useSketchTools` so order is guaranteed.

---

## 4. Bug Fixes (SketchViewer.tsx)

### 4.1 Background image never restored

**Current code:** Fetches `sketchData` only. The `backgroundImageUrl` column on `ClaimSketch` is never queried.  
**Fix:** The GET `/api/inspections/[id]/sketches` route must include `backgroundImageUrl` in the SELECT. `SketchViewer` passes it to `SketchCanvas` as `backgroundImageUrl` prop after load.

---

## 5. Bug Fixes (API Routes)

### 5.1 PDF route doesn't embed background image

**File:** `app/api/inspections/[id]/sketches/pdf/route.ts`  
**Fix:** When building the PDF, if `backgroundImageUrl` is a data URL, embed it as the first image layer before the canvas PNG. If it's an external URL, fetch it server-side and embed as a buffer.

### 5.2 moisturePoints never read

**File:** `app/api/inspections/[id]/sketches/route.ts`  
**Fix:** The GET handler must return `moisturePoints` alongside `sketchData`. `SketchMoistureLayer` reads it on mount to restore pins.

### 5.3 sketches route must return backgroundImageUrl

Add `backgroundImageUrl: true` to the `select` clause in the GET handler.

---

## 6. SketchDockToolbar

### 6.1 Dock position state

```ts
type DockPosition =
  | "bottom"
  | "top"
  | "left"
  | "right"
  | { x: number; y: number };
```

Default: `'bottom'`. Persisted to `localStorage` under key `ra-sketch-dock-${inspectionId}`.

### 6.2 Drag behaviour

- The toolbar has a drag handle (6-dot grip icon, `cursor: grab`)
- Long-press (300ms) on the handle enters drag mode
- On pointer release: if within 60px of any edge → snap to that edge; otherwise → float at `{ x, y }`
- When docked to `left` or `right`, toolbar renders vertically (same as V1 but touchable)
- When docked to `bottom` or `top`, toolbar renders horizontally in two rows

### 6.3 Touch target sizing

| Breakpoint              | Button size | Icon size |
| ----------------------- | ----------- | --------- |
| `< 768px` (phone)       | 52 × 52px   | 22px      |
| `768px–1024px` (tablet) | 56 × 56px   | 24px      |
| `> 1024px` (desktop)    | 36 × 36px   | 16px      |

Implemented via Tailwind responsive classes: `w-13 h-13 md:w-14 md:h-14 lg:w-9 lg:h-9`.

### 6.4 Tool groups

**Group 1 — Drawing**
`Select (V)` · `Room (R)` · `Wall (W)` · `Freehand (P)` · `Moisture (N)`

**Group 2 — Annotation**
`Text (T)` · `Arrow (A)` · `Measure (M)` · `Photo (C)` · `Pan (H)`

**Group 3 — Canvas**
`Undo (Ctrl+Z)` · `Redo (Ctrl+Y)` · `Grid (G)` · `Scale (S)`

**Group 4 — Export**
`Export PNG` · `⋮ More` (overflow menu: Clear Canvas, Export PDF, Keyboard Shortcuts)

### 6.5 Phone collapse

On `< 768px`, only Group 1 tools render inline. Tap `⋮` to open a full-screen bottom sheet with all tools in a 4-column grid. Selected tool is shown with its name in the toolbar strip so the tech always knows what mode they're in.

### 6.6 Active tool feedback

Active tool: `bg-cyan-500 text-white shadow-md`. On touch: `active:scale-95` with 80ms transition. No hover states (`@media (hover: none)` removes all `hover:` styles globally for touch devices).

---

## 7. useSketchTools (Tool State Machine)

### 7.1 State

```ts
interface SketchToolState {
  mode: ToolMode;
  roomColor: RoomColor;
  damageType: DamageTypeId;
  wallPoints: Point[];
  measurePoints: Point[];
  scaleConfig: { pxPerMetre: number; calibrated: boolean };
  isCloseable: boolean; // room/wall cursor near start point
  previewLineEnd: Point | null;
}
```

### 7.2 Tool implementations

**Room tool**

- Click → push to `wallPoints[]`, add dot marker on canvas
- `mouse:move` → update `previewLineEnd`, replace preview line via `.set()` not recreate
- When `wallPoints.length >= 3` and cursor within 22px of `wallPoints[0]`: `isCloseable = true` → first dot pulses green ring (CSS animation class `animate-pulse-ring` on the dot)
- Click on close → create `fabric.Polygon`, clear temp objects and `wallPoints`, auto-label with area
- Escape → cancel, remove all temp objects

**Wall/Line tool (previously unimplemented)**

- Same click-to-add-point flow as room but creates `fabric.Polyline` (open path, no fill)
- Double-click or `Enter` → commit
- Escape → cancel
- `data: { type: 'wall', strokeWidth: 3 }`

**Arrow tool (previously unimplemented)**

- `mouse:down` → record start
- `mouse:move` → live preview SVG path
- `mouse:up` → commit `fabric.Path` with arrowhead
- SVG: `M ${x1} ${y1} L ${x2} ${y2}` + arrowhead triangle at end point
- `data: { type: 'arrow' }`

**Measure tool**

- 2-click workflow unchanged but uses `scaleConfig.pxPerMetre` dynamically
- Label shows `{metres}m` at midpoint
- If `!scaleConfig.calibrated`, show warning toast: "Set scale first for accurate measurements (S)"

**Text tool**

- Click to place new `IText`
- Double-click existing `IText` object → enter edit mode (`canvas.getActiveObject().enterEditing()`)

**Photo tool**

- Places marker with `data: { type: 'photo_marker', evidenceId: null }`
- Selecting the marker in the panel shows "Link to photo" button (future)

**Select tool**

- Alt+drag → duplicate active object (`object.clone()` then add at offset)
- Delete/Backspace → remove selected object(s) with confirmation if multiple

### 7.3 Keyboard shortcuts

Registered on `window` with `{ passive: true }`. Scoped: only fire when `document.activeElement` is `body` or the canvas container — never fire inside text inputs or modals.

---

## 8. useSketchSnap (Snap + Live Feedback)

### 8.1 Grid snap

```ts
canvas.on("object:moving", ({ target }) => {
  if (!gridEnabled) return;
  const snap = scaleConfig.pxPerMetre / 4; // 0.25m increments
  target.set({
    left: Math.round(target.left / snap) * snap,
    top: Math.round(target.top / snap) * snap,
  });
});
```

Grid snap only fires when the grid overlay is visible (same toggle). Snap unit = `pxPerMetre / 4` so it always represents a real-world 0.25m.

### 8.2 Alignment guides

- On `object:moving`: iterate `canvas.getObjects()`, compare `getBoundingRect()` edges and centres
- When alignment found within 8px (adjusted for current zoom): render an SVG `<line>` in the React overlay (`position: absolute; inset: 0; pointer-events: none`)
- SVG is preferred over Fabric objects — zero canvas repaint, runs at 60fps
- Guides: left edge, right edge, top edge, bottom edge, horizontal centre, vertical centre
- Colour: `#ef4444` (red) for edge alignment, `#6366f1` (indigo) for centre alignment
- Removed on `mouse:up` or `selection:cleared`

### 8.3 Live dimension label

- On `object:moving` and `object:scaling`: get `getBoundingRect()` → convert to metres
- Render a React `<div>` absolutely positioned above the bounding rect
- CSS: `bg-neutral-900/80 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none`
- Content: `4.2m × 3.1m`
- Position calculation: `{ top: canvasTop + vrect.top - 28, left: canvasLeft + vrect.left + vrect.width/2 }`
- Disappears on `mouse:up`

### 8.4 Rotation snap

```ts
canvas.on("object:rotating", ({ target }) => {
  const snap = 45;
  const remainder = ((target.angle % snap) + snap) % snap;
  if (remainder < 6 || remainder > snap - 6) {
    target.rotate(Math.round(target.angle / snap) * snap);
  }
});
```

Angle badge (React overlay): shows `45°` while rotating. Same absolute-position pattern as dimension label.

---

## 9. SketchSelectionPanel

### 9.1 Behaviour

Slides in from the right side of the canvas when an object is selected (`canvas.on('selection:created')`). Closes on `selection:cleared` or Escape. Width: 240px on tablet, full-width bottom sheet on phone.

On phone (`< 768px`): renders as a bottom sheet (slides up from bottom, partial height) rather than a side drawer to avoid covering the canvas.

### 9.2 Context-sensitive content

**Room polygon selected:**

- Area: `{area} m²` (calculated from polygon points via shoelace formula, displayed prominently)
- Room type dropdown: Living/Common, Bedroom, Kitchen, Bathroom/WC, Garage/Utility, Damage Zone
- Floor material: Carpet, Timber, Tile, Concrete, Vinyl (dropdown)
- Damage %: 0–100% slider (for estimate line items)
- Calculated: `Affected area: {area × damage%} m²`

**Moisture pin selected:**

- Reading value: numeric input (%)
- Material: same material list
- IICRC class: auto-derived from value + material (shown as coloured badge: Class 1 green, 2 yellow, 3 orange, 4 red)
- Instrument: text field
- Timestamp: auto-filled, editable

**Wall/Line selected:**

- Wall type: Interior, Exterior, Wet Wall
- Material: Plasterboard, Brick, Timber Frame, Concrete

**Arrow / Text selected:**

- Colour picker (brand palette)
- Font size (text only)
- Bring forward / Send back z-order

**Nothing selected (canvas properties):**

- Scale indicator: `1px = {1000/pxPerMetre}mm` or "Not calibrated"
- Grid: toggle + size selector (0.25m / 0.5m / 1.0m)
- Floor label: editable text field

### 9.3 Data persistence

All panel changes call `object.set({ data: { ...object.data, material: 'carpet' } })` then `scheduleSave()`. The `['data']` extra-prop fix ensures this survives serialisation.

---

## 10. SketchMoistureLayer

### 10.1 Data model

```ts
interface MoisturePin {
  id: string;
  x: number; // canvas coordinates
  y: number;
  value: number; // moisture % reading
  material: string; // 'timber' | 'plasterboard' | 'concrete' | 'carpet' | 'vinyl'
  iicrcClass: 1 | 2 | 3 | 4; // derived
  instrument?: string;
  readingAt: string; // ISO timestamp
}
```

IICRC class derivation (from S500:2021):

- Class 1: value < 16% on timber / < 1% on plasterboard
- Class 2: value 16–25% on timber / 1–5% on plasterboard
- Class 3: value 25–28% on timber / 5–25% on plasterboard
- Class 4: value > 28% on timber / > 25% on plasterboard (specialty drying)

### 10.2 Rendering

Moisture pins render as React DOM nodes absolutely positioned over the canvas (not Fabric objects). This allows:

- React state-driven re-renders without canvas repaints
- CSS animations on the pin (pulsing ring for Class 3/4)
- Tap-to-select opens `SketchSelectionPanel` in moisture-pin mode

Pin appearance:

```
●  — 24px circle
    Class 1: bg-emerald-500   (green)
    Class 2: bg-amber-400     (yellow)
    Class 3: bg-orange-500    (orange, pulses)
    Class 4: bg-rose-600      (red, pulses)

    Inner text: reading value (e.g. "18%") in white, 10px
```

### 10.3 Placement flow

1. Tech taps `Moisture (N)` tool
2. Canvas shows crosshair cursor, pins are tappable
3. Tech taps canvas → a new pin drops at that location with default value 0%
4. `SketchSelectionPanel` immediately opens for that pin to enter the reading
5. On panel close → pin saves to `moisturePoints[]` → `scheduleSave()`

### 10.4 Persistence

On save, `moisturePoints` is serialised as a JSON array and POSTed alongside `sketchData`. On load, the GET route returns `moisturePoints` and `SketchMoistureLayer` re-renders pins.

### 10.5 Moisture summary

A collapsible "Moisture Summary" section at the bottom of `SketchSelectionPanel` (when nothing is selected) shows:

- Total pins placed
- Highest reading
- Count by IICRC class
- "View full moisture log" link

---

## 11. SketchScaleModal (Scale Calibration)

### 11.1 Calibration workflow

1. Tech taps `Scale (S)` in toolbar
2. Full-screen overlay: "Tap two points on the floor plan that you know the distance between"
3. Tech taps point A → green dot placed
4. Tech taps point B → green dot placed, a line drawn between them
5. Numeric input appears: "What is the real-world distance? \_\_\_\_m"
6. Tech enters value → `pxPerMetre = pixelDistance / enteredMetres`
7. "Apply" → modal closes, `scaleConfig.calibrated = true`, toolbar shows `1px = {mm}mm`
8. All measurements on canvas recalculate immediately

### 11.2 Storage

`scaleConfig` is stored as a top-level property on the `sketchData` JSON object — no Prisma migration required. Written as `{ ...canvas.toJSON(['data']), scaleConfig }` when saving. On load, extracted from the parsed `sketchData` before calling `canvas.loadFromJSON`.

### 11.3 Visual indicator

When calibrated, a small scale bar appears in the bottom-right of the canvas: `[────] 1m` — a horizontal line with end ticks showing the current pixel-to-metre ratio. Tapping it re-opens the calibration modal.

---

## 12. SketchFloorTabs

### 12.1 Safe floor switching

**Current bug:** Switching floors immediately with a pending 2s debounce can lose work.  
**Fix:** On floor tab tap, if `pendingSave === true`, await an immediate (non-debounced) save before changing `activeFloorIdx`. Show a 200ms "Saving…" indicator on the tab.

```ts
const switchFloor = async (idx: number) => {
  if (pendingSave) await flushSave(); // immediate save, bypasses debounce
  setActiveFloorIdx(idx);
};
```

### 12.2 Floor rename

Double-tap a floor tab → inline text input replaces the label. Enter/blur → save. Floor label saved to `floorLabel` on `ClaimSketch`.

### 12.3 Floor reorder

Long-press a tab → drag to reorder (React DnD or simple swap buttons `←`/`→`). `floorNumber` values rewritten on reorder.

---

## 13. SketchViewer — Background Image Restoration

### 13.1 API change

`GET /api/inspections/[id]/sketches` adds `backgroundImageUrl` to the select clause.

### 13.2 SketchViewer change

After loading `sketchData` into canvas, if `floor.backgroundImageUrl` is set, set `canvas.backgroundImage` via `FabricImage.fromURL` (same pattern as `SketchCanvas.tsx` update effect). The homeowner view shows the floor plan underlay with opacity 0.25 (lighter than editing mode).

---

## 14. useSketchHistory (Undo/Redo with Breadcrumbs)

The existing undo/redo in `SketchCanvas.tsx` works correctly. This hook adds a breadcrumb trail to the UI:

```ts
interface HistoryEntry {
  description: string; // "Added room", "Moved wall", "Placed moisture pin"
  timestamp: number;
}
```

Each action that triggers `saveState()` also pushes a `HistoryEntry`. The last 3 entries show as a subtle breadcrumb strip below the toolbar: `Add room → Move wall → Place pin` with the most recent on the right. Clicking an entry undoes back to that point.

Action descriptions are generated from the Fabric.js event and active tool: `object:added` + `mode === 'room'` → `"Added room"`.

---

## 15. PDF Route Enhancement

**File:** `app/api/inspections/[id]/sketches/pdf/route.ts`

Add to PDF generation:

1. Fetch `backgroundImageUrl` from `ClaimSketch` — if set, embed as first layer (behind canvas PNG)
2. Add a **Moisture Log table** page: columns = Room, Location, Reading, Material, IICRC Class, Timestamp
3. Add a **Scale bar** in the PDF footer matching the `scaleConfig`
4. Page layout: Floor Plan (full width, 60% page height) + Moisture log table (remaining 40%)

---

## 16. Room Area Auto-Label

When a room polygon is closed in `useSketchTools`:

1. Calculate area via shoelace formula (already exists in `sketch-estimate-extractor.ts` — extract to shared util)
2. Store on the polygon: `polygon.set({ data: { ...data, area: calculatedArea } })`
3. Place a `fabric.IText` at the polygon centroid: `{room label}\n{area.toFixed(1)} m²`
4. Group polygon + label: `new fabric.Group([polygon, label], { subTargetCheck: true })`
5. Tapping the group selects it; tapping the label specifically enters edit mode (`subTargetCheck: true`)

---

## 17. Sketch ↔ Affected Areas Integration

After save, if the sketch has closed room polygons with `data.type === 'room'`:

- Call `PATCH /api/inspections/[id]/affected-areas` (or create if not exists) with room name + area in m²
- This is fire-and-forget (non-blocking)
- The affected-areas view shows a "From sketch" badge on synced entries

This closes the disconnect identified in the audit where room polygons and affected-areas live in separate silos.

---

## 18. Implementation Sequencing

**Phase 1 — Fix the broken (unblock everything else)**

1. `SketchCanvas.tsx`: PencilBrush instantiation + `toJSON(['data'])`
2. Sketch GET API: add `backgroundImageUrl` + `moisturePoints` to response
3. `SketchViewer.tsx`: restore background image from DB
4. `SketchFloorTabs.tsx`: safe floor switch (flush save before switch)

**Phase 2 — UI/UX redesign (biggest impact)** 5. `SketchDockToolbar.tsx`: touch-first, draggable, bottom-default 6. `useSketchSnap.ts`: grid snap + alignment guides + live dimension label + rotation snap 7. `SketchSelectionPanel.tsx`: context-sensitive right drawer / bottom sheet 8. Room polygon close indicator (pulsing ring on first point) 9. `useSketchHistory.ts`: breadcrumb trail

**Phase 3 — Core missing features** 10. `useSketchTools.ts`: tool state machine (wall tool + arrow tool implemented) 11. `SketchMoistureLayer.tsx`: moisture pin placement + IICRC class colour coding 12. `SketchScaleModal.tsx`: scale calibration (Prisma migration required) 13. Room area auto-label (shoelace + centroid + Group) 14. `SketchEditorV2.tsx`: orchestrator wiring everything together

**Phase 4 — Integration & polish** 15. PDF route: embed background + moisture log table + scale bar 16. Sketch → affected-areas sync 17. `SketchViewer.tsx`: background image + moisture pin display in read-only mode 18. Alt+drag duplicate in select tool 19. Double-click to edit existing text labels

---

## 19. Prisma Schema Changes

No migrations required. `scaleConfig` is stored within the existing `sketchData Json?` column. All other new data (`moisturePoints` already exists on the model) uses existing columns.

---

## 20. Testing Strategy

Unit tests (`vitest`):

- `useSketchTools`: test each tool mode state transition
- IICRC class derivation function
- Shoelace area calculation
- Scale calibration pixel-to-metre conversion

E2E tests (`playwright`):

- Draw a room polygon, verify area label appears
- Place moisture pin, verify it persists after reload
- Switch floors safely (verify no data loss)
- Export PNG from editor

---

## 21. Acceptance Criteria

A technician should be able to:

1. Open a job on a tablet, have the floor plan underlay auto-load within 3 seconds
2. Draw a 4-room floor plan in under 3 minutes using the room tool
3. Place moisture readings on every room without leaving the sketch view
4. See IICRC class colour coding update in real-time as they enter readings
5. Export a PDF that includes the floor plan + moisture log table
6. Switch floors without losing work
7. Snap walls to the grid for professional-looking results
8. Move the toolbar to whichever side suits their grip
