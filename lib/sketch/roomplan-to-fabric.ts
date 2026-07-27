/**
 * RA-6795 / RA-7091 Phase 3 — RoomPlan → Fabric.js converter (dependency-free).
 *
 * Apple RoomPlan (iOS/ARKit LiDAR) emits a `CapturedRoom` whose surfaces carry
 * floor polygons expressed in **metres**. This pure function projects those
 * metric vertices into the Sketch canvas's pixel space using the SAME
 * convention as the rest of lib/sketch (PX_PER_METRE = 100, shoelace area),
 * so a LiDAR-captured room measures identically to a hand-drawn one.
 *
 * Decision R2 (mapping-v2 plan): independently measured LiDAR is legitimately
 * measured **after** on-site technician confirmation (MVP R5). Fresh scans land
 * as `underlay_reference` + `captureAdapter: "roomplan"` so they cannot inflate
 * billed quantities until Confirm measurement — then provenance becomes
 * `operator_measured` with original geometry + correction history preserved.
 */
import { PX_PER_METRE, shoelaceArea } from "./extract-rooms";
import {
  formatRoomLabel,
  metresToPx,
  WALL_THICKNESS_INTERNAL_M,
} from "./tool-objects";

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
  identifier?: string;
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
    id: string;
    label: string;
    /** Floor area in m², via the shared shoelace convention. */
    areaM2: number;
    /**
     * Pending tech confirmation (RA-7091 correction workflow). Promoted to
     * `operator_measured` via Confirm measurement in the selection panel.
     */
    provenance: "underlay_reference";
    /** Persisted adapter tag for Mapping V2 / ClaimSketch. */
    captureAdapter: "roomplan";
    /** Pixel-space snapshot of the raw scan (pre-correction). */
    originalPoints: { x: number; y: number }[];
    originalLabel: string;
    originalAreaM2: number;
    correctionHistory: [];
  };
  /** Centered room caption (Name · m²), matching hand-drawn rooms. */
  label: {
    text: string;
    left: number;
    top: number;
  };
}

const ROOM_FILL = "rgba(28,46,71,0.08)";
const ROOM_STROKE = "#1C2E47"; // brand primary (CLAUDE.md)

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function newRoomId(index: number): string {
  return `roomplan-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`;
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
  const strokeWidth = metresToPx(WALL_THICKNESS_INTERNAL_M, PX_PER_METRE);

  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    const vertices = room.floorPolygon;
    if (!vertices || vertices.length < 3) continue;

    const points = vertices.map((p) => ({
      x: p.x * PX_PER_METRE,
      y: depthOf(p) * PX_PER_METRE,
    }));

    // Skip captures with a non-finite projected vertex (NaN/±Infinity in the
    // source scan) — they would emit corrupt geometry and a NaN/Infinity area.
    if (points.some((pt) => !Number.isFinite(pt.x) || !Number.isFinite(pt.y)))
      continue;

    const areaM2 = round2(
      shoelaceArea(points) / (PX_PER_METRE * PX_PER_METRE),
    );

    // Skip degenerate captures (e.g. vertices with no depth axis) that collapse
    // to a line — they would otherwise emit a bogus 0 m² room measurement — and
    // any capture whose area is non-finite.
    if (!Number.isFinite(areaM2) || areaM2 < MIN_ROOM_AREA_M2) continue;

    const labelText = room.label ?? room.category ?? "Room";
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;

    elements.push({
      type: "polygon",
      points,
      fill: ROOM_FILL,
      stroke: ROOM_STROKE,
      strokeWidth,
      objectCaching: false,
      data: {
        type: "room",
        id: newRoomId(i),
        label: labelText,
        areaM2,
        provenance: "underlay_reference",
        captureAdapter: "roomplan",
        originalPoints: points.map((p) => ({ ...p })),
        originalLabel: labelText,
        originalAreaM2: areaM2,
        correctionHistory: [],
      },
      label: {
        text: formatRoomLabel(labelText, areaM2),
        left: cx,
        top: cy,
      },
    });
  }

  return elements;
}
