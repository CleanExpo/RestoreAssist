# RestoreAssist Sketch Studio — Encircle-workflow parity status

**Date:** 2026-08-17  
**Scope:** Workflow / outcome parity with Encircle-type inspection sketching — **not** a visual or branding clone (`COMPETITOR_RESEARCH` forbids UI clone). No ESX / FML / Xactimate export invented.

## Status summary

| Workflow outcome | Status | Notes |
| --- | --- | --- |
| Start chooser (scan / underlay / blank / moisture) | **Done** | Underlay opens file picker; moisture pins before geometry |
| Scan → waiting → confirm → plan-ready | **Done** | Banner shows plan-ready until Got it / Advanced; hydrate dismisses noise |
| Quick edit default after plan-ready | **Done** | Advanced available via dock + banner |
| Room moisture crop + PNG export | **Done** | Crop meta persisted on `sketchData.roomMoistureCrop` |
| Room moisture in report / studio PDF | **Done** | Companion “Room moisture — {label}” page via `expandFloorsWithRoomMoisture` |
| Wall-band rematerialize (door / window / missing) | **Done** | All room edges rematerialized when any edge has an opening |
| Wall thickness | **Done** | Selection panel → stroke + refresh bands |
| On-canvas dims (rect) | **Done** | L/T typed dims remain AABB-limited by design |
| L / T templates + adjacency snap | **Done** | |
| Equipment symbols + PDF legend | **Done** | |
| PDF chrome (N arrow, scale bar) | **Done** | |
| Mark complete (local field status) | **Done** | Not carrier sync |
| Export PDF / PNG with honest errors | **Done** | Toasts on empty / HTTP failure / success |

## Explicitly out of scope (do not fake)

- ESX / FML / Xactimate estimate export
- Encircle video-scan SLA (RoomPlan + underlay remain the capture path)
- Bluetooth laser hardware
- Full Xactimate CAD depth
- Visual / colour / copy clone of Encircle or Hydro

## How to verify (Sketch Studio)

1. Floor Plan → empty canvas → start overlay: Blank / Underlay (file picker) / Moisture.
2. Place room → Quick edit after plan-ready → **Got it** dismisses banner; **Advanced draw** opens full dock.
3. Door/window/missing on one edge → other walls remain visible (bands on all edges).
4. Select room → Map moisture → pins inside room → Export room moisture PNG; Mark complete; Export PDF/PNG.
5. Claim / inspection report PDF includes floor page + optional “Room moisture — …” companion when crop meta was saved.

## Key files

| Area | Path |
| --- | --- |
| Editor wiring | `components/sketch/SketchEditorV2.tsx` |
| Lifecycle / mode | `lib/sketch/plan-lifecycle.ts`, `lib/sketch/editor-mode.ts` |
| Room moisture | `lib/sketch/room-moisture-crop.ts`, `lib/reports/claim-sketch-floors.ts` |
| Wall bands | `lib/sketch/wall-band-rematerialize.ts`, `components/sketch/SketchCanvas.tsx` |
