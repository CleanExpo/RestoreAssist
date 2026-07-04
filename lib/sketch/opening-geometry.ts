/**
 * RA-6841 [A2] — pure geometry helpers for door + window architectural symbols.
 *
 * All functions are Fabric-free and DOM-free so they can be unit-tested
 * deterministically. The canvas only materialises the returned descriptors.
 *
 * Coordinate convention: canvas y-axis points downward (standard screen coords).
 *
 * Scale contract: same as tool-objects.ts — 100px = 1 m (DEFAULT_PX_PER_METRE).
 * All functions accept `pxPerMetre` so tests and a calibrated canvas can vary
 * the scale without touching any constant.
 *
 * Provenance firewall (A0): openings carry `data.type: "opening"` and are
 * EXCLUDED from measured area by totalMeasuredFloorAreaM2 (which only sums
 * type === "room" elements).
 */

export interface Point {
  x: number;
  y: number;
}

// ─── Wall-snap helpers ────────────────────────────────────────────────────────

export interface WallSegment {
  a: Point;
  b: Point;
}

/**
 * Project `p` onto the line defined by `seg`, returning the nearest point ON
 * the segment (clamped to [0, 1] in parametric space).
 *
 * Used to snap an opening's anchor to the host wall centerline.
 */
export function projectPointOntoSegment(p: Point, seg: WallSegment): Point {
  const dx = seg.b.x - seg.a.x;
  const dy = seg.b.y - seg.a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: seg.a.x, y: seg.a.y };
  const t = Math.max(0, Math.min(1, ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / lenSq));
  return { x: seg.a.x + t * dx, y: seg.a.y + t * dy };
}

/**
 * Snap `p` to the nearest wall in `walls`.
 * Returns the projected anchor point and the index of the closest wall.
 * Returns null when `walls` is empty.
 */
export function snapToNearestWall(
  p: Point,
  walls: WallSegment[],
): { anchor: Point; wallIndex: number } | null {
  if (walls.length === 0) return null;
  let bestDist = Infinity;
  let bestAnchor: Point = p;
  let bestIdx = 0;
  for (let i = 0; i < walls.length; i++) {
    const projected = projectPointOntoSegment(p, walls[i]);
    const d = Math.hypot(projected.x - p.x, projected.y - p.y);
    if (d < bestDist) {
      bestDist = d;
      bestAnchor = projected;
      bestIdx = i;
    }
  }
  return { anchor: bestAnchor, wallIndex: bestIdx };
}

// ─── Opening cut (shared by door + window) ────────────────────────────────────

/**
 * Compute the two endpoints of an opening cut on a wall segment.
 *
 * The opening is centered on `anchor` and has width `widthM` metres. If
 * `anchor` would place the cut outside the segment the result is clamped so
 * both endpoints remain on the segment.
 *
 * Returns `[startPt, endPt]` in canvas coordinates, ordered along the segment
 * direction (a → b).
 */
export function openingCutEndpoints(
  anchor: Point,
  wall: WallSegment,
  widthM: number,
  pxPerMetre: number,
): [Point, Point] {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const wallLenPx = Math.hypot(dx, dy);
  if (wallLenPx === 0) {
    return [{ ...anchor }, { ...anchor }];
  }
  const ux = dx / wallLenPx; // unit vector along wall
  const uy = dy / wallLenPx;

  const halfWidthPx = (widthM * pxPerMetre) / 2;

  // Parametric position of anchor along wall
  const tAnchor =
    ((anchor.x - wall.a.x) * ux + (anchor.y - wall.a.y) * uy);

  // Clamp so both endpoints stay on the segment
  const tStart = Math.max(0, tAnchor - halfWidthPx);
  const tEnd = Math.min(wallLenPx, tAnchor + halfWidthPx);

  return [
    { x: wall.a.x + tStart * ux, y: wall.a.y + tStart * uy },
    { x: wall.a.x + tEnd * ux, y: wall.a.y + tEnd * uy },
  ];
}

// ─── Door geometry ────────────────────────────────────────────────────────────

export type HingeSide = "left" | "right";

export interface DoorGeometry {
  /** The opening cut: two endpoints on the wall centerline. */
  cutStart: Point;
  cutEnd: Point;
  /** Door leaf: line from hinge point to free corner. */
  hingePoint: Point;
  freeCorner: Point;
  /**
   * Swing arc: quarter-circle from hinge → freeCorner sweep 90° toward the
   * interior. Represented as the center + two end-points so the canvas can
   * render it as a Fabric.js Path arc.
   */
  arcCenter: Point;
  arcStart: Point;
  arcEnd: Point;
  /** Radius of the swing arc in canvas px. */
  arcRadiusPx: number;
  /**
   * SVG-style arc sweep: 1 = clockwise, 0 = counter-clockwise.
   * Computed from the hinge side and wall direction so the arc always swings
   * into the open space (interior of the room).
   */
  arcSweep: 0 | 1;
}

