/**
 * RA-8233 — technician measurement evidence for AI-origin rooms (server only).
 *
 * An AI-imported room may bill only after a technician has measured it on
 * site. The sketch POST route records that measurement here: the actor is the
 * session user, the time is the server clock, and the entry is bound to a
 * revision of the room's geometry and the floor's scale. A later save whose
 * geometry or scale differs invalidates the entry; entries are never removed,
 * so the history of what was measured, by whom and against which drawing is
 * kept on the floor's sketch blob (`raSketchMeta.roomMeasurementEvidence`).
 *
 * Moving a room (left/top) does not change its size and keeps the evidence.
 * Any change to its points, transform scale/rotation/skew, claimed area, or
 * the floor's pixels-per-metre does.
 */
import { createHash } from "node:crypto";
import {
  measuredAreaFromInput,
  measurementAgreesWithDrawnArea,
  type RoomMeasurementInput,
} from "./ai-suggested-confirm";
import type { RoomMeasurementEvidence } from "./sketch-field-status";
import { extractRoomGraphNodes } from "./sync-room-graph";

const DEFAULT_PX_PER_M = 100;

export interface RoomRevision {
  fabricObjectId: string;
  areaM2: number | null;
  geometryRevision: string;
}

function round(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.round(v * 1e4) / 1e4
    : null;
}

function pointList(points: unknown): Array<[number | null, number | null]> {
  if (!Array.isArray(points)) return [];
  return points.map((p) =>
    Array.isArray(p)
      ? [round(p[0]), round(p[1])]
      : p && typeof p === "object"
        ? [
            round((p as { x?: unknown }).x),
            round((p as { y?: unknown }).y),
          ]
        : [null, null],
  );
}

/**
 * Revision of one room's size and the floor scale. Translation-independent.
 */
export function roomGeometryRevision(
  geometryJson: unknown,
  pxPerMetre: number | null | undefined,
  areaM2: number | null,
): string {
  const g = (geometryJson ?? {}) as Record<string, unknown>;
  const payload = JSON.stringify({
    t: typeof g.type === "string" ? g.type : null,
    p: pointList(g.points),
    w: round(g.width),
    h: round(g.height),
    sx: round(g.scaleX ?? 1),
    sy: round(g.scaleY ?? 1),
    a: round(g.angle ?? 0),
    kx: round(g.skewX ?? 0),
    ky: round(g.skewY ?? 0),
    ppm: round(pxPerMetre ?? DEFAULT_PX_PER_M),
    area: round(areaM2),
  });
  return `gr-${createHash("sha256").update(payload).digest("hex").slice(0, 24)}`;
}

/** Every room on a sketch blob with its current geometry revision. */
export function roomRevisionsFromSketchData(
  sketchData: Record<string, unknown>,
): RoomRevision[] {
  const scale = (sketchData?.scaleConfig ?? null) as {
    pxPerMetre?: unknown;
  } | null;
  const ppm =
    typeof scale?.pxPerMetre === "number" && Number.isFinite(scale.pxPerMetre)
      ? scale.pxPerMetre
      : DEFAULT_PX_PER_M;
  return extractRoomGraphNodes(sketchData).map((node) => ({
    fabricObjectId: node.fabricObjectId,
    areaM2: node.areaM2,
    geometryRevision: roomGeometryRevision(node.geometryJson, ppm, node.areaM2),
  }));
}

export type RoomMeasurementRejection =
  | "room_not_on_canvas"
  | "invalid_measurement"
  | "measurement_disagrees_with_drawn_area";

export type RoomMeasurementResult =
  | { fabricObjectId: string; accepted: true }
  | {
      fabricObjectId: string;
      accepted: false;
      reason: RoomMeasurementRejection;
    };

export interface ReconcileRoomMeasurementInput {
  /** Evidence the server persisted earlier — never the client's copy. */
  stored: RoomMeasurementEvidence[];
  /** Rooms in the blob being saved, with their current revisions. */
  rooms: RoomRevision[];
  /** Technician measurements submitted with this save. */
  submissions: RoomMeasurementInput[];
  sessionUserId: string;
  now?: Date;
}

export interface ReconcileRoomMeasurementResult {
  /** Full history to persist (append-only). */
  evidence: RoomMeasurementEvidence[];
  /** Rooms with current evidence bound to this save's geometry and scale. */
  measuredRoomIds: Set<string>;
  results: RoomMeasurementResult[];
}

/**
 * Invalidate stored evidence whose room geometry or scale changed, record
 * new technician measurements, and report which rooms are measured now.
 */
export function reconcileRoomMeasurementEvidence(
  input: ReconcileRoomMeasurementInput,
): ReconcileRoomMeasurementResult {
  const nowIso = (input.now ?? new Date()).toISOString();
  const roomsById = new Map(input.rooms.map((r) => [r.fabricObjectId, r]));
  const evidence: RoomMeasurementEvidence[] = input.stored.map((e) => ({
    ...e,
  }));

  for (const entry of evidence) {
    if (entry.status !== "current") continue;
    const room = roomsById.get(entry.fabricObjectId);
    // A room off this canvas keeps its entry; if it returns with different
    // geometry it is invalidated on that save.
    if (room && room.geometryRevision !== entry.geometryRevision) {
      entry.status = "invalidated";
      entry.invalidatedAt = nowIso;
      entry.invalidatedReason = "geometry_or_scale_changed";
    }
  }

  const results: RoomMeasurementResult[] = [];
  for (const submission of input.submissions) {
    const id = submission.fabricObjectId;
    const room = roomsById.get(id);
    if (!room) {
      results.push({
        fabricObjectId: id,
        accepted: false,
        reason: "room_not_on_canvas",
      });
      continue;
    }
    const measured = measuredAreaFromInput(submission);
    if (measured === null) {
      results.push({
        fabricObjectId: id,
        accepted: false,
        reason: "invalid_measurement",
      });
      continue;
    }
    if (!measurementAgreesWithDrawnArea(measured, room.areaM2)) {
      results.push({
        fabricObjectId: id,
        accepted: false,
        reason: "measurement_disagrees_with_drawn_area",
      });
      continue;
    }
    for (const entry of evidence) {
      if (entry.fabricObjectId === id && entry.status === "current") {
        entry.status = "superseded";
        entry.invalidatedAt = nowIso;
        entry.invalidatedReason = "remeasured";
      }
    }
    // measuredAreaFromInput prefers a direct area; record L×W only when used.
    const usedLengthWidth =
      measuredAreaFromInput({
        fabricObjectId: id,
        measuredAreaM2: submission.measuredAreaM2,
      }) === null;
    evidence.push({
      fabricObjectId: id,
      measuredAreaM2: measured,
      lengthM: usedLengthWidth ? (submission.lengthM ?? null) : null,
      widthM: usedLengthWidth ? (submission.widthM ?? null) : null,
      geometryRevision: room.geometryRevision,
      recordedBy: input.sessionUserId,
      recordedAt: nowIso,
      status: "current",
      invalidatedAt: null,
      invalidatedReason: null,
    });
    results.push({ fabricObjectId: id, accepted: true });
  }

  const measuredRoomIds = new Set<string>();
  for (const entry of evidence) {
    if (entry.status !== "current") continue;
    const room = roomsById.get(entry.fabricObjectId);
    if (room && room.geometryRevision === entry.geometryRevision) {
      measuredRoomIds.add(entry.fabricObjectId);
    }
  }

  return { evidence, measuredRoomIds, results };
}
