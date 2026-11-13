/**
 * RA-8235 part A: strict validation of the AI floor plan reader's output.
 *
 * Pure, synchronous, no I/O. Both readers (workspace Anthropic key and the
 * RA-8232 backup) go through this one function, so a bad polygon is rejected
 * the same way whichever model produced it.
 *
 * Contract:
 *  - Never throws. Every failure is a typed outcome with a short plain-English
 *    message the UI can show, and `manualDrawingFallback` says whether the
 *    caller should offer to draw the plan by hand.
 *  - Structural failure (result not an object, `rooms` not an array, too many
 *    rooms) rejects the WHOLE result. A bad individual room is dropped and the
 *    rest are kept; the outcome says how many were dropped and why.
 *  - Bounded work: counts are capped BEFORE any per-vertex or O(n^2) work, so
 *    cost is at most MAX_ROOMS * (MAX_VERTICES_PER_ROOM^2) edge tests,
 *    whatever the model returns.
 *  - Every proposal is tagged `ai_suggested` and carries only label and
 *    vertices. Any area, confirmation or provenance the model supplied is
 *    discarded: billing uses server measurement only (RA-8233).
 *
 * Coordinates are NORMALISED image coordinates in [0, 1], as the prompt asks.
 */

import { AI_SUGGESTED_PROVENANCE } from "./measured-provenance";

/**
 * All limits in one place. Typical house plans: 6 to 15 rooms and 4 to 8
 * corners per room. Limits sit well above that, but far below anything a
 * model could use to burn CPU or flood the editor.
 */
export const SKETCH_READER_LIMITS = {
  /**
   * A large house or small commercial floor is about 30 rooms including
   * wet areas, hallways and cupboards. 40 leaves headroom. The reader's
   * 2048 output-token cap makes more than this a sign of runaway output.
   */
  MAX_ROOMS: 40,
  /**
   * Rectangles have 4 corners, L and T shapes 6 to 8, a room with a bay
   * window or stair nook about 12. 24 allows irregular rooms; beyond it the
   * outline is almost certainly noise. Also caps the O(n^2) crossing check
   * at 24 * 24 edge pairs per room.
   */
  MAX_VERTICES_PER_ROOM: 24,
  /** A polygon needs three distinct corners to enclose anything. */
  MIN_DISTINCT_VERTICES: 3,
  /**
   * Smallest accepted polygon area, as a fraction of the whole image.
   * 0.0001 is 1% of the width by 1% of the height: smaller than a cupboard
   * on any usable photo, so it is a speck or a model artefact, not a room.
   */
  MIN_POLYGON_AREA: 0.0001,
  /** Room labels are short ("Master Bedroom", "Laundry"). */
  MAX_LABEL_LENGTH: 60,
  /** Cap on the drop reasons listed in an outcome (the count is always exact). */
  MAX_DROP_REPORTS: 10,
} as const;

/** Two points closer than this on both axes count as the same point. */
const POINT_EPSILON = 1e-9;
/** Orientation tolerance for the crossing test (squared-coordinate scale). */
const ORIENT_EPSILON = 1e-12;

export interface AiSuggestedRoomProposal {
  label: string;
  vertices: { x: number; y: number }[];
  /** Always ai_suggested: not billable until a technician confirms. */
  provenance: typeof AI_SUGGESTED_PROVENANCE;
}

export interface DroppedRoom {
  /** Position of the room in the model's output. */
  index: number;
  label?: string;
  reason: string;
}

interface OutcomeBase {
  /** Short plain-English summary for the UI. */
  message: string;
  droppedCount: number;
  /** Up to MAX_DROP_REPORTS entries. */
  dropped: DroppedRoom[];
}

export type SketchReaderOutcome =
  | (OutcomeBase & {
      status: "ok";
      proposals: AiSuggestedRoomProposal[];
      manualDrawingFallback: false;
    })
  | (OutcomeBase & {
      /** The reader saw no rooms in the image. */
      status: "no_plan";
      proposals: [];
      manualDrawingFallback: true;
    })
  | (OutcomeBase & {
      /** The reader returned something unusable. */
      status: "invalid";
      proposals: [];
      manualDrawingFallback: true;
    });

type Point = { x: number; y: number };

