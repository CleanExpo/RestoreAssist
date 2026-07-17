# Sketch Pad Modernization — Delivery Status

**Date:** 2026-07-12  
**Approach:** Extend Fabric.js + ClaimSketch (no rewrite). RoomGraph derived on save.

## Shipped in this slice (production)

### RoomGraph V1
- Prisma models: `SketchRoom`, `EvidencePin`
- Migration: `prisma/migrations/20260712090000_sketch_room_graph_evidence_pins`
- Sync on sketch save: `lib/sketch/sync-room-graph.ts` + wired in `POST …/sketches`
- Fabric rooms now stamp stable `data.id` on create

### Photos on plan (P0)
- `SketchEvidenceLayer` — place / drag / preview / remove
- API: `…/sketches/[sketchId]/evidence-pins` (GET/POST) + `[pinId]` (PATCH/DELETE)
- Toolbar **Photo** tool uploads via existing photo API, then creates an `EvidencePin`
- Auto-assigns `sketchRoomId` via point-in-polygon when RoomGraph rooms exist

### Doors & windows
- Engine already existed; now on V2 dock (**Door**, **Window**)

### Damage zones
- New **Damage** tool + kind picker (water/fire/mould/smoke/biohazard/structural/electrical/contents)
- Paths stamp `data.type: "damage"` + `damageKind` for export/decomposition
- `SketchElement` accepts type `damage`

### Moisture vs Photo
- **Moisture** tool → moisture pins (was incorrectly bound to Photo)
- **Photo** tool → evidence pins

## Not yet (next slices)
- Full workspace IA (top bar / left rail / right inspector redesign)
- Split/merge/L-shaped room tools
- Photo clusters, video/docs/voice pin kinds in UI
- Laser presets, RoomPlan LiDAR UI
- Virtualization for 500+ pins
- Full export legend for damage kinds

## How to validate
1. `pnpm prisma migrate deploy` (or `migrate dev`)
2. Open inspection → Floor Plan
3. Draw rooms → save → confirm `SketchRoom` rows
4. Select **Photo** → tap canvas → pick image → pin appears
5. Select **Door** / **Window** → click near a wall
6. Select **Damage** → pick kind → brush a zone
