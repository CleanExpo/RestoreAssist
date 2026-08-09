# Encircle-style sketch parity — next-level bundle (2026-08-09)

**Scope:** Highest-ROI Encircle / magicplan inspection-grade improvements on the existing Fabric sketch stack — not a full Encircle/Xactimate clone.

## Shipped in this pass

| Aspect | Behaviour |
| --- | --- |
| **One-tap room damage** | Affected-area tool: tap inside a room paints the whole polygon with the selected category; tap again toggles off; drag still freehand-brushes with room clip + tint. PDF **Affected Areas** legend unchanged (reads `data.type === "damage"`). |
| **Opening wall cuts** | Doors/windows draw a thicker white cut **plus perpendicular jamb ticks** so walls read as terminated. Pure `wallSolidSegments` / `openingCutInterval` ready for future rematerialize of wall bands. |
| **Dimensions** | Per-edge / wall labels omit segments shorter than **0.45 m** (Encircle short-dim rule). Existing typed L×W + lock + scale-aware `formatDimension` retained. |
| **Labels** | Room name · area m² captions already export via content-crop PNG (unchanged). |
| **Scale** | Calibration modal unchanged; PDF now draws a **graphic scale bar** from `scaleConfig.pxPerMetre` (or default 100). |
| **Equipment** | New **Equipment** tool (E): dehumidifier, air mover, air scrubber, cavity dryer — placeable symbols that export and appear in PDF **Equipment** legend. |
| **PDF chrome** | North arrow (top-right of plan) + scale bar (bottom-right); consistent brand line weights; no UI chrome (export firewall already strips guides/handles). |
| **UX** | Dock labels: Affected area (tap room), Equipment, Room label, Markup — brand navy dock unchanged. |

## How to verify

### Editor
1. Floor Plan → blank canvas → **Room** tap → place room; name it in selection panel.
2. **Affected area** (G) → pick Water → **tap** room interior → whole room tints; tap again → clears.
3. Drag-brush inside room → stroke clips to walls + keeps tint.
4. **Door** / **Window** on room edge → white cut + dark jamb ticks; red diamonds resize in Select.
5. **Equipment** (E) → DH / AM / AS / CD → click to place; symbols show short codes.
6. Confirm short walls (&lt; ~0.45 m) do not get dim labels; longer edges do.
7. Calibrate scale (ruler icon) → dim strings / areas update.

### Report PDF
1. Export sketch / generate claim report with floor plans.
2. Page shows content-cropped plan, room legend, Affected Areas (if any), Equipment (if any).
3. North **N** arrow top-right of image; scale bar bottom-right; scale line in header.

## Residual gaps vs true Encircle

| Gap | Why deferred |
| --- | --- |
| Video-scan → processed floor plan SLA | Different product; RoomPlan + underlay remain the capture path |
| Hydro moisture map room-crop workflow | Moisture pins exist; dedicated room-crop moisture export not built |
| True wall-band rematerialize from `wallSolidSegments` | Room polygons still use continuous stroke + white cut mask (jambs improve readability) |
| Room assembly green adjacency snap | Alignment guides exist; shared-edge join UX not built |
| L / T templates, missing-wall tool | Beyond this pass |
| Dim lock tap-on-canvas edit | Panel edit + lock remains |
| ESX / FML estimate export | Carrier integration — do not fake |
| Bluetooth laser | Hardware bridge |
| Full Xactimate CAD depth | Explicitly out of scope (research §10) |

## Key files

| Area | Path |
| --- | --- |
| Room tap damage | `lib/sketch/damage-zone.ts`, `SketchCanvas.tsx` |
| Opening jambs / solid cuts | `lib/sketch/opening-geometry.ts` |
| Short dims | `lib/sketch/geometry-utils.ts` (`shouldShowEdgeDimension`) |
| Equipment | `lib/sketch/equipment-symbols.ts`, dock + canvas |
| PDF chrome | `lib/sketch/pdf-plan-chrome.ts`, `lib/generate-sketch-pdf.ts` |
