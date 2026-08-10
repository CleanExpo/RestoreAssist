# Encircle-Parity Floor Plan P0/P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship RestoreAssist floor-plan UX that matches Encircle/Hydro *workflow outcomes* (scan→wait→plan-ready, Quick vs Advanced edit, room-cropped moisture for reports) without cloning Encircle UI, branding, colours, layouts, or proprietary wording.

**Status (2026-08-10):** P0 Tasks 1–7 implemented in-repo (not committed). P1 Tasks 8–11 not started.

**Architecture:** Keep the Fabric.js `SketchEditorV2` stack. Add pure lib modules for editor mode, plan lifecycle phase, and room-crop moisture geometry; thin React wiring in dock/overlay/editor; reuse `damage-zone` clip patterns and existing PDF moisture overlay for report usability.

**Tech Stack:** Next.js App Router, React 19, Fabric.js v6, Tailwind, Vitest + Testing Library, existing `lib/sketch/*` helpers.

**Research / constraints:**
- `docs/research/2026-08-09-encircle-parity-next-level.md` — residual gaps (Hydro room-crop, wall-band rematerialize, adjacency snap, L/T, on-canvas dim)
- `docs/research/2026-08-02-floor-plan-sketching-competitive-ux-research.md` §3.4 — scan-first + Quick Editor + Hydro room moisture
- `docs/production-grade-implementation/COMPETITOR_RESEARCH.md` — inspiration only; **no UI/branding/copy clone**
- Spec context: `docs/superpowers/specs/2026-04-14-sketch-editor-v2-design.md`

## Global Constraints

- **No Encircle visual clone** — brand navy dock, RestoreAssist copy, distinct crop-guide colour (not Encircle orange brand cloning).
- **No fake ESX / FML / carrier sync** — do not invent estimate ownership or Xactimate export.
- **Inspiration only** — workflow parity (states, tool depth, room-scoped moisture), not pixel/layout/wording parity.
- **LiDAR / underlay = “scan”** — RestoreAssist does not have Encircle’s video-processing SLA; model `pending | ready | needs_confirm` on RoomPlan ingest + underlay arrival.
- Prefer pure functions in `lib/sketch/` with Vitest; keep Fabric/canvas wiring thin.
- Do not commit unless the user asks.

---

## Goal / Non-Goals

### Goals (P0)
1. **Quick Edit vs Advanced** — Quick: select, label, measure, text (+ pan). Advanced: full dock. Persist preference in `localStorage` when easy.
2. **Scan → waiting → plan-ready** — State machine UX on start overlay / banner so techs are not dropped into full Advanced dock the moment geometry arrives.
3. **Room-crop moisture** — Select room → crop guides → moisture pins + freehand water scoped to room → exportable for report.

### Goals (P1 — after P0)
4. True wall-band openings via `wallSolidSegments` rematerialize.
5. Room adjacency green snap.
6. L / T room templates.
7. On-canvas dimension edit (not panel-only).

### Non-goals
- Visual/branding clone of Encircle or Hydro.
- Fake ESX/FML estimate export.
- Bluetooth laser, full Xactimate CAD depth.
- Replacing RoomPlan/underlay with Encircle-style remote video processing.

---

## File Structure

### Create
| File | Responsibility |
| --- | --- |
| `lib/sketch/editor-mode.ts` | `SketchEditorMode` (`quick` \| `advanced`), allowed tool sets, coerce unsafe tools, localStorage read/write |
| `lib/sketch/__tests__/editor-mode.test.ts` | Unit tests for mode helpers |
| `lib/sketch/plan-lifecycle.ts` | Phase enum + pure `derivePlanLifecyclePhase(...)` from empty/scan/underlay/geometry/confirm signals |
| `lib/sketch/__tests__/plan-lifecycle.test.ts` | Phase derivation tests |
| `lib/sketch/room-moisture-crop.ts` | Room AABB + padded crop rect, pin-in-room filter, water freehand scope metadata helpers |
| `lib/sketch/__tests__/room-moisture-crop.test.ts` | Crop / filter tests |
| `components/sketch/SketchPlanLifecycleBanner.tsx` | Compact banner for waiting / needs-confirm / plan-ready (not a modal clone) |
| `components/sketch/SketchRoomMoistureCrop.tsx` | Overlay guides + “Map moisture in room” entry when a room is selected |

