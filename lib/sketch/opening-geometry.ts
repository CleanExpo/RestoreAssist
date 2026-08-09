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

/**
 * RA-6980 [A2b] — parametric position of `p` along `seg`, clamped to [0, 1].
 *
 * `p` is first projected onto the segment, so off-wall points map to the
 * position of their nearest point on the wall. Stored on an opening at
 * placement time so the opening can re-anchor when its host wall later moves.
 * Returns 0 for a zero-length segment.
 */
export function parametricPositionOnSegment(p: Point, seg: WallSegment): number {
  const dx = seg.b.x - seg.a.x;
  const dy = seg.b.y - seg.a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  const t = ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / lenSq;
  return Math.max(0, Math.min(1, t));
}

/**
 * RA-6980 [A2b] — the point at parametric position `t` along `seg`.
 * Inverse of {@link parametricPositionOnSegment}: re-derives an opening's
 * anchor on the host wall's new segment after the wall is moved/resized.
 */
export function pointAtParametric(t: number, seg: WallSegment): Point {
  return {
    x: seg.a.x + t * (seg.b.x - seg.a.x),
    y: seg.a.y + t * (seg.b.y - seg.a.y),
  };
}

/**
 * Resize a wall-hosted opening by dragging one end handle along the host wall
 * (Xactimate / magicplan red-diamond pattern).
 *
 * The opposite end stays fixed; the dragged handle projects onto the wall and
 * the new width + center parametric `t` are derived. Width is clamped so both
 * ends remain on the segment and never shrink below `minWidthM`.
 */
export function resizeOpeningAlongWall(input: {
  wall: WallSegment;
  hostWallT: number;
  widthM: number;
  pxPerMetre: number;
  /** Which cut endpoint the user is dragging. */
  handle: "start" | "end";
  pointer: Point;
  minWidthM?: number;
}): { widthM: number; hostWallT: number; anchor: Point } {
  const {
    wall,
    hostWallT,
    widthM,
    pxPerMetre,
    handle,
    pointer,
    minWidthM = 0.3,
  } = input;
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const wallLenPx = Math.hypot(dx, dy);
  const scale = pxPerMetre || 100;
  if (wallLenPx < 1) {
    const anchor = pointAtParametric(hostWallT, wall);
    return { widthM, hostWallT, anchor };
  }

  const [cutStart, cutEnd] = openingCutEndpoints(
    pointAtParametric(hostWallT, wall),
    wall,
    widthM,
    scale,
  );
  const fixed = handle === "start" ? cutEnd : cutStart;
  const dragged = projectPointOntoSegment(pointer, wall);

  // Parametric distances in px along the wall (a → b).
  const tFixed =
    ((fixed.x - wall.a.x) * dx + (fixed.y - wall.a.y) * dy) / wallLenPx;
  let tDrag =
    ((dragged.x - wall.a.x) * dx + (dragged.y - wall.a.y) * dy) / wallLenPx;
  tDrag = Math.max(0, Math.min(wallLenPx, tDrag));

  const minPx = minWidthM * scale;
  let tLo = Math.min(tFixed, tDrag);
  let tHi = Math.max(tFixed, tDrag);
  if (tHi - tLo < minPx) {
    // Keep the fixed end; push the free end just enough for min width.
    if (handle === "start") {
      tLo = Math.max(0, tFixed - minPx);
      tHi = tFixed;
      if (tHi - tLo < minPx) tHi = Math.min(wallLenPx, tLo + minPx);
    } else {
      tHi = Math.min(wallLenPx, tFixed + minPx);
      tLo = tFixed;
      if (tHi - tLo < minPx) tLo = Math.max(0, tHi - minPx);
    }
  }

  const newWidthM = Math.round(((tHi - tLo) / scale) * 100) / 100;
  const midT = (tLo + tHi) / 2 / wallLenPx; // normalize to [0,1]
  const hostT = Math.max(0, Math.min(1, midT));
  const anchor = pointAtParametric(hostT, wall);
  return { widthM: Math.max(minWidthM, newWidthM), hostWallT: hostT, anchor };
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

/**
 * Perpendicular jamb ticks at each opening cut end so the wall band reads as
 * terminated (Matterport / Encircle opening convention) rather than a floating
 * white stripe over a continuous stroke.
 */
export function openingJambLines(
  cutStart: Point,
  cutEnd: Point,
  wallThicknessPx: number,
): [[Point, Point], [Point, Point]] {
  const dx = cutEnd.x - cutStart.x;
  const dy = cutEnd.y - cutStart.y;
  const len = Math.hypot(dx, dy);
  const ux = len > 0 ? dx / len : 1;
  const uy = len > 0 ? dy / len : 0;
  const px = -uy;
  const py = ux;
  const half = Math.max(1, wallThicknessPx / 2);
  const jambAt = (pt: Point): [Point, Point] => [
    { x: pt.x + px * half, y: pt.y + py * half },
    { x: pt.x - px * half, y: pt.y - py * half },
  ];
  return [jambAt(cutStart), jambAt(cutEnd)];
}

export interface OpeningCutInterval {
  /** Parametric start along the host wall in [0, 1]. */
  t0: number;
  /** Parametric end along the host wall in [0, 1]. */
  t1: number;
}

/**
 * Split a wall centerline into solid segments that remain after openings cut
 * gaps. Used for continuous wall behaviour: doors/windows punch holes so the
 * remaining pieces can be drawn as separate bands.
 *
 * Openings that fall outside [0,1] or have zero width are ignored. Overlapping
 * cuts are merged before splitting.
 */
export function wallSolidSegments(
  wall: WallSegment,
  openings: ReadonlyArray<OpeningCutInterval>,
): WallSegment[] {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const wallLen = Math.hypot(dx, dy);
  if (wallLen < 1e-6) return [];

  const cuts = openings
    .map((o) => {
      const a = Math.max(0, Math.min(1, Math.min(o.t0, o.t1)));
      const b = Math.max(0, Math.min(1, Math.max(o.t0, o.t1)));
      return { t0: a, t1: b };
    })
    .filter((o) => o.t1 - o.t0 > 1e-6)
    .sort((a, b) => a.t0 - b.t0);

  // Merge overlapping / abutting cuts.
  const merged: OpeningCutInterval[] = [];
  for (const c of cuts) {
    const last = merged[merged.length - 1];
    if (!last || c.t0 > last.t1) merged.push({ ...c });
    else last.t1 = Math.max(last.t1, c.t1);
  }

  const solids: WallSegment[] = [];
  let cursor = 0;
  for (const c of merged) {
    if (c.t0 > cursor + 1e-6) {
      solids.push({
        a: pointAtParametric(cursor, wall),
        b: pointAtParametric(c.t0, wall),
      });
    }
    cursor = Math.max(cursor, c.t1);
  }
  if (cursor < 1 - 1e-6) {
    solids.push({
      a: pointAtParametric(cursor, wall),
      b: pointAtParametric(1, wall),
    });
  }
  return solids;
}

/**
 * Build an OpeningCutInterval from a placed opening's hostWallT + width.
 */
export function openingCutInterval(
  hostWallT: number,
  widthM: number,
  wall: WallSegment,
  pxPerMetre: number,
): OpeningCutInterval {
  const wallLenPx = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  if (wallLenPx < 1e-6) return { t0: hostWallT, t1: hostWallT };
  const half = (widthM * (pxPerMetre || 100)) / 2 / wallLenPx;
  return {
    t0: Math.max(0, hostWallT - half),
    t1: Math.min(1, hostWallT + half),
  };
}
