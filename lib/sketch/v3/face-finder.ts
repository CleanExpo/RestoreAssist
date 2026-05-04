/**
 * face-finder.ts — derive interior rooms from a wall graph.
 *
 * Algorithm: planar straight-line graph → faces via the leftmost-turn
 * traversal. For each undirected wall we build two directed half-edges. Walk
 * each unvisited half-edge taking the most counter-clockwise next edge at every
 * vertex; the resulting cycle bounds a face. The single unbounded face (the
 * outside of the building) has the largest absolute area and is dropped.
 *
 * Output: ordered corner-id cycles plus area + centroid for each interior face.
 * The reducer caches these as `Room` rows; face-finder is the source of truth.
 */

import type { Corner, Floor, Wall } from "./wall-graph-types";
import { centroid as polygonCentroid, shoelaceAreaPx2 } from "../geometry-utils";

interface HalfEdge {
  /** Underlying wall id. */
  wallId: string;
  from: string;
  to: string;
  /** Angle in radians of the directed edge from `from` → `to`. */
  angle: number;
}

interface DerivedFace {
  cornerCycle: string[];
  areaPx2: number;
  signedAreaPx2: number;
  centroid: { x: number; y: number };
}

function halfEdgeKey(from: string, to: string): string {
  return `${from}→${to}`;
}

function angleOf(from: Corner, to: Corner): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Normalise an angle to [0, 2π).
 */
function norm2pi(a: number): number {
  const tau = 2 * Math.PI;
  let r = a % tau;
  if (r < 0) r += tau;
  return r;
}

/**
 * Pick the next half-edge at vertex `to`, taking the most counter-clockwise
 * turn relative to the incoming edge's reverse direction. This is the
 * "leftmost turn" rule that bounds an interior face.
 */