### Modify
| File | Change |
| --- | --- |
| `components/sketch/SketchDockToolbar.tsx` | Accept `editorMode` + `onEditorModeChange`; filter tools; mode toggle |
| `components/sketch/__tests__/SketchDockToolbar.guided.test.tsx` | Extend / add quick-mode assertions (or sibling test file) |
| `components/sketch/SketchStartOverlay.tsx` | Surface lifecycle copy paths (waiting / ready) without Encircle wording |
| `components/sketch/SketchEditorV2.tsx` | Wire mode persistence, lifecycle phase, room-crop moisture session, default Quick after plan-ready |
| `components/sketch/SketchMoistureLayer.tsx` | Optional `clipPolygon` / room bounds — reject pins outside active room when cropping |
| `lib/sketch/export-content-bounds.ts` or `export-sketch-png.ts` | Optional room-scoped crop helper for moisture report PNG |
| `lib/generate-sketch-pdf.ts` / moisture map helpers | Prefer room-crop when `roomMoistureCrop` meta present (lightweight; may be P0.5) |

### Later (P1 only)
| File | Change |
| --- | --- |
| `lib/sketch/opening-geometry.ts` + canvas rematerialize | True wall-band solids from `wallSolidSegments` |
| `lib/hooks/sketch/useSketchSnap.ts` / canvas | Adjacency snap affordance |
| `lib/sketch/room-defaults.ts` + dock | L / T templates |
| `components/sketch/SketchCanvas.tsx` + selection | On-canvas dim edit |

---

## Task Map

| # | Task | Priority | Approx |
|---|---|---|---|
| 1 | `editor-mode` lib + tests | P0-a | 25min |
| 2 | Dock Quick/Advanced UI + persist | P0-a | 35min |
| 3 | `plan-lifecycle` lib + tests | P0-b | 25min |
| 4 | Lifecycle banner + start overlay + EditorV2 wiring | P0-b | 45min |
| 5 | `room-moisture-crop` lib + tests | P0-c | 30min |
| 6 | Room crop overlay + moisture/water scope in editor | P0-c | 60min |
| 7 | Report-usable room crop export hook | P0-c | 40min |
| 8 | P1: wall-band rematerialize | P1 | — |
| 9 | P1: adjacency snap | P1 | — |
| 10 | P1: L/T templates | P1 | — |
| 11 | P1: on-canvas dim edit | P1 | — |
| 12 | Verification checklist | P0/P1 | manual |

---

## P0 Tasks

### Task 1: Editor mode pure module

**Files:**
- Create: `lib/sketch/editor-mode.ts`
- Test: `lib/sketch/__tests__/editor-mode.test.ts`

**Interfaces:**
- Produces: `SketchEditorMode`, `QUICK_EDIT_TOOLS`, `isToolAllowedInMode`, `coerceToolForMode`, `readEditorMode`, `writeEditorMode`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  coerceToolForMode,
  isToolAllowedInMode,
  QUICK_EDIT_TOOLS,
} from "../editor-mode";

