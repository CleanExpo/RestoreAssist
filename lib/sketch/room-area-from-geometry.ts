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

import { isOperatorMeasuredProvenance } from "./measured-provenance";

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
    /** RA-8237 — see resolveRoomQuantities. */
    areaSource?: string;
    /** RA-8237 — floor scale when L × W was typed (areaSource "dimensions"). */
    dimensionsPxPerMetre?: number;
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
  // RA-7611: allow-list with missing-tag fallback. ai_suggested /
  // underlay_reference / unknown tags never bill; untagged still does.
  if (!isOperatorMeasuredProvenance(obj.data?.provenance)) return false;
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
 * RA-8237 — where a room's billed quantities come from.
 *
 * - `geometry`: the drawn polygon (local points × transform scale) at the
 *   floor's calibrated px-per-metre.
 * - `dimensions`: technician-typed length × width on a rectangle.
 * - `claimed`: a persisted `data.areaM2` with no source tag (legacy blobs).
 */
export type RoomQuantitySource = "geometry" | "dimensions" | "claimed";

/** `data.areaSource` written by every editor path that sets a room's size. */
export const GEOMETRY_AREA_SOURCE = "geometry" as const;
export const DIMENSIONS_AREA_SOURCE = "dimensions" as const;

export interface RoomQuantities {
  areaM2: number | null;
  perimeterM: number | null;
  source: RoomQuantitySource | null;
}

/** Relative tolerance for "the claimed area matches the drawn polygon". */
const CLAIM_AGREES_REL = 0.05;
/** Relative tolerance for "each side is still the typed length / width". */
const RECT_SIDE_REL = 0.02;

function transformScale(obj: RoomGeometryObject): { sx: number; sy: number } {
  const sx =
    typeof obj.scaleX === "number" && Number.isFinite(obj.scaleX) ? obj.scaleX : 1;
  const sy =
    typeof obj.scaleY === "number" && Number.isFinite(obj.scaleY) ? obj.scaleY : 1;
  return { sx, sy };
}

function scaledPoints(obj: RoomGeometryObject): { x: number; y: number }[] {
  const { sx, sy } = transformScale(obj);
  return objectPoints(obj).map((p) => ({ x: p.x * sx, y: p.y * sy }));
}

/**
 * Area and perimeter of the drawn shape at the floor scale, or null when the
 * object has no usable polygon (>= 3 points) or width × height box.
 */
export function geometryQuantities(
  obj: RoomGeometryObject,
  pxPerMetre = DEFAULT_PX_PER_METRE,
): { areaM2: number; perimeterM: number } | null {
  const scale = positiveFinite(pxPerMetre) ? pxPerMetre : DEFAULT_PX_PER_METRE;
  const pts = scaledPoints(obj);
  if (pts.length >= 3) {
    const areaM2 = shoelacePx2(pts) / (scale * scale);
    const perimeterM = perimeterPx(pts) / scale;
    if (positiveFinite(areaM2) && positiveFinite(perimeterM)) {
      return { areaM2, perimeterM };
    }
    return null;
  }
  if (pts.length === 0 && positiveFinite(obj.width) && positiveFinite(obj.height)) {
    const { sx, sy } = transformScale(obj);
    const w = Math.abs(obj.width * sx);
    const h = Math.abs(obj.height * sy);
    const areaM2 = (w * h) / (scale * scale);
    const perimeterM = (2 * (w + h)) / scale;
    if (positiveFinite(areaM2) && positiveFinite(perimeterM)) {
      return { areaM2, perimeterM };
    }
  }
  return null;
}

/**
 * True when the polygon is still the axis-aligned L × W rectangle the
 * technician typed, measured at the scale it was typed at
 * (`data.dimensionsPxPerMetre`, else the current floor scale). A later
 * recalibration keeps it; any reshape or resize does not.
 */
function polygonIsTypedRectangle(
  obj: RoomGeometryObject,
  lengthM: number,
  widthM: number,
  pxPerMetre: number,
): boolean {
  const pts = scaledPoints(obj);
  if (pts.length !== 4) return false;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (!(bw > 0) || !(bh > 0)) return false;
  const tol = Math.max(bw, bh) * 0.01;
  for (const p of pts) {
    const onV = Math.abs(p.x - minX) <= tol || Math.abs(p.x - maxX) <= tol;
    const onH = Math.abs(p.y - minY) <= tol || Math.abs(p.y - maxY) <= tol;
    if (!onV || !onH) return false;
  }
  const typedAt = positiveFinite(obj.data?.dimensionsPxPerMetre)
    ? obj.data.dimensionsPxPerMetre
    : positiveFinite(pxPerMetre)
      ? pxPerMetre
      : DEFAULT_PX_PER_METRE;
  const wM = bw / typedAt;
  const hM = bh / typedAt;
  const close = (a: number, b: number) => Math.abs(a - b) <= b * RECT_SIDE_REL;
  return (
    (close(wM, lengthM) && close(hM, widthM)) ||
    (close(wM, widthM) && close(hM, lengthM))
  );
}

