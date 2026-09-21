/**
 * RA-7572 — resolve a saved room's billed area in metres.
 *
 * The room tool persists `data.areaM2` / `lengthM` × `widthM` in metres, and
 * RoomGraph writes the same figures onto SketchRoom. The estimate extractor
 * used to ignore those and re-shoelace Fabric `points` at a hardcoded
 * 100 px/m, so a 3 m × 3 m room whose serialised geometry was not a
 * `{ type: "polygon", points: [{x,y}…] }` blob at that scale produced 0
 * area lines with no error.
 *
 * Metres-first: prefer the already-computed m², then L×W, then shoelace
 * using the sketch's own `scaleConfig.pxPerMetre`.
 */

export const DEFAULT_PX_PER_METRE = 100;

export type PointLike = { x: number; y: number } | [number, number];

export interface RoomGeometryObject {
  type?: string;
  points?: PointLike[];
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  data?: {
    type?: string;
    label?: string;
    roomType?: string;
    name?: string;
    provenance?: string;
    areaM2?: number;
    lengthM?: number;
    widthM?: number;
    perimeterM?: number;
    heightM?: number;
    ceilingHeightM?: number;
    isDamageZone?: boolean;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export function resolvePxPerMetre(
  sketchData: { scaleConfig?: { pxPerMetre?: number } } | null | undefined,
  fallback = DEFAULT_PX_PER_METRE,
): number {
  const n = sketchData?.scaleConfig?.pxPerMetre;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : fallback;
}

export function normalizePoint(p: PointLike | null | undefined): {
  x: number;
  y: number;
} | null {
  if (!p) return null;
  if (Array.isArray(p)) {
    const x = Number(p[0]);
    const y = Number(p[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  const x = Number(p.x);
  const y = Number(p.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function objectPoints(obj: RoomGeometryObject): { x: number; y: number }[] {
  if (!Array.isArray(obj.points)) return [];
  const out: { x: number; y: number }[] = [];
  for (const p of obj.points) {
    const xy = normalizePoint(p);
    if (xy) out.push(xy);
  }
  return out;
}

function positiveFinite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function shoelacePx2(pts: { x: number; y: number }[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

function perimeterPx(pts: { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

/** Operator-measured room that may contribute billed floor/wall area. */
export function isMeasuredRoom(obj: RoomGeometryObject): boolean {
  if (obj.data?.provenance === "underlay_reference") return false;
  const dataType = obj.data?.type;
  if (
    dataType === "opening" ||
    dataType === "room-label" ||
    dataType === "dim-label" ||
    dataType === "wall" ||
    dataType === "wall-band"
  ) {
    return false;
  }
  if (dataType === "room") return true;
  if (obj.data?.isDamageZone) return false;
  const t = obj.type?.toLowerCase();
  return t === "polygon" || t === "polyline";
}

/**
 * Floor area in m², or null when the object has no usable geometry.
 * Prefer persisted metre fields so a 3×3 room cannot collapse to 0.
 */
export function resolveRoomAreaM2(
  obj: RoomGeometryObject,
  pxPerMetre = DEFAULT_PX_PER_METRE,
): number | null {
  const data = obj.data;
  if (positiveFinite(data?.areaM2)) return data.areaM2;
  if (positiveFinite(data?.lengthM) && positiveFinite(data?.widthM)) {
    return data.lengthM * data.widthM;
  }

  const scale = pxPerMetre > 0 ? pxPerMetre : DEFAULT_PX_PER_METRE;
  const scaleX = typeof obj.scaleX === "number" && Number.isFinite(obj.scaleX) ? obj.scaleX : 1;
  const scaleY = typeof obj.scaleY === "number" && Number.isFinite(obj.scaleY) ? obj.scaleY : 1;
  const pts = objectPoints(obj);
  if (pts.length >= 3) {
    const scaled = pts.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));
    const area = shoelacePx2(scaled) / (scale * scale);
    if (positiveFinite(area)) return area;
  }
  if (positiveFinite(obj.width) && positiveFinite(obj.height)) {
    const area = (obj.width * scaleX * obj.height * scaleY) / (scale * scale);
    if (positiveFinite(area)) return area;
  }
  return null;
}

export function resolveRoomPerimeterM(
  obj: RoomGeometryObject,
  pxPerMetre = DEFAULT_PX_PER_METRE,
): number | null {
  if (positiveFinite(obj.data?.perimeterM)) return obj.data.perimeterM;
  if (positiveFinite(obj.data?.lengthM) && positiveFinite(obj.data?.widthM)) {
    return 2 * (obj.data.lengthM + obj.data.widthM);
  }
  const scale = pxPerMetre > 0 ? pxPerMetre : DEFAULT_PX_PER_METRE;
  const scaleX = typeof obj.scaleX === "number" && Number.isFinite(obj.scaleX) ? obj.scaleX : 1;
  const scaleY = typeof obj.scaleY === "number" && Number.isFinite(obj.scaleY) ? obj.scaleY : 1;
  const pts = objectPoints(obj);
  if (pts.length < 2) return null;
  const scaled = pts.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));
  const peri = perimeterPx(scaled) / scale;
  return positiveFinite(peri) ? peri : null;
}

export function resolveCeilingHeightM(obj: RoomGeometryObject): number | null {
  const h = obj.data?.ceilingHeightM ?? obj.data?.heightM;
  return positiveFinite(h) ? h : null;
}

/** Wall area (perimeter × ceiling) when both are known — otherwise null. */
export function resolveWallAreaM2(
  obj: RoomGeometryObject,
  pxPerMetre = DEFAULT_PX_PER_METRE,
): number | null {
  const height = resolveCeilingHeightM(obj);
  const peri = resolveRoomPerimeterM(obj, pxPerMetre);
  if (!height || !peri) return null;
  const area = peri * height;
  return positiveFinite(area) ? area : null;
}

export function roomLabel(obj: RoomGeometryObject): string {
  const data = obj.data;
  const name =
    (typeof data?.label === "string" && data.label.trim()) ||
    (typeof data?.name === "string" && data.name.trim()) ||
    (typeof data?.roomType === "string" && data.roomType.trim()) ||
    "";
  return name || "Room";
}