describe("editor-mode", () => {
  it("quick mode allows select, text, measure, pan only (plus label alias text)", () => {
    expect(isToolAllowedInMode("select", "quick")).toBe(true);
    expect(isToolAllowedInMode("text", "quick")).toBe(true);
    expect(isToolAllowedInMode("measure", "quick")).toBe(true);
    expect(isToolAllowedInMode("pan", "quick")).toBe(true);
    expect(isToolAllowedInMode("room", "quick")).toBe(false);
    expect(isToolAllowedInMode("door", "quick")).toBe(false);
  });

  it("coerces disallowed tools to select in quick mode", () => {
    expect(coerceToolForMode("room", "quick")).toBe("select");
    expect(coerceToolForMode("measure", "quick")).toBe("measure");
  });

  it("advanced allows full dock set", () => {
    expect(isToolAllowedInMode("room", "advanced")).toBe(true);
    expect(isToolAllowedInMode("moisture", "advanced")).toBe(true);
  });

  it("QUICK_EDIT_TOOLS is a non-empty frozen set", () => {
    expect(QUICK_EDIT_TOOLS.has("select")).toBe(true);
    expect(QUICK_EDIT_TOOLS.has("room")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run lib/sketch/__tests__/editor-mode.test.ts
```

- [ ] **Step 3: Implement `lib/sketch/editor-mode.ts`**

```ts
import type { ToolMode } from "@/components/sketch/SketchCanvas";

export type SketchEditorMode = "quick" | "advanced";

export const EDITOR_MODE_STORAGE_KEY = "ra-sketch-editor-mode";

/** Quick Edit = light correction after plan arrives (Encircle Quick Editor analogue). */
export const QUICK_EDIT_TOOLS: ReadonlySet<ToolMode> = new Set([
  "select",
  "text",
  "measure",
  "pan",
]);

export function isSketchEditorMode(v: unknown): v is SketchEditorMode {
  return v === "quick" || v === "advanced";
}

export function isToolAllowedInMode(
  tool: ToolMode,
  mode: SketchEditorMode,
): boolean {
  if (mode === "advanced") return true;
  return QUICK_EDIT_TOOLS.has(tool);
}

export function coerceToolForMode(
  tool: ToolMode,
  mode: SketchEditorMode,
): ToolMode {
  return isToolAllowedInMode(tool, mode) ? tool : "select";
}

export function readEditorMode(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window !==
  "undefined"
    ? window.localStorage
    : null,
): SketchEditorMode {
  const raw = storage?.getItem(EDITOR_MODE_STORAGE_KEY);
  return isSketchEditorMode(raw) ? raw : "advanced";
}

export function writeEditorMode(
  mode: SketchEditorMode,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof window !==
  "undefined"
    ? window.localStorage
    : null,
): void {
  storage?.setItem(EDITOR_MODE_STORAGE_KEY, mode);
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run lib/sketch/__tests__/editor-mode.test.ts
```

**Acceptance:** Quick tools are exactly select/text/measure/pan; advanced unrestricted; persistence helpers round-trip.

---

### Task 2: Dock mode split + EditorV2 persist

**Files:**
- Modify: `components/sketch/SketchDockToolbar.tsx`
- Modify: `components/sketch/SketchEditorV2.tsx`
- Test: `components/sketch/__tests__/SketchDockToolbar.editor-mode.test.tsx`

**Interfaces:**
- Consumes: `SketchEditorMode`, `isToolAllowedInMode`, `coerceToolForMode`, `readEditorMode`, `writeEditorMode`
- Produces: Dock prop `editorMode` / `onEditorModeChange`; keyboard shortcuts skip disallowed tools

- [ ] **Step 1: Failing dock test**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SketchDockToolbar } from "../SketchDockToolbar";

describe("SketchDockToolbar — Quick vs Advanced", () => {
  it("hides CAD tools in quick mode", () => {
    render(
      <SketchDockToolbar
        toolMode="select"
        onToolChange={vi.fn()}
        editorMode="quick"
        onEditorModeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^Select/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Measure/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Wall/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Door/ })).not.toBeInTheDocument();
  });

  it("toggles to advanced via mode control", async () => {
    const onMode = vi.fn();
    render(
      <SketchDockToolbar
        toolMode="select"
        onToolChange={vi.fn()}
        editorMode="quick"
        onEditorModeChange={onMode}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Advanced draw/i }),
    );
    expect(onMode).toHaveBeenCalledWith("advanced");
  });
});
```

- [ ] **Step 2: Implement dock filtering + mode toggle**
  - Add optional `editorMode?: SketchEditorMode` (default `"advanced"` for back-compat) and `onEditorModeChange?`.
  - Filter `tools` like `guided`, but using `isToolAllowedInMode`.
  - Add a compact toggle: “Quick edit” / “Advanced draw” (RestoreAssist wording — not “Quick Editor”).
  - Keyboard handler: only switch tools allowed in current mode.

- [ ] **Step 3: Wire EditorV2**
  - `useState` + hydrate `readEditorMode()` after mount.
  - On change: `writeEditorMode` + `setToolMode(coerceToolForMode(...))`.
  - When lifecycle enters `plan_ready` and user has never overridden, prefer `quick` (see Task 4).

**Acceptance:** Quick dock shows only light tools; Advanced shows full set; preference survives reload via `localStorage`.

---

### Task 3: Plan lifecycle pure module

**Files:**
- Create: `lib/sketch/plan-lifecycle.ts`
- Test: `lib/sketch/__tests__/plan-lifecycle.test.ts`

**Interfaces:**
- Produces: `PlanLifecyclePhase = "empty" | "scanning" | "waiting" | "needs_confirm" | "plan_ready"`
- Produces: `derivePlanLifecyclePhase(input)`

```ts
export interface PlanLifecycleInput {
  /** User dismissed start chooser or already has content. */
  startDismissed: boolean;
  /** Native scan / RoomPlan capture in flight. */
  scanning: boolean;
  /** Underlay URL present OR non-empty Fabric geometry. */
  hasPlanGeometry: boolean;
  /** Underlay uploaded but no rooms yet — treat as waiting for trace/confirm. */
  hasUnderlayOnly: boolean;
  /** Any room still needs operator confirm (RoomPlan provenance). */
  hasUnconfirmedRooms: boolean;
  /** Explicit user ack that plan is ready for annotate (optional). */
  planReadyAck?: boolean;
}

export function derivePlanLifecyclePhase(
  input: PlanLifecycleInput,
): PlanLifecyclePhase {
  if (input.scanning) return "scanning";
  if (!input.hasPlanGeometry && !input.hasUnderlayOnly) {
    return input.startDismissed ? "waiting" : "empty";
  }
  if (input.hasUnderlayOnly && !input.hasPlanGeometry) return "waiting";
  if (input.hasUnconfirmedRooms && !input.planReadyAck) return "needs_confirm";
  return "plan_ready";
}
```

- [ ] **Step 1: Tests covering empty → scanning → waiting → needs_confirm → plan_ready**
- [ ] **Step 2: Implement module**
- [ ] **Step 3: Vitest PASS**

**Acceptance:** Pure function; no React; covers underlay-only as waiting; unconfirmed RoomPlan rooms → `needs_confirm`.

---

### Task 4: Lifecycle UX wiring (overlay + banner)

**Files:**
- Create: `components/sketch/SketchPlanLifecycleBanner.tsx`
- Modify: `components/sketch/SketchStartOverlay.tsx`
- Modify: `components/sketch/SketchEditorV2.tsx`

**Behaviour:**
1. `empty` — existing `SketchStartOverlay` (scan / underlay / blank / moisture).
2. `scanning` — banner: “Capturing rooms…” (disable Advanced dump).
3. `waiting` — after scan start or underlay import before rooms: banner “Plan arriving / trace underlay…”; keep Quick tools if any; allow moisture.
4. `needs_confirm` — banner “Confirm scanned rooms, then annotate”; default `editorMode` → `quick` unless user previously chose advanced this session.
5. `plan_ready` — dismiss heavy chooser; stay in Quick until user opens Advanced draw.

Do **not** auto-switch to Advanced dock when geometry first appears.

Copy rules: RestoreAssist voice (“Confirm measurements”, “Quick edit”, “Advanced draw”) — not Encircle “Quick Editor” / Hydro product names in UI strings.

- [ ] **Step 1: Banner component with `phase` + optional `onConfirmPlan` / `onOpenAdvanced`**
- [ ] **Step 2: EditorV2 tracks `scanning` around `handleScanRoom`; derives phase from floors + selection provenance**
- [ ] **Step 3: On first transition to `needs_confirm` | `plan_ready`, if mode was never user-set this session, set Quick**

**Acceptance:** Manual — after LiDAR/underlay, tech lands in Quick edit with confirm banner, not full CAD dock.

---

### Task 5: Room moisture crop pure module

**Files:**
- Create: `lib/sketch/room-moisture-crop.ts`
- Test: `lib/sketch/__tests__/room-moisture-crop.test.ts`

**Interfaces:**

```ts
export interface RoomCropRect {
  left: number;
  top: number;
  width: number;
  height: number;
  roomId: string;
  label?: string;
}

export const ROOM_MOISTURE_CROP_PADDING_PX = 24;

export function roomPolygonToCropRect(
  room: { id: string; points: ReadonlyArray<{ x: number; y: number }>; label?: string },
  paddingPx = ROOM_MOISTURE_CROP_PADDING_PX,
): RoomCropRect | null;

export function isPointInRoomCrop(
  x: number,
  y: number,
  roomPoints: ReadonlyArray<{ x: number; y: number }>,
): boolean; // pointInPolygon

export function filterPinsInRoom<T extends { x: number; y: number; nx?: number; ny?: number }>(
  pins: readonly T[],
  roomPoints: ReadonlyArray<{ x: number; y: number }>,
  canvasWidth: number,
  canvasHeight: number,
): T[];

export function roomCropMeta(roomId: string, crop: RoomCropRect): {
  roomId: string;
  crop: RoomCropRect;
};
```

Reuse `pointInPolygon` from `geometry-utils` and pin normalization from `pin-coords` where needed.

- [ ] **Step 1: Failing tests** (AABB padding, pin filter inside/outside)
- [ ] **Step 2: Implement**
- [ ] **Step 3: Vitest PASS**

**Acceptance:** Crop rect pads room AABB; pins outside room filtered; no UI dependency.

---

### Task 6: Room-crop moisture UX

**Files:**
- Create: `components/sketch/SketchRoomMoistureCrop.tsx`
- Modify: `components/sketch/SketchMoistureLayer.tsx`
- Modify: `components/sketch/SketchEditorV2.tsx`
- Modify: `components/sketch/SketchCanvas.tsx` (damage/water freehand already room-clips via `damage-zone` — ensure water kind stays clipped when room crop session active)

**Behaviour:**
1. User selects a room → panel/action “Map moisture in this room”.
2. Enter crop session: draw crop guide rectangle (brand accent / cyan guide — **not** Encircle orange clone) around room AABB.
3. Moisture tool auto-activates; new pins rejected outside room polygon.
4. Freehand water / affected-area remains clipped via existing `findContainingRoom` / clipPath (already shipped).
5. Exit crop returns to Quick edit; crop meta stored on floor for export.

**SketchMoistureLayer** additions:
```ts
clipRoomPoints?: ReadonlyArray<{ x: number; y: number }> | null;
// when set + active: ignore clicks outside polygon
```

**Acceptance:** Tech can select room → crop guides → drop pins only in room → freehand water stays in room.

---

### Task 7: Report-usable room crop export

**Files:**
- Modify: `lib/sketch/export-sketch-png.ts` and/or `lib/sketch/export-content-bounds.ts`
- Optionally: `lib/generate-sketch-pdf.ts` / `lib/reports/moisture-map.ts`
- Test: extend `lib/sketch/__tests__/export-content-bounds.test.ts` or new room-crop export test

**Behaviour:**
- When floor has active/last `roomMoistureCrop` meta, PNG crop uses that rect (plus padding) instead of whole-floor content bounds for a dedicated moisture inset **or** filter pins to room for PDF moisture overlay.
- Prefer minimal change: export helper `contentBoundsForRoomCrop(crop: RoomCropRect)` and call site from editor “Export room moisture” or PDF floor path when meta present.

**Acceptance:** Report/PDF (or exported PNG) shows room-scoped plan + in-room moisture pins usable for claim docs — not whole-house only.

---

## P1 Tasks (after P0)

### Task 8: True wall-band openings

**Files:** `lib/sketch/opening-geometry.ts` (`wallSolidSegments` already exists), `components/sketch/SketchCanvas.tsx`

- Rematerialize wall strokes as solid segments with true gaps at doors/windows (not only white cut + jamb ticks).
- Tests already in `opening-geometry.test.ts` — extend rematerialize unit tests first.

### Task 9: Room adjacency snap

**Files:** snap hook / `SketchCanvas` move handlers

- When dragging a room near another, snap shared edge and show **green** adjacency cue (magicplan-inspired; RestoreAssist styling).
- Unit-test snap distance math in `lib/sketch/`.

### Task 10: L / T room templates

**Files:** `lib/sketch/room-defaults.ts`, dock room flyout, `tool-objects.ts`

- One-tap L and T polygons with typed defaults; tests for polygon topology.

### Task 11: On-canvas dimension edit

**Files:** `SketchCanvas.tsx`, dim label overlay

- Tap edge dim → inline numeric edit + lock (panel path already exists — promote to canvas).

---

## Verification Checklist

### P0 — Quick / Advanced
- [ ] Fresh editor respects saved mode from `localStorage` (`ra-sketch-editor-mode`).
- [ ] Quick: only Select, Label, Measure, Pan (+ mode toggle, undo/zoom chrome).
- [ ] Advanced: full dock including Room, Wall, Door, Window, Moisture, Equipment.
- [ ] Switching Quick→Advanced does not wipe canvas; Advanced→Quick coerces active CAD tool to Select.

### P0 — Lifecycle
- [ ] Empty floor shows start overlay (scan / underlay / blank / moisture).
- [ ] Starting LiDAR shows scanning/waiting state — not full Advanced dump mid-capture.
- [ ] After rooms land with unconfirmed provenance → needs-confirm banner + Quick edit default.
- [ ] Moisture available before geometry (existing start path) still works.
- [ ] No Encircle product names / orange-clone crop branding in UI copy.

### P0 — Room-crop moisture
- [ ] Select room → “Map moisture in this room” enters crop session with guides.
- [ ] Pins outside room ignored; pins inside persist and save with floor.
- [ ] Freehand water / affected area still clips to room walls.
- [ ] Export/PDF (or room PNG) usable for report with room-scoped moisture.

### P1
- [ ] Wall bands show true gaps at openings after rematerialize.
- [ ] Adjacent rooms snap with green cue.
- [ ] L/T templates place correct polygons.
- [ ] Edge dim editable on canvas with lock.

### Automated
```bash
npx vitest run lib/sketch/__tests__/editor-mode.test.ts \
  lib/sketch/__tests__/plan-lifecycle.test.ts \
  lib/sketch/__tests__/room-moisture-crop.test.ts \
  components/sketch/__tests__/SketchDockToolbar.editor-mode.test.tsx
```

---

## Spec coverage (self-review)

| Spec / research item | Task |
| --- | --- |
| Quick vs Advanced tool depth (§3.4 Quick Editor analogue) | 1–2 |
| Scan → wait → plan-ready / confirm | 3–4 |
| Hydro-style room-crop moisture | 5–7 |
| COMPETITOR_RESEARCH no UI clone | Global + Task 4/6 copy/colour notes |
| No fake ESX | Non-goals |
| Wall-band / adjacency / L-T / on-canvas dim | 8–11 (P1) |

**Placeholder scan:** none intentional — P1 tasks are scoped enough to start from existing `opening-geometry` / `room-defaults` without TBD APIs.

---

## Execution note

User approved starting **P0 only** in this session (Tasks 1–7). Do not implement all of P1 unless P0 completes with spare time. Do **not** commit unless asked.
