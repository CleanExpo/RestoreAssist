# Floor Plan Sketch — Implementation Notes (P0)

**Date:** 2026-08-02  
**Based on:** `docs/research/2026-08-02-floor-plan-sketching-competitive-ux-research.md`  
**Scope:** RestoreAssist sketch / Floor Plan tab — field speed P0s, not a Symbility clone.

---

## Shipped

### 1. Room-first defaults + typed L×W
- **Room tool:** tap places a default **3.86 m × 3.86 m** (~12′8″) rectangle; drag places a custom axis-aligned room; **Shift+click** retains polygon vertices + double-click close for irregular rooms.
- **Selection panel:** Length × Width inputs (metres or feet-inches like `12'8"`) with validation toast.
- Pure helpers: `lib/sketch/room-defaults.ts`.

### 2. Wall-opening handles + host binding polish
- Doors/windows snap to **standalone walls and room polygon edges** (critical for room-first workflow).
- Selected openings show **red diamond end handles**; drag along host wall resizes width (`resizeOpeningAlongWall`).
- Openings carry stable `data.id`; rematerialize preserves id + lock.
- Typed opening width via selection panel (triggers host reanchor rebuild).

### 3. On-wall / object dimensions with edit + lock
- Auto dim labels already existed (RA-6842); panel now edits L×W / wall length / opening width.
- **Lock** toggle (`dimLocked`) blocks typed edits and canvas scale stretch (`enforceDimLock`).
- Green snap guides when aligning to measured endpoints (magicplan-style).

### 4. Moisture pins before geometry is final
- Moisture tool always available; empty-state CTA **“Drop moisture pins now”**.
- Overlay pins remain independent of Fabric geometry (existing `SketchMoistureLayer`).

### 5. Scan → confirm → annotate happy path
- Empty-canvas **Start floor plan** chooser: LiDAR scan (when native), import underlay, blank canvas, moisture-first.
- Existing RoomPlan confirm / exclude / provenance panel unchanged.
- Blank canvas is explicitly the fallback.

### 6. Finalize / persist (honest UX)
- **Mark complete** top-bar control persists `raSketchMeta.fieldComplete` on the sketch blob (not carrier sync / FML / estimate lock).
- Existing empty-overwrite guards (`sketch-data-guards`) + debounced save + floorsDataRef freshness remain.
- Auto-save still the persistence path; complete is a status flag only.

---

## Later ships

See `docs/research/2026-08-09-encircle-parity-next-level.md` for the 2026-08-09
Encircle-style bundle (one-tap room damage, equipment symbols, opening jambs,
short-dim hide, PDF north arrow + scale bar).

## Deferred (still open)

| Item | Why deferred |
| --- | --- |
| Room assembly adjacency snap (green join between rooms) | Needs shared-edge detector beyond alignment guides |
| L / T room templates + flip/rotate | Beyond rect tap/drag |
| Missing wall / opening tool distinct from door/window | New tool mode |
| True wall-band rematerialize from solid segments | White cut + jambs ship; polygon stroke still continuous |
| Room-crop moisture map export | Report pipeline work |
| Bluetooth laser | Hardware bridge |
| ESX / FML estimate export | Carrier integration — do not fake |
| Cotality lock / sync / desktop ownership | No equivalent; **Mark complete** is the honest substitute |
| Dim label tap-on-canvas edit (vs panel) | Panel covers edit+lock; on-canvas edit later |

---

## Key files

| Area | Path |
| --- | --- |
| Room defaults / typed parse | `lib/sketch/room-defaults.ts` |
| Opening resize math | `lib/sketch/opening-geometry.ts` (`resizeOpeningAlongWall`) |
| Field-complete meta | `lib/sketch/sketch-field-status.ts` |
| Canvas room/opening UX | `components/sketch/SketchCanvas.tsx` |
| Selection dims + lock | `components/sketch/SketchSelectionPanel.tsx` |
| Start overlay + mark complete | `components/sketch/SketchStartOverlay.tsx`, `SketchEditorV2.tsx` |

---

## Manual smoke test (inspection → Floor Plan)

1. Open an inspection Floor Plan tab on an empty floor.
2. Confirm **Start floor plan** chooser; pick **Blank canvas** → Room tool active.
3. **Tap** once → ~3.86 m room appears; select it → edit L×W → **Lock**.
4. Select **Door** → click a room edge → door snaps; select door → drag red diamonds; type width.
5. Switch to **Moisture** (or chooser “Drop moisture pins now”) → place pin without more geometry.
6. Attach a **Photo** pin if evidence path is enabled for the inspection.
7. Click **Mark complete** → status shows Complete; wait for Saved; reload page → geometry + complete flag intact.
8. On a LiDAR-capable device: chooser **Scan with LiDAR** → rooms arrive as `underlay_reference` → **Confirm LiDAR measurement**.

---

## Gaps vs Cotality workflow (documented honesty)

| Cotality step | RestoreAssist |
| --- | --- |
| New Diagram → Floorplan | Start chooser (scan / underlay / blank) |
| Place/edit rooms & openings | Room tap/drag + door/window on room edges |
| Attach photos + questionnaires | Photo evidence pins + existing moisture / S500 / WHS panel fields |
| Lock estimate / sync / release to desktop | **Mark complete** + auto-save only — no FML/carrier sync |
