/**
 * RA-6795 — Phase-3 RoomPlan → Fabric.js converter (dependency-free).
 *
 * Apple RoomPlan (iOS/ARKit LiDAR) emits a `CapturedRoom` whose surfaces carry
 * floor polygons expressed in **metres**. This pure function projects those
 * metric vertices into the Sketch canvas's pixel space using the SAME
 * convention as the rest of lib/sketch (PX_PER_METRE = 100, shoelace area),
 * so a LiDAR-imported room measures identically to a hand-drawn one and the
 * human PDF / machine export can never drift.
 *
 * No native deps, no I/O — just geometry. The caller materialises the returned
 * descriptor(s) into real Fabric polygons (mirrors lib/sketch/tool-objects.ts).
 *
 * Native capture (the ARKit scan itself) stays gated behind RA-1133; this
 * converter is the dependency-free TS win that lets us shape captured data the
 * moment a `CapturedRoom` JSON arrives.
 */
import { PX_PER_METRE, shoelaceArea } from "./extract-rooms";

/** A single floor-plane vertex in metres, as emitted by RoomPlan. */
export interface RoomPlanPoint {
  x: number;
  /** RoomPlan's depth axis (often named `z`); accept either key. */
  y?: number;
  z?: number;
}

/** One captured room/surface from an Apple RoomPlan `CapturedRoom`. */
export interface CapturedRoomSurface {
  /** Human label (e.g. "Living Room"); RoomPlan calls this `category`. */
  label?: string;
  category?: string;
  /** Floor polygon vertices, in metres. */
  floorPolygon: RoomPlanPoint[];
}

/** Minimal RoomPlan `CapturedRoom`-style input accepted by the converter. */
export interface CapturedRoom {
  rooms: CapturedRoomSurface[];
}

/**
 * A Fabric.js polygon element produced from a captured room. The shape mirrors
 * the `kind: "polygon"` descriptor in lib/sketch/tool-objects.ts so the canvas
 * can materialise it directly.
 */
export interface FabricPolygonElement {
  type: "polygon";
  /** Polygon vertices in pixel space (metres × PX_PER_METRE). */
  points: { x: number; y: number }[];
  fill: string;
  stroke: string;
  strokeWidth: number;
  objectCaching: false;
  /** Custom data persisted on the object — drives selection + decomposition. */
  data: {
    type: "room";
    label: string;
    /** Floor area in m², via the shared shoelace convention. */
    areaM2: number;
    /** Imported geometry is NOT operator-measured (mirrors RA-6760). */
    provenance: "lidar_imported";
  };
}

const ROOM_FILL = "rgba(28,46,71,0.08)";
const ROOM_STROKE = "#1C2E47"; // brand primary (CLAUDE.md)
const ROOM_STROKE_WIDTH = 2;

/**
 * Minimum floor area (m²) for an imported room to be materialised. A capture
 * whose vertices lack a depth axis (z/y) collapses to a near-zero-area line;
 * emitting it as a "room" would inject a bogus 0 m² measurement into the
 * report/compliance surface, so degenerate captures are skipped. 0.01 m²
 * (100 cm²) is far below any real room while still catching collapsed polygons.
 */
const MIN_ROOM_AREA_M2 = 0.01;

/** Read a vertex's depth axis, accepting RoomPlan's `z` or a flattened `y`. */
function depthOf(p: RoomPlanPoint): number {
  return p.z ?? p.y ?? 0;
}

/**
 * Convert a RoomPlan `CapturedRoom`-style JSON into Fabric.js polygon
 * element(s). Rooms with fewer than 3 floor vertices are skipped (a polygon
 * needs at least a triangle), matching the room-tool guard in tool-objects.ts,
 * as are degenerate captures that collapse to a near-zero area (MIN_ROOM_AREA_M2).
 *
 * @param captured RoomPlan CapturedRoom JSON (floor polygons in metres).
 * @returns One `FabricPolygonElement` per valid captured room.
 */
export function roomPlanToFabric(
  captured: CapturedRoom | null | undefined,
): FabricPolygonElement[] {
  const rooms = captured?.rooms;
  if (!rooms?.length) return [];

  const elements: FabricPolygonElement[] = [];

  for (const room of rooms) {
    const vertices = room.floorPolygon;
    if (!vertices || vertices.length < 3) continue;

    const points = vertices.map((p) => ({
      x: p.x * PX_PER_METRE,
      y: depthOf(p) * PX_PER_METRE,
    }));

    const areaM2 = shoelaceArea(points) / (PX_PER_METRE * PX_PER_METRE);

    // Skip degenerate captures (e.g. vertices with no depth axis) that collapse
    // to a line — they would otherwise emit a bogus 0 m² room measurement.
    if (areaM2 < MIN_ROOM_AREA_M2) continue;

    elements.push({
      type: "polygon",
      points,
      fill: ROOM_FILL,
      stroke: ROOM_STROKE,
      strokeWidth: ROOM_STROKE_WIDTH,
      objectCaching: false,
      data: {
        type: "room",
        label: room.label ?? room.category ?? "Room",
        areaM2,
        provenance: "lidar_imported",
      },
    });
  }

  return elements;
}