/**
 * Compute all geometry needed to render an architectural door symbol:
 *   - opening cut (gap in the wall band)
 *   - door leaf (line from hinge to free edge)
 *   - swing arc (quarter-circle swept 90°)
 *
 * `hingeSide` = "left" means the hinge is at `cutStart` (the first endpoint
 * along the wall direction a → b); "right" means the hinge is at `cutEnd`.
 *
 * The swing arc is rendered on the interior side, which for a standard door
 * into a room is opposite to the wall normal. Here we always swing 90° into
 * the space perpendicular to the wall.
 */
export function doorGeometry(
  anchor: Point,
  wall: WallSegment,
  widthM: number,
  pxPerMetre: number,
  hingeSide: HingeSide = "left",
): DoorGeometry {
  const [cutStart, cutEnd] = openingCutEndpoints(anchor, wall, widthM, pxPerMetre);

  // Wall direction (unit vector a → b)
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const wallLen = Math.hypot(dx, dy);
  const ux = wallLen > 0 ? dx / wallLen : 1;
  const uy = wallLen > 0 ? dy / wallLen : 0;

  const hingePoint = hingeSide === "left" ? { ...cutStart } : { ...cutEnd };
  const leafEnd = hingeSide === "left" ? { ...cutEnd } : { ...cutStart };
  const leafWidthPx = Math.hypot(leafEnd.x - hingePoint.x, leafEnd.y - hingePoint.y);

  // Arc sweeps 90° perpendicular to the wall (into the room interior).
  // Perpendicular CCW: (-uy, ux). We choose this direction for the arc end.
  // arcStart = leafEnd (open door leaf end), arcEnd = perpendicular to hinge.
  const freeCorner = { ...leafEnd };
  const arcCenter = { ...hingePoint };
  const arcStart = { ...freeCorner };

  // The arc endpoint is hingePoint + radius * perpendicular direction.
  // Perpendicular rotated 90° CCW from the wall direction: (-uy, ux).
  // For "right" hinge we flip because the leaf goes the other way.
  const perpSign = hingeSide === "left" ? 1 : -1;
  const arcEnd = {
    x: hingePoint.x + leafWidthPx * (-uy) * perpSign,
    y: hingePoint.y + leafWidthPx * ux * perpSign,
  };

  // SVG arc sweep: clockwise (1) for left hinge, counter-clockwise (0) for right.
  const arcSweep: 0 | 1 = hingeSide === "left" ? 1 : 0;

  return {
    cutStart,
    cutEnd,
    hingePoint,
    freeCorner,
    arcCenter,
    arcStart,
    arcEnd,
    arcRadiusPx: leafWidthPx,
    arcSweep,
  };
}

/**
 * Build the SVG path string for a door's swing arc (quarter-circle).
 * Used by Fabric.js `Path` constructor.
 *
 * Format: "M startX startY A rx ry 0 0 sweep endX endY"
 * (large-arc-flag = 0 because it is always a quarter circle, i.e. < 180°)
 */
export function doorArcPath(geom: DoorGeometry): string {
  const r = geom.arcRadiusPx;
  const { arcStart: s, arcEnd: e, arcSweep } = geom;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 0 ${arcSweep} ${e.x} ${e.y}`;
}

// ─── Window geometry ──────────────────────────────────────────────────────────

export interface WindowGeometry {
  /** The opening cut: two endpoints on the wall centerline. */
  cutStart: Point;
  cutEnd: Point;
  /**
   * Glazing lines: three parallel lines perpendicular to the wall band —
   * one at each edge of the opening and one at the midpoint. Each is a pair
   * of [start, end] points crossing the wall band (offset ±halfBandPx from
   * the centerline).
   */
  glazingLines: [Point, Point][];
}

/**
 * Compute all geometry for an architectural window symbol:
 *   - opening cut (gap in the wall band)
 *   - three glazing lines across the wall thickness (standard glazing symbol)
 *
 * `wallThicknessPx` is the rendered wall band width (stroke width of the wall
 * line). The glazing lines span the full band.
 */
export function windowGeometry(
  anchor: Point,
  wall: WallSegment,
  widthM: number,
  pxPerMetre: number,
  wallThicknessPx: number,
): WindowGeometry {
  const [cutStart, cutEnd] = openingCutEndpoints(anchor, wall, widthM, pxPerMetre);

  // Wall direction (unit vector a → b)
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const wallLen = Math.hypot(dx, dy);
  const ux = wallLen > 0 ? dx / wallLen : 1;
  const uy = wallLen > 0 ? dy / wallLen : 0;

  // Perpendicular unit vector (90° CCW from wall direction)
  const px = -uy;
  const py = ux;

  const half = wallThicknessPx / 2;

  // Three glazing lines at: cutStart, midpoint, cutEnd
  const mid = {
    x: (cutStart.x + cutEnd.x) / 2,
    y: (cutStart.y + cutEnd.y) / 2,
  };
  const anchors = [cutStart, mid, cutEnd];

  const glazingLines: [Point, Point][] = anchors.map((pt) => [
    { x: pt.x + px * half, y: pt.y + py * half },
    { x: pt.x - px * half, y: pt.y - py * half },
  ]);

  return { cutStart, cutEnd, glazingLines };
}