function pickNextEdge(
  incoming: HalfEdge,
  outgoing: HalfEdge[],
): HalfEdge | undefined {
  // Reverse direction of the incoming edge (we arrived at `to` from `from`,
  // so the reverse is the edge pointing back to `from`).
  const reverseAngle = norm2pi(incoming.angle + Math.PI);

  let best: HalfEdge | undefined;
  let bestDelta = -Infinity;
  for (const candidate of outgoing) {
    // Skip the reverse of the incoming edge — that would walk back the way we came.
    if (candidate.to === incoming.from) continue;
    // Counter-clockwise delta: how far CCW from `reverseAngle` is `candidate.angle`?
    const delta = norm2pi(candidate.angle - reverseAngle);
    if (delta > bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }
  return best;
}

/**
 * Find all closed faces in the planar wall graph.
 *
 * The algorithm visits each directed half-edge once. Faces are detected as
 * cycles. The unbounded outer face (largest absolute area) is dropped.
 */
export function findFaces(corners: Corner[], walls: Wall[]): DerivedFace[] {
  if (walls.length === 0) return [];

  const cornerById = new Map(corners.map((c) => [c.id, c]));
  const halfEdges: HalfEdge[] = [];
  const outgoingByCorner = new Map<string, HalfEdge[]>();

  for (const wall of walls) {
    const from = cornerById.get(wall.from);
    const to = cornerById.get(wall.to);
    if (!from || !to) continue;
    const fwd: HalfEdge = {
      wallId: wall.id,
      from: wall.from,
      to: wall.to,
      angle: norm2pi(angleOf(from, to)),
    };
    const rev: HalfEdge = {
      wallId: wall.id,
      from: wall.to,
      to: wall.from,
      angle: norm2pi(angleOf(to, from)),
    };
    halfEdges.push(fwd, rev);
    pushTo(outgoingByCorner, fwd.from, fwd);
    pushTo(outgoingByCorner, rev.from, rev);
  }

  const visited = new Set<string>();
  const faces: DerivedFace[] = [];

  for (const start of halfEdges) {
    const startKey = halfEdgeKey(start.from, start.to);
    if (visited.has(startKey)) continue;

    const cycleEdges: HalfEdge[] = [];
    let current: HalfEdge | undefined = start;
    let safety = 0;
    while (current && safety++ < 10_000) {
      const key = halfEdgeKey(current.from, current.to);
      if (visited.has(key)) {
        // Cycle re-entered an already-visited edge → not a clean face.
        cycleEdges.length = 0;
        break;
      }
      visited.add(key);
      cycleEdges.push(current);

      const outgoing = outgoingByCorner.get(current.to) ?? [];
      const next = pickNextEdge(current, outgoing);
      if (!next) break;
      if (
        next.from === start.from &&
        next.to === start.to
      ) {
        break; // returned to start half-edge → cycle closed
      }
      current = next;
    }

    if (cycleEdges.length < 3) continue;

    // Reconstruct the corner cycle from the directed edges.
    const cornerCycle = cycleEdges.map((e) => e.from);
    const points = cornerCycle.map((id) => {
      const c = cornerById.get(id)!;
      return { x: c.x, y: c.y };
    });

    const signed = signedShoelace(points);
    if (signed === 0) continue; // degenerate (collinear) face

    faces.push({
      cornerCycle,
      areaPx2: Math.abs(signed),
      signedAreaPx2: signed,
      centroid: polygonCentroid(points),
    });
  }

  if (faces.length === 0) return faces;

  // Drop the unbounded outer face. In a planar embedding, the outer face has
  // the largest absolute area AND winds clockwise (negative signed area) — but
  // signed-area sign depends on coordinate-system orientation. We rely on
  // largest-absolute-area, which is correct for any simple polygonal building.
  let outerIdx = 0;
  for (let i = 1; i < faces.length; i++) {
    if (faces[i].areaPx2 > faces[outerIdx].areaPx2) outerIdx = i;
  }
  faces.splice(outerIdx, 1);

  return faces;
}

/**
 * Produce a stable, hash-friendly room id from a corner cycle so re-runs of
 * face-finder don't churn persistent ids when topology is unchanged.
 */
export function cycleSignature(cornerCycle: string[]): string {
  if (cornerCycle.length === 0) return "";
  // Rotate so the lexicographically smallest id is first, then pick the
  // direction that yields the smaller string to make it orientation-stable.
  let minIdx = 0;
  for (let i = 1; i < cornerCycle.length; i++) {
    if (cornerCycle[i] < cornerCycle[minIdx]) minIdx = i;
  }
  const rotated = [
    ...cornerCycle.slice(minIdx),
    ...cornerCycle.slice(0, minIdx),
  ];
  const reversed = [rotated[0], ...rotated.slice(1).reverse()];
  return rotated.join("|") < reversed.join("|")
    ? rotated.join("|")
    : reversed.join("|");
}

/**
 * Compute derived rooms for a floor, ready to be cached on `FloorRoomV3`.
 * Existing room labels/types are preserved when the underlying cycle survives.
 */
export function deriveRooms(floor: Floor): Floor["rooms"] {
  const faces = findFaces(floor.corners, floor.walls);
  const existingBySig = new Map(
    floor.rooms.map((r) => [cycleSignature(r.cornerCycle), r]),
  );

  return faces.map((face, idx) => {
    const sig = cycleSignature(face.cornerCycle);
    const prior = existingBySig.get(sig);
    const areaM2 = face.areaPx2 / (floor.pxPerMetre * floor.pxPerMetre);

    return {
      id: prior?.id ?? `room_${sig.slice(0, 12)}_${idx}`,
      cornerCycle: face.cornerCycle,
      label: prior?.label ?? `Room ${idx + 1}`,
      roomType: prior?.roomType,
      areaM2,
      centroid: face.centroid,
      metadata: prior?.metadata,
    };
  });
}

/* ─── internal helpers ───────────────────────────────────────────────────── */

function pushTo<K, V>(m: Map<K, V[]>, key: K, value: V): void {
  const arr = m.get(key);
  if (arr) arr.push(value);
  else m.set(key, [value]);
}

/**
 * Signed shoelace area — sign indicates winding direction. Re-implemented here
 * (instead of importing) because `geometry-utils.shoelaceAreaPx2` returns
 * absolute area only.
 */
function signedShoelace(
  points: ReadonlyArray<{ x: number; y: number }>,
): number {
  let sum = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += points[i].x * points[j].y;
    sum -= points[j].x * points[i].y;
  }
  return sum / 2;
}

// Re-export so consumers can spot-check absolute area without two imports.
export { shoelaceAreaPx2 };