/**
 * RA-8237 — the one place a room's floor area and perimeter are resolved.
 * Area and perimeter always come from the same source.
 *
 * 1. `areaSource: "dimensions"` with L × W, while the polygon is still that
 *    rectangle at the scale it was typed at: L × W and 2(L + W). Typed metres are an
 *    independent measurement, so recalibrating the floor does not move them.
 * 2. `areaSource: "geometry"` (or a typed rectangle since reshaped or resized): the
 *    polygon at the floor scale. The cached `areaM2` is display only, so
 *    recalibration, undo/redo and reload re-derive the same figure.
 * 3. Untagged legacy room with a claimed `areaM2` (RA-7572): the claim. Its
 *    perimeter is `perimeterM`, else the polygon perimeter rescaled to the
 *    claimed area (shape kept), else 2(L + W) when there is no polygon.
 * 4. Untagged without a claim: the polygon; L × W only when there is no
 *    polygon at all. A bounding box never stands in for an irregular room.
 */
export function resolveRoomQuantities(
  obj: RoomGeometryObject,
  pxPerMetre = DEFAULT_PX_PER_METRE,
): RoomQuantities {
  const data = obj.data;
  const geom = geometryQuantities(obj, pxPerMetre);
  const lengthM = positiveFinite(data?.lengthM) ? data.lengthM : null;
  const widthM = positiveFinite(data?.widthM) ? data.widthM : null;
  const tag = data?.areaSource;

  if (tag === DIMENSIONS_AREA_SOURCE && lengthM !== null && widthM !== null) {
    if (!geom || polygonIsTypedRectangle(obj, lengthM, widthM, pxPerMetre)) {
      return {
        areaM2: lengthM * widthM,
        perimeterM: 2 * (lengthM + widthM),
        source: "dimensions",
      };
    }
  }
  if ((tag === GEOMETRY_AREA_SOURCE || tag === DIMENSIONS_AREA_SOURCE) && geom) {
    return { ...geom, source: "geometry" };
  }

  if (positiveFinite(data?.areaM2)) {
    const claimed = data.areaM2;
    let perimeterM: number | null = null;
    if (positiveFinite(data?.perimeterM)) {
      perimeterM = data.perimeterM;
    } else if (geom) {
      const agrees =
        Math.abs(claimed - geom.areaM2) <= geom.areaM2 * CLAIM_AGREES_REL;
      perimeterM = agrees
        ? geom.perimeterM
        : geom.perimeterM * Math.sqrt(claimed / geom.areaM2);
    } else if (lengthM !== null && widthM !== null) {
      perimeterM = 2 * (lengthM + widthM);
    }
    return { areaM2: claimed, perimeterM, source: "claimed" };
  }

  if (geom) return { ...geom, source: "geometry" };
  if (lengthM !== null && widthM !== null) {
    return {
      areaM2: lengthM * widthM,
      perimeterM: 2 * (lengthM + widthM),
      source: "dimensions",
    };
  }
  return { areaM2: null, perimeterM: null, source: null };
}

/**
 * Floor area in m², or null when the object has no usable geometry.
 * See resolveRoomQuantities for the precedence.
 */
export function resolveRoomAreaM2(
  obj: RoomGeometryObject,
  pxPerMetre = DEFAULT_PX_PER_METRE,
): number | null {
  return resolveRoomQuantities(obj, pxPerMetre).areaM2;
}

/**
 * RA-8237 — the size fields an editor path writes when it sets a room from
 * its drawing: area at the floor's calibrated scale, tagged as geometry (a
 * typed rectangle keeps its `dimensions` tag). Used by AI import and by
 * Confirm, so a cached figure computed at another scale cannot be promoted.
 * Null when the shape has no usable area.
 */
export function canonicalRoomAreaFields(
  obj: RoomGeometryObject,
  pxPerMetre = DEFAULT_PX_PER_METRE,
): { areaM2: number; areaSource: "geometry" | "dimensions" } | null {
  const tag =
    obj.data?.areaSource === DIMENSIONS_AREA_SOURCE
      ? DIMENSIONS_AREA_SOURCE
      : GEOMETRY_AREA_SOURCE;
  const q = resolveRoomQuantities(
    { ...obj, data: { ...(obj.data ?? {}), areaSource: tag } },
    pxPerMetre,
  );
  if (!positiveFinite(q.areaM2) || (q.source !== "geometry" && q.source !== "dimensions")) {
    return null;
  }
  return { areaM2: Math.round(q.areaM2 * 100) / 100, areaSource: q.source };
}

/**
 * RA-8241 — homeowner / client-origin blobs may lie about m². Promotion and
 * billing guards must derive area from the drawn polygon only.
 */
export function areaM2FromGeometryOnly(
  obj: RoomGeometryObject,
  pxPerMetre = DEFAULT_PX_PER_METRE,
): number | null {
  const data = obj.data;
  const stripped: RoomGeometryObject = {
    ...obj,
    data: data
      ? {
          ...data,
          areaM2: undefined,
          lengthM: undefined,
          widthM: undefined,
          areaSource: undefined,
        }
      : undefined,
  };
  return resolveRoomAreaM2(stripped, pxPerMetre);
}

export function resolveRoomPerimeterM(
  obj: RoomGeometryObject,
  pxPerMetre = DEFAULT_PX_PER_METRE,
): number | null {
  return resolveRoomQuantities(obj, pxPerMetre).perimeterM;
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
