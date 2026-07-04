/**
 * Absolute (scene-coordinate) geometry recovery for transformed fabric objects.
 *
 * Fabric keeps a Line's x1..y2 and a Polygon's points in the object's LOCAL
 * frame — they never update on move/scale/rotate; only the object's transform
 * matrix changes. Reading them raw after a drag/resize yields stale creation
 * coordinates (the RA-6990 bug: skewed footprint dimension lines). These
 * helpers transform the local geometry by the object's matrix to recover the
 * true scene coordinates.
 *
 * Pure — the 2x3 matrix multiply is inlined rather than importing fabric.util,
 * so this module stays testable in plain Node with no canvas/DOM.
 */

import type { Point } from "./tool-objects";

type Mat = [number, number, number, number, number, number];

/** Inline of fabric.util.transformPoint: apply a 2x3 affine matrix to a point. */
const transformPoint = (p: Point, m: Mat): Point => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});

/**
 * Absolute endpoints of a (possibly moved/scaled/rotated) wall line.
 * Plain point bags without a transform ({x1, y1, x2, y2}) pass through
 * unchanged; non-line objects return null.
 */
export function wallAbsoluteSegment(
  wallObj: unknown,
): { a: Point; b: Point } | null {
  const lo = wallObj as {
    calcLinePoints?: () => { x1: number; y1: number; x2: number; y2: number };
    calcTransformMatrix?: () => Mat;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  };
  if (lo.calcLinePoints && lo.calcTransformMatrix) {
    const p = lo.calcLinePoints();
    const m = lo.calcTransformMatrix();
    return {
      a: transformPoint({ x: p.x1, y: p.y1 }, m),
      b: transformPoint({ x: p.x2, y: p.y2 }, m),
    };
  }
  if (lo.x1 !== undefined) {
    return {
      a: { x: lo.x1, y: lo.y1 ?? 0 },
      b: { x: lo.x2 ?? 0, y: lo.y2 ?? 0 },
    };
  }
  return null;
}

/**
 * Absolute vertices of a (possibly moved/scaled/rotated) room polygon.
 * Fabric stores Polygon.points relative to pathOffset; transform by the
 * object's matrix — same recovery wallAbsoluteSegment() does for lines.
 * Plain point bags without a transform pass through unchanged; objects
 * without points return null.
 */
export function polygonAbsolutePoints(polyObj: unknown): Point[] | null {
  const po = polyObj as {
    points?: Point[];
    pathOffset?: Point;
    calcTransformMatrix?: () => Mat;
  };
  const pts = po.points;
  if (!pts) return null;
  const off = po.pathOffset;
  if (po.calcTransformMatrix && off) {
    const m = po.calcTransformMatrix();
    return pts.map((pt) => transformPoint({ x: pt.x - off.x, y: pt.y - off.y }, m));
  }
  return pts;
}

/**
 * All measured-geometry points (absolute scene coords) across canvas objects —
 * the input set for the overall footprint dimensions. Skips text/label
 * decorations and objects with no data tag; polygon rooms contribute their
 * vertices, wall/measure lines their two endpoints, both transform-corrected.
 */
export function footprintAbsolutePoints(objects: unknown[]): Point[] {
  const allPoints: Point[] = [];
  for (const o of objects) {
    const d = (o as { data?: Record<string, unknown> }).data;
    if (
      !d ||
      d.type === "dim-label" ||
      d.type === "room-label" ||
      d.type === "text" ||
      d.type === "arrow" ||
      d.type === "photo" ||
      d.type === "guide"
    )
      continue;
    // Polygon rooms: extract absolute points (account for move/scale/rotate)
    const polyPts = polygonAbsolutePoints(o);
    if (polyPts) {
      for (const p of polyPts) allPoints.push(p);
      continue;
    }
    // Lines: absolute endpoints (account for move/scale/rotate)
    const wallSeg = wallAbsoluteSegment(o);
    if (wallSeg) {
      allPoints.push(wallSeg.a);
      allPoints.push(wallSeg.b);
    }
  }
  return allPoints;
}
