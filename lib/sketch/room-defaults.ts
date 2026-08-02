/**
 * Room-first placement defaults + typed L×W helpers (Xactimate mobile pattern).
 *
 * Field techs place a sensible rectangular room in one tap, then type exact
 * length × width. Pure / Fabric-free so unit tests and SketchCanvas share one
 * geometry contract.
 */
import { DEFAULT_PX_PER_METRE, type Point } from "@/lib/sketch/tool-objects";
import { centroid } from "@/lib/sketch/geometry-utils";

/**
 * Xactimate mobile one-tap default is ~12′8″ × 12′8″.
 * 12 + 8/12 ft = 3.8608 m → rounded to centimetres for typed entry.
 */
export const DEFAULT_ROOM_SIDE_M = 3.86;

/** Pixel distance below which a room-tool drag is treated as a tap. */
export const ROOM_TAP_THRESHOLD_PX = 12;

export interface RoomDimsM {
  lengthM: number;
  widthM: number;
}

/**
 * Axis-aligned rectangle centered on `center`, length along X, width along Y.
 * Points are ordered clockwise starting top-left (screen y grows downward).
 */
export function rectRoomPoints(
  center: Point,
  lengthM: number,
  widthM: number,
  pxPerMetre = DEFAULT_PX_PER_METRE,
): Point[] {
  const scale = pxPerMetre || DEFAULT_PX_PER_METRE;
  const halfL = (Math.max(0.1, lengthM) * scale) / 2;
  const halfW = (Math.max(0.1, widthM) * scale) / 2;
  return [
    { x: center.x - halfL, y: center.y - halfW },
    { x: center.x + halfL, y: center.y - halfW },
    { x: center.x + halfL, y: center.y + halfW },
    { x: center.x - halfL, y: center.y + halfW },
  ];
}

/** Rectangle from drag diagonal (any two opposite corners), snapped axis-aligned. */
export function rectRoomPointsFromDiagonal(
  a: Point,
  b: Point,
): Point[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  // Degenerate drag → fall back to a 1px stub so callers still get 4 points;
  // the canvas should prefer tap-default when under ROOM_TAP_THRESHOLD_PX.
  const x1 = minX;
  const x2 = maxX === minX ? minX + 1 : maxX;
  const y1 = minY;
  const y2 = maxY === minY ? minY + 1 : maxY;
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
}

/**
 * Derive L×W for an axis-aligned (or near) 4-point room. Returns null for
 * irregular polygons so typed edit stays honest.
 */
export function roomLengthWidthM(
  points: Point[],
  pxPerMetre = DEFAULT_PX_PER_METRE,
): RoomDimsM | null {
  if (points.length !== 4) return null;
  const scale = pxPerMetre || DEFAULT_PX_PER_METRE;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // Reject clearly non-rect / rotated rooms (vertices far from AABB corners).
  const tol = 2; // px
  for (const p of points) {
    const onVertical = Math.abs(p.x - minX) <= tol || Math.abs(p.x - maxX) <= tol;
    const onHorizontal = Math.abs(p.y - minY) <= tol || Math.abs(p.y - maxY) <= tol;
    if (!onVertical || !onHorizontal) return null;
  }
  const lengthM = Math.round(((maxX - minX) / scale) * 100) / 100;
  const widthM = Math.round(((maxY - minY) / scale) * 100) / 100;
  if (lengthM < 0.1 || widthM < 0.1) return null;
  return { lengthM, widthM };
}

/**
 * Rebuild an axis-aligned room around its current centroid with new L×W.
 * Returns null when the existing polygon is not a typed-editable rectangle.
 */
export function resizeRectRoomFromDims(
  points: Point[],
  lengthM: number,
  widthM: number,
  pxPerMetre = DEFAULT_PX_PER_METRE,
): Point[] | null {
  if (roomLengthWidthM(points, pxPerMetre) === null) return null;
  const c = centroid(points);
  return rectRoomPoints(c, lengthM, widthM, pxPerMetre);
}

/**
 * Parse a typed metre string from the selection panel.
 * Accepts "3.86", "3,86", "3.86 m", "12'8\"" (feet-inches → metres).
 */
export function parseMetresInput(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  // Feet-inches: 12'8" or 12' 8" or 12ft 8in
  const ftIn = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft)\s*(\d+(?:\.\d+)?)\s*(?:"|in)?$/);
  if (ftIn) {
    const feet = parseFloat(ftIn[1]);
    const inches = parseFloat(ftIn[2]);
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
    const m = (feet + inches / 12) / 3.28084;
    return Math.round(m * 100) / 100;
  }

  // Bare feet: 12' or 12ft
  const ftOnly = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft)$/);
  if (ftOnly) {
    const m = parseFloat(ftOnly[1]) / 3.28084;
    return Math.round(m * 100) / 100;
  }

  const cleaned = s.replace(/,/g, ".").replace(/\s*m(etres?)?$/, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > 200) return null;
  return Math.round(n * 100) / 100;
}

/** Stable host-wall id for a room polygon edge (opening binding). */
export function hostWallIdForRoomEdge(roomId: string, edgeIndex: number): string {
  return `${roomId}:edge:${edgeIndex}`;
}

export function parseRoomEdgeHostWallId(
  hostWallId: string,
): { roomId: string; edgeIndex: number } | null {
  const m = hostWallId.match(/^(.+):edge:(\d+)$/);
  if (!m) return null;
  return { roomId: m[1], edgeIndex: parseInt(m[2], 10) };
}

/** Emit wall-like host segments for every edge of a room polygon. */
export function roomEdgeHostSegments(
  roomId: string,
  points: Point[],
): { wallId: string; seg: { a: Point; b: Point }; edgeIndex: number }[] {
  if (points.length < 2) return [];
  const out: {
    wallId: string;
    seg: { a: Point; b: Point };
    edgeIndex: number;
  }[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    out.push({
      wallId: hostWallIdForRoomEdge(roomId, i),
      seg: { a, b },
      edgeIndex: i,
    });
  }
  return out;
}