function failWhole(
  status: "no_plan" | "invalid",
  message: string,
  dropped: DroppedRoom[] = [],
  droppedCount = dropped.length,
): SketchReaderOutcome {
  return {
    status,
    proposals: [],
    manualDrawingFallback: true,
    message,
    droppedCount,
    dropped,
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const NO_PLAN_MESSAGE =
  "No rooms were found in this image. You can draw the floor plan by hand instead.";

export function validateSketchReaderOutput(raw: unknown): SketchReaderOutcome {
  try {
    return validate(raw);
  } catch {
    // Defence in depth: hostile objects (throwing getters) must not escape.
    return failWhole(
      "invalid",
      "The floor plan reader returned something that could not be read. You can draw the floor plan by hand instead.",
    );
  }
}

function validate(raw: unknown): SketchReaderOutcome {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return failWhole(
      "invalid",
      "The floor plan reader returned an unusable result. You can draw the floor plan by hand instead.",
    );
  }
  const rooms: unknown = (raw as { rooms?: unknown }).rooms;
  if (rooms === undefined || rooms === null) {
    return failWhole("no_plan", NO_PLAN_MESSAGE);
  }
  if (!Array.isArray(rooms)) {
    return failWhole(
      "invalid",
      "The floor plan reader returned its rooms in an unusable form. You can draw the floor plan by hand instead.",
    );
  }
  if (rooms.length === 0) {
    return failWhole("no_plan", NO_PLAN_MESSAGE);
  }
  if (rooms.length > SKETCH_READER_LIMITS.MAX_ROOMS) {
    return failWhole(
      "invalid",
      `The floor plan reader found too many rooms (${rooms.length}; the limit is ${SKETCH_READER_LIMITS.MAX_ROOMS}), so the result was not used. You can draw the floor plan by hand instead.`,
    );
  }

  const proposals: AiSuggestedRoomProposal[] = [];
  const dropped: DroppedRoom[] = [];
  let droppedCount = 0;

  for (let index = 0; index < rooms.length; index++) {
    const r = checkRoom(rooms[index], index);
    if (r.ok) {
      proposals.push(r.proposal);
    } else {
      droppedCount++;
      if (dropped.length < SKETCH_READER_LIMITS.MAX_DROP_REPORTS) {
        dropped.push({ index, label: r.label, reason: r.reason });
      }
    }
  }

  if (proposals.length === 0) {
    return failWhole(
      "invalid",
      `None of the ${plural(droppedCount, "room")} the reader found had a usable outline, so the result was not used. You can draw the floor plan by hand instead.`,
      dropped,
      droppedCount,
    );
  }

  return {
    status: "ok",
    proposals,
    manualDrawingFallback: false,
    droppedCount,
    dropped,
    message:
      droppedCount === 0
        ? `Found ${plural(proposals.length, "room")}. Check each outline before you use it.`
        : `Found ${plural(proposals.length, "room")}. ${plural(droppedCount, "room")} could not be used and ${droppedCount === 1 ? "was" : "were"} left out. Check each outline before you use it.`,
  };
}

type RoomCheck =
  | { ok: true; proposal: AiSuggestedRoomProposal }
  | { ok: false; reason: string; label?: string };

function checkRoom(room: unknown, index: number): RoomCheck {
  try {
    if (room === null || typeof room !== "object" || Array.isArray(room)) {
      return { ok: false, reason: "Room entry was not a valid object." };
    }
    const label = cleanLabel((room as { label?: unknown }).label, index);
    const verts: unknown = (room as { vertices?: unknown }).vertices;
    const bad = (reason: string): RoomCheck => ({ ok: false, reason, label });

    if (!Array.isArray(verts)) {
      return bad("Room outline (vertices) was missing or not a list.");
    }
    // Cap BEFORE touching any element.
    if (verts.length > SKETCH_READER_LIMITS.MAX_VERTICES_PER_ROOM) {
      return bad(
        `Room outline had too many corners (${verts.length}; the limit is ${SKETCH_READER_LIMITS.MAX_VERTICES_PER_ROOM}).`,
      );
    }
    if (verts.length < SKETCH_READER_LIMITS.MIN_DISTINCT_VERTICES) {
      return bad("Room outline needs at least 3 corners.");
    }

    const points: Point[] = [];
    for (let i = 0; i < verts.length; i++) {
      const v: unknown = verts[i];
      if (v === null || typeof v !== "object") {
        return bad("A corner was not a point with x and y numbers.");
      }
      const x: unknown = (v as { x?: unknown }).x;
      const y: unknown = (v as { y?: unknown }).y;
      if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        return bad("A corner had an x or y that was not a finite number.");
      }
      if (x < 0 || x > 1 || y < 0 || y > 1) {
        return bad("A corner was outside the image (x and y must be between 0 and 1).");
      }
      points.push({ x, y });
    }

    const cleaned = dedupeConsecutive(points);
    if (
      cleaned.length < SKETCH_READER_LIMITS.MIN_DISTINCT_VERTICES ||
      distinctCount(cleaned) < SKETCH_READER_LIMITS.MIN_DISTINCT_VERTICES
    ) {
      return bad("Room outline needs at least 3 corners in different places.");
    }

    // Straight line first: it also "folds back" on itself, but the useful
    // message is that it has no area.
    if (allCollinear(cleaned)) {
      return bad("Room outline has no area (its corners are in a straight line).");
    }
    // Crossing before area: a bow-tie can have a signed area of exactly zero.
    if (selfIntersects(cleaned)) {
      return bad("Room outline crosses or touches itself.");
    }
    const area = Math.abs(signedArea(cleaned));
    if (area < POINT_EPSILON) {
      return bad("Room outline has no area (its corners are in a straight line).");
    }
    if (area < SKETCH_READER_LIMITS.MIN_POLYGON_AREA) {
      return bad("Room outline is too small to be a room.");
    }

    return {
      ok: true,
      proposal: {
        label,
        vertices: cleaned.map((p) => ({ x: p.x, y: p.y })),
        provenance: AI_SUGGESTED_PROVENANCE,
      },
    };
  } catch {
    return { ok: false, reason: "Room entry could not be read." };
  }
}

