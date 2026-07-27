/**
 * RoomGraph V1 sync — derive SketchRoom rows from Fabric sketchData.
 *
 * Fabric remains the render SSOT. These rows give every room a stable UUID
 * that EvidencePin / moisture / damage / scope can join to (SKETCH-002).
 *
 * RA-7091: RoomPlan rooms use the same fabricObjectId (`data.id`) so evidence
 * placed inside a LiDAR polygon binds to the same SketchRoom row after save.
 */
import { createHash } from "node:crypto";
import { polygonAbsolutePoints } from "./fabric-absolute";

const DEFAULT_PX_PER_M = 100;

type Point = { x: number; y: number } | [number, number];

interface FabricObject {
  type?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  points?: Point[];
  pathOffset?: { x: number; y: number };
  data?: {
    type?: string;
    id?: string;
    label?: string;
    name?: string;
    areaM2?: number;
    materialSlug?: string;
    material?: string;
    waterCategory?: string;
    provenance?: string;
    captureAdapter?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

interface SketchData {
  objects?: FabricObject[];
  scaleConfig?: { pxPerMetre?: number };
}

export interface RoomGraphNodeInput {
  fabricObjectId: string;
  name: string;
  areaM2: number | null;
  perimeterM: number | null;
  materialSlug: string | null;
  waterCategory: string | null;
  provenance: string;
  /** Present when the room came from RoomPlan / underlay / etc. */
  captureAdapter: string | null;
  geometryJson: FabricObject;
}

export interface EvidenceRoomLink {
  sketchRoomId: string;
  fabricObjectId: string | null;
  roomName: string;
  captureAdapter: string | null;
}

function xy(p: Point): { x: number; y: number } {
  return Array.isArray(p) ? { x: p[0], y: p[1] } : p;
}

function shoelacePx(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = xy(points[i]);
    const b = xy(points[(i + 1) % points.length]);
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function perimeterPx(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = xy(points[i]);
    const b = xy(points[(i + 1) % points.length]);
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

/** Stable fabric object id — prefer data.id, else hash of geometry. */
export function resolveFabricObjectId(obj: FabricObject, index: number): string {
  const existing = obj.data?.id;
  if (typeof existing === "string" && existing.length > 0) return existing;

  const payload = JSON.stringify({
    i: index,
    t: obj.data?.type,
    p: obj.points ?? null,
    l: obj.left,
    top: obj.top,
    w: obj.width,
    h: obj.height,
  });
  return `fr-${createHash("sha256").update(payload).digest("hex").slice(0, 16)}`;
}

export function extractRoomGraphNodes(
  sketchData: SketchData,
  opts: { pxPerMetre?: number } = {},
): RoomGraphNodeInput[] {
  const objects = sketchData?.objects ?? [];
  const pxPerM =
    opts.pxPerMetre ?? sketchData?.scaleConfig?.pxPerMetre ?? DEFAULT_PX_PER_M;

  const rooms: RoomGraphNodeInput[] = [];
  let roomIndex = 0;

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    if (obj.data?.type !== "room") continue;

    const fabricObjectId = resolveFabricObjectId(obj, i);
    const points = Array.isArray(obj.points) ? obj.points : [];
    const areaM2 =
      typeof obj.data.areaM2 === "number"
        ? obj.data.areaM2
        : points.length >= 3
          ? shoelacePx(points) / (pxPerM * pxPerM)
          : null;
    const perimeterM =
      points.length >= 2 ? perimeterPx(points) / pxPerM : null;

    const name =
      (typeof obj.data.label === "string" && obj.data.label) ||
      (typeof obj.data.name === "string" && obj.data.name) ||
      `Room ${++roomIndex}`;

    const materialSlug =
      (typeof obj.data.materialSlug === "string" && obj.data.materialSlug) ||
      (typeof obj.data.material === "string" && obj.data.material) ||
      null;

    rooms.push({
      fabricObjectId,
      name,
      areaM2,
      perimeterM,
      materialSlug,
      waterCategory:
        typeof obj.data.waterCategory === "string"
          ? obj.data.waterCategory
          : null,
      provenance:
        typeof obj.data.provenance === "string"
          ? obj.data.provenance
          : "operator_measured",
      captureAdapter:
        typeof obj.data.captureAdapter === "string"
          ? obj.data.captureAdapter
          : null,
      geometryJson: obj,
    });
  }

  return rooms;
}

/**
 * Point-in-polygon for assigning evidence pins to a room.
 * Uses Fabric absolute polygon points (pathOffset-aware) so RoomPlan and
 * hand-drawn rooms both hit-test correctly after canvas transforms.
 */
export function findRoomIdAtPoint(
  rooms: Array<{ id: string; geometryJson: unknown }>,
  x: number,
  y: number,
): string | null {
  return resolveEvidenceRoomLink(rooms, x, y)?.sketchRoomId ?? null;
}

/**
 * Scene-space polygon vertices for hit-testing.
 * Prefers live Fabric transforms; falls back to serialized left/top (+ pathOffset).
 */
function roomPolygonScenePoints(
  geo: FabricObject,
): Array<{ x: number; y: number }> | null {
  const hasLiveMatrix =
    typeof (geo as { calcTransformMatrix?: unknown }).calcTransformMatrix ===
    "function";
  if (hasLiveMatrix) {
    const abs = polygonAbsolutePoints(geo);
    if (abs && abs.length >= 3) return abs;
  }

  if (!Array.isArray(geo.points) || geo.points.length < 3) return null;
  const ox = typeof geo.left === "number" ? geo.left : 0;
  const oy = typeof geo.top === "number" ? geo.top : 0;
  const off = geo.pathOffset;
  if (off && typeof off.x === "number" && typeof off.y === "number") {
    return geo.points.map((p) => {
      const c = xy(p);
      return { x: c.x - off.x + ox, y: c.y - off.y + oy };
    });
  }
  return geo.points.map((p) => {
    const c = xy(p);
    return { x: c.x + ox, y: c.y + oy };
  });
}

/**
 * Richer room link for evidence UI — includes display name + capture adapter.
 */
export function resolveEvidenceRoomLink(
  rooms: Array<{
    id: string;
    name?: string | null;
    fabricObjectId?: string | null;
    geometryJson: unknown;
  }>,
  x: number,
  y: number,
): EvidenceRoomLink | null {
  for (const room of rooms) {
    const geo = room.geometryJson as FabricObject | null;
    if (!geo) continue;
    const pts = roomPolygonScenePoints(geo);
    if (!pts || pts.length < 3) continue;
    if (!pointInPolygon(x, y, pts)) continue;

    const data = geo.data;
    return {
      sketchRoomId: room.id,
      fabricObjectId:
        room.fabricObjectId ??
        (typeof data?.id === "string" ? data.id : null),
      roomName:
        (typeof room.name === "string" && room.name) ||
        (typeof data?.label === "string" && data.label) ||
        "Room",
      captureAdapter:
        typeof data?.captureAdapter === "string" ? data.captureAdapter : null,
    };
  }
  return null;
}

/** Attach roomName onto evidence pin view models from SketchRoom rows. */
export function attachRoomNamesToPins<
  T extends { sketchRoomId?: string | null },
>(
  pins: T[],
  rooms: Array<{ id: string; name: string }>,
): Array<T & { roomName: string | null }> {
  const byId = new Map(rooms.map((r) => [r.id, r.name]));
  return pins.map((pin) => ({
    ...pin,
    roomName: pin.sketchRoomId ? (byId.get(pin.sketchRoomId) ?? null) : null,
  }));
}

function pointInPolygon(
  x: number,
  y: number,
  pts: Array<{ x: number; y: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
