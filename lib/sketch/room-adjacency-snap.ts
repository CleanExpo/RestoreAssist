/**
 * Room adjacency snap — when dragging a room near another, snap a shared
 * edge and expose a join segment for the green adjacency cue.
 *
 * Inspiration: magicplan assemble; RestoreAssist styling (not Encircle clone).
 */

export interface Point {
  x: number;
  y: number;
}

export interface RoomEdgeRef {
  roomId: string;
  edgeIndex: number;
  a: Point;
  b: Point;
}

export interface AdjacencySnapResult {
  snapped: boolean;
  /** Translation to apply to the moving room so edges coincide. */
  dx: number;
  dy: number;
  /** Overlapping shared-edge segment for the green join indicator. */
  join: { a: Point; b: Point } | null;
}

/** Default snap distance in canvas pixels — generous enough for field drag. */
export const ADJACENCY_SNAP_PX = 18;

/** Minimum overlapping shared-edge length (px) before the green join cue fires. */
export const ADJACENCY_MIN_JOIN_PX = 24;

type Axis = "h" | "v";

function edgeAxis(e: RoomEdgeRef): Axis | null {
  const dx = Math.abs(e.b.x - e.a.x);
  const dy = Math.abs(e.b.y - e.a.y);
  if (dx < 1e-6 && dy < 1e-6) return null;
  if (dx >= dy * 4) return "h";
  if (dy >= dx * 4) return "v";
  return null;
}

function overlap1d(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): { lo: number; hi: number } | null {
  const lo = Math.max(Math.min(a0, a1), Math.min(b0, b1));
  const hi = Math.min(Math.max(a0, a1), Math.max(b0, b1));
  if (hi - lo < 1e-3) return null;
  return { lo, hi };
}

/**
 * Find the best shared-edge snap between a moving room's edges and stationary
 * rooms. Prefers the smallest absolute translation within `thresholdPx`.
 */
export function findRoomAdjacencySnap(
  movingEdges: ReadonlyArray<RoomEdgeRef>,
  stationaryEdges: ReadonlyArray<RoomEdgeRef>,
  thresholdPx: number = ADJACENCY_SNAP_PX,
): AdjacencySnapResult {
  const none: AdjacencySnapResult = {
    snapped: false,
    dx: 0,
    dy: 0,
    join: null,
  };
  if (!(thresholdPx > 0) || movingEdges.length === 0 || stationaryEdges.length === 0) {
    return none;
  }

  let best:
    | {
        score: number;
        dx: number;
        dy: number;
        join: { a: Point; b: Point };
      }
    | null = null;

  for (const m of movingEdges) {
    const mAxis = edgeAxis(m);
    if (!mAxis) continue;
    for (const s of stationaryEdges) {
      if (s.roomId === m.roomId) continue;
      const sAxis = edgeAxis(s);
      if (sAxis !== mAxis) continue;

      if (mAxis === "v") {
        // Vertical edges: snap in X; join along overlapping Y span.
        const mx = (m.a.x + m.b.x) / 2;
        const sx = (s.a.x + s.b.x) / 2;
        const dx = sx - mx;
        if (Math.abs(dx) > thresholdPx) continue;
        const ov = overlap1d(m.a.y, m.b.y, s.a.y, s.b.y);
        if (!ov || ov.hi - ov.lo < ADJACENCY_MIN_JOIN_PX) continue;
        const score = Math.abs(dx);
        if (!best || score < best.score) {
          best = {
            score,
            dx,
            dy: 0,
            join: { a: { x: sx, y: ov.lo }, b: { x: sx, y: ov.hi } },
          };
        }
      } else {
        // Horizontal edges: snap in Y; join along overlapping X span.
        const my = (m.a.y + m.b.y) / 2;
        const sy = (s.a.y + s.b.y) / 2;
        const dy = sy - my;
        if (Math.abs(dy) > thresholdPx) continue;
        const ov = overlap1d(m.a.x, m.b.x, s.a.x, s.b.x);
        if (!ov || ov.hi - ov.lo < ADJACENCY_MIN_JOIN_PX) continue;
        const score = Math.abs(dy);
        if (!best || score < best.score) {
          best = {
            score,
            dx: 0,
            dy,
            join: { a: { x: ov.lo, y: sy }, b: { x: ov.hi, y: sy } },
          };
        }
      }
    }
  }

  if (!best) return none;
  return {
    snapped: true,
    dx: best.dx,
    dy: best.dy,
    join: best.join,
  };
}