function cleanLabel(value: unknown, index: number): string {
  if (typeof value === "string") {
    // Strip control characters, collapse whitespace, cap the length.
    const t = value
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, SKETCH_READER_LIMITS.MAX_LABEL_LENGTH)
      .trim();
    if (t) return t;
  }
  return `Room ${index + 1}`;
}

function same(a: Point, b: Point): boolean {
  return (
    Math.abs(a.x - b.x) <= POINT_EPSILON && Math.abs(a.y - b.y) <= POINT_EPSILON
  );
}

/** Remove consecutive repeats, including a closing vertex equal to the first. */
function dedupeConsecutive(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    if (out.length === 0 || !same(out[out.length - 1], p)) out.push(p);
  }
  while (out.length > 1 && same(out[0], out[out.length - 1])) out.pop();
  return out;
}

function distinctCount(points: Point[]): number {
  const seen: Point[] = [];
  for (const p of points) {
    if (!seen.some((q) => same(p, q))) seen.push(p);
  }
  return seen.length;
}

function signedArea(p: Point[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function allCollinear(p: Point[]): boolean {
  // cleaned has no consecutive repeats, so p[0] and p[1] differ.
  return p.every((q) => orient(p[0], p[1], q) === 0);
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function orient(o: Point, a: Point, b: Point): -1 | 0 | 1 {
  const c = cross(o, a, b);
  return c > ORIENT_EPSILON ? 1 : c < -ORIENT_EPSILON ? -1 : 0;
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a.x, b.x) - POINT_EPSILON <= p.x &&
    p.x <= Math.max(a.x, b.x) + POINT_EPSILON &&
    Math.min(a.y, b.y) - POINT_EPSILON <= p.y &&
    p.y <= Math.max(a.y, b.y) + POINT_EPSILON
  );
}

/** True when closed segments a-b and c-d share any point (cross or touch). */
function segmentsMeet(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  if (o4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

/**
 * True when a non-adjacent pair of edges meets, or when two adjacent edges
 * fold back on each other (a zero-width spike). Callers must already have
 * capped the vertex count: this is O(n^2) in it.
 */
function selfIntersects(p: Point[]): boolean {
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    // Adjacent edge (b -> c): a collinear fold-back overlaps the previous edge.
    const c = p[(i + 2) % n];
    if (
      orient(a, b, c) === 0 &&
      (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0
    ) {
      return true;
    }
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // shares vertex 0 with edge i
      if (segmentsMeet(a, b, p[j], p[(j + 1) % n])) return true;
    }
  }
  return false;
}
