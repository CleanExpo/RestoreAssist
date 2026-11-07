/**
 * RA-7611 — technician confirmation for AI-suggested rooms.
 *
 * Follows the RoomPlan pattern in roomplan-correction.ts: land as a
 * suggestion, optional dimension correction, Confirm promotes to
 * `operator_measured` and appends correction history.
 *
 * Confirmation state is persisted on SketchRoom (see confirmSketchRoomMeasurement),
 * not SketchElement — those rows are deleted and recreated on every save.
 *
 * `confirmedBy` / `confirmedAt` on the SketchRoom row are server-stamped in
 * the sketch save route (session user id + server clock). Client-supplied
 * values are ignored on the unconfirmed → confirmed transition.
 *
 * RA-8233: Confirm alone no longer bills an AI-origin room. The save route
 * also needs a technician measurement (`roomMeasurements`), recorded and
 * bound to the room's geometry by room-measurement-evidence.ts.
 */

import {
  AI_SUGGESTED_PROVENANCE,
  OPERATOR_MEASURED_PROVENANCE,
} from "./measured-provenance";
import {
  appendRoomPlanCorrection,
  currentRecordedPoints,
  geometryPointsMatch,
  type RoomPlanCorrectionEntry,
} from "./roomplan-correction";

export type AiSuggestedCorrectionEntry = RoomPlanCorrectionEntry;

export function isAiSuggestedPendingConfirm(data: {
  provenance?: unknown;
}): boolean {
  return data.provenance === AI_SUGGESTED_PROVENANCE;
}

function isPositiveFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function samePoints(
  a: { x: number; y: number }[] | undefined,
  b: { x: number; y: number }[] | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  return a.every((p, i) => p.x === b[i]?.x && p.y === b[i]?.y);
}

export interface ConfirmAiSuggestedOpts {
  by?: string;
  at?: string;
  /** Optional on-site dimension correction applied at Confirm. */
  areaM2?: number;
  lengthM?: number;
  widthM?: number;
  points?: { x: number; y: number }[];
  note?: string;
}

/**
 * Promote pending AI-suggested fabric `data` to operator_measured.
 * Optional metre fields are recorded as a geometry correction first —
 * rejected when not finite and > 0, and skipped when nothing changed.
 */
export function confirmAiSuggestedMeasurement(
  data: Record<string, unknown>,
  opts?: ConfirmAiSuggestedOpts,
): Record<string, unknown> {
  const at = opts?.at ?? new Date().toISOString();
  const next: Record<string, unknown> = { ...data };

  const nextArea = isPositiveFiniteNumber(opts?.areaM2) ? opts.areaM2 : undefined;
  const nextLength = isPositiveFiniteNumber(opts?.lengthM)
    ? opts.lengthM
    : undefined;
  const nextWidth = isPositiveFiniteNumber(opts?.widthM) ? opts.widthM : undefined;
  const nextPoints = Array.isArray(opts?.points) ? opts.points : undefined;

  const areaChanged = nextArea !== undefined && nextArea !== next.areaM2;
  const lengthChanged = nextLength !== undefined && nextLength !== next.lengthM;
  const widthChanged = nextWidth !== undefined && nextWidth !== next.widthM;
  const pointsChanged =
    nextPoints !== undefined &&
    !samePoints(
      nextPoints,
      Array.isArray(next.points)
        ? (next.points as { x: number; y: number }[])
        : undefined,
    );

  if (areaChanged || lengthChanged || widthChanged || pointsChanged) {
    const beforeArea = next.areaM2;
    if (areaChanged) next.areaM2 = nextArea;
    if (lengthChanged) next.lengthM = nextLength;
    if (widthChanged) next.widthM = nextWidth;
    next.correctionHistory = appendRoomPlanCorrection(
      next.correctionHistory as AiSuggestedCorrectionEntry[] | undefined,
      {
        at,
        by: opts?.by,
        field: "geometry",
        before: { areaM2: beforeArea },
        after: {
          areaM2: next.areaM2,
          lengthM: next.lengthM,
          widthM: next.widthM,
          points: nextPoints,
        },
        note: opts?.note,
      },
    );
  }

  const before = next.provenance;
  return {
    ...next,
    provenance: OPERATOR_MEASURED_PROVENANCE,
    confirmedAt: at,
    confirmedBy: opts?.by,
    correctionHistory: appendRoomPlanCorrection(
      next.correctionHistory as AiSuggestedCorrectionEntry[] | undefined,
      {
        at,
        by: opts?.by,
        field: "confirm",
        before,
        after: OPERATOR_MEASURED_PROVENANCE,
        note: opts?.note ?? "Technician confirmed AI-suggested measurement on site",
      },
    ),
  };
}

/**
 * Record a geometry correction on an AI-suggested room without promoting it.
 * Provenance stays `ai_suggested` until Confirm. Invalid or unchanged
 * dimensions are not recorded.
 */
export function recordAiSuggestedGeometryCorrection(
  data: Record<string, unknown>,
  next: {
    points?: { x: number; y: number }[];
    areaM2: number;
    lengthM?: number;
    widthM?: number;
  },
  opts?: { by?: string; at?: string },
): Record<string, unknown> {
  const nextArea = isPositiveFiniteNumber(next.areaM2) ? next.areaM2 : undefined;
  const nextLength = isPositiveFiniteNumber(next.lengthM)
    ? next.lengthM
    : undefined;
  const nextWidth = isPositiveFiniteNumber(next.widthM) ? next.widthM : undefined;
  const nextPoints = Array.isArray(next.points) ? next.points : undefined;

  if (
    nextArea === undefined &&
    nextLength === undefined &&
    nextWidth === undefined &&
    nextPoints === undefined
  ) {
    return { ...data };
  }

  const areaChanged = nextArea !== undefined && nextArea !== data.areaM2;
  const lengthChanged = nextLength !== undefined && nextLength !== data.lengthM;
  const widthChanged = nextWidth !== undefined && nextWidth !== data.widthM;
  const pointsChanged =
    nextPoints !== undefined &&
    !geometryPointsMatch(currentRecordedPoints(data), nextPoints);

  if (!areaChanged && !lengthChanged && !widthChanged && !pointsChanged) {
    return { ...data };
  }

  const applied = {
    ...data,
    ...(areaChanged ? { areaM2: nextArea } : {}),
    ...(lengthChanged ? { lengthM: nextLength } : {}),
    ...(widthChanged ? { widthM: nextWidth } : {}),
  };

  if (data.provenance !== AI_SUGGESTED_PROVENANCE) {
    return applied;
  }

  return {
    ...applied,
    correctionHistory: appendRoomPlanCorrection(
      data.correctionHistory as AiSuggestedCorrectionEntry[] | undefined,
      {
        at: opts?.at,
        by: opts?.by,
        field: "geometry",
        before: { areaM2: data.areaM2 },
        after: {
          areaM2: applied.areaM2,
          points: nextPoints,
          lengthM: applied.lengthM,
          widthM: applied.widthM,
        },
      },
    ),
  };
}

export interface SketchRoomConfirmInput {
  name?: string | null;
  areaM2?: number | null;
  perimeterM?: number | null;
  heightM?: number | null;
  provenance: string;
  confirmedAt?: string | null;
  confirmedBy?: string | null;
  correctionHistory?: AiSuggestedCorrectionEntry[] | null;
  originalAreaM2?: number | null;
}

export interface SketchRoomConfirmResult extends SketchRoomConfirmInput {
  provenance: typeof OPERATOR_MEASURED_PROVENANCE;
  confirmedAt: string;
  correctionHistory: AiSuggestedCorrectionEntry[];
}

/**
 * SketchRoom-row confirm. Lives here because SketchElement cannot hold
 * confirmation state across save (delete + recreate).
 */
export function confirmSketchRoomMeasurement(
  room: SketchRoomConfirmInput,
  opts?: ConfirmAiSuggestedOpts,
): SketchRoomConfirmResult {
  const at = opts?.at ?? new Date().toISOString();
  let history = [...(room.correctionHistory ?? [])];
  let areaM2 = room.areaM2 ?? null;

  if (isPositiveFiniteNumber(opts?.areaM2) && opts.areaM2 !== room.areaM2) {
    history = appendRoomPlanCorrection(history, {
      at,
      by: opts.by,
      field: "geometry",
      before: { areaM2: room.areaM2 },
      after: { areaM2: opts.areaM2 },
      note: opts.note,
    });
    areaM2 = opts.areaM2;
  }

  history = appendRoomPlanCorrection(history, {
    at,
    by: opts?.by,
    field: "confirm",
    before: room.provenance,
    after: OPERATOR_MEASURED_PROVENANCE,
    note: opts?.note ?? "Technician confirmed AI-suggested measurement on site",
  });

  return {
    ...room,
    areaM2,
    provenance: OPERATOR_MEASURED_PROVENANCE,
    confirmedAt: at,
    confirmedBy: opts?.by ?? null,
    originalAreaM2: room.originalAreaM2 ?? room.areaM2 ?? null,
    correctionHistory: history,
  };
}

function isPresentConfirmStamp(
  value: Date | string | null | undefined,
): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === "string") return value.length > 0;
  return false;
}

/**
 * Server-side confirm attribution for SketchRoom upsert.
 *
 * On the unconfirmed → confirmed transition, `confirmedBy` is the session
 * user id and `confirmedAt` is server time. Client-supplied values for both
 * are ignored. An already-confirmed row keeps its original stamp.
 *
 * `isExplicitConfirm` is the RA-7617 path: an existing `ai_suggested` row
 * promoted to `operator_measured`. Stamp even when the client omitted
 * confirmedAt/confirmedBy.
 */
export function resolveSketchRoomConfirmAttribution(input: {
  existingConfirmedAt?: Date | string | null;
  existingConfirmedBy?: string | null;
  incomingConfirmedAt?: Date | string | null;
  incomingConfirmedBy?: string | null;
  sessionUserId: string;
  now?: Date;
  isExplicitConfirm?: boolean;
}): { confirmedAt: Date | null; confirmedBy: string | null } {
  if (isPresentConfirmStamp(input.existingConfirmedAt)) {
    const existingAt = input.existingConfirmedAt;
    const at =
      existingAt instanceof Date
        ? existingAt
        : typeof existingAt === "string"
          ? new Date(existingAt)
          : null;
    return {
      confirmedAt: at && !Number.isNaN(at.getTime()) ? at : null,
      confirmedBy: input.existingConfirmedBy ?? null,
    };
  }

  if (input.isExplicitConfirm) {
    return {
      confirmedAt: input.now ?? new Date(),
      confirmedBy: input.sessionUserId,
    };
  }

  const incomingConfirmed =
    isPresentConfirmStamp(input.incomingConfirmedAt) ||
    (typeof input.incomingConfirmedBy === "string" &&
      input.incomingConfirmedBy.length > 0);

  if (!incomingConfirmed) {
    return { confirmedAt: null, confirmedBy: null };
  }

  return {
    confirmedAt: input.now ?? new Date(),
    confirmedBy: input.sessionUserId,
  };
}

export interface ResolveSketchRoomProvenanceInput {
  existingProvenance?: string | null;
  incomingProvenance: string;
  fabricObjectId: string;
  rememberedAiRoomIds: ReadonlySet<string>;
  /**
   * Fabric object ids the authenticated user confirmed in this POST.
   * Required for a remembered AI room whose SketchRoom row does not
   * exist yet (import then Confirm before the first save lands).
   */
  explicitlyConfirmedIds?: ReadonlySet<string>;
  /**
   * RA-8233 — fabric ids with current, server-recorded technician measurement
   * evidence bound to the geometry and scale in this save. An AI-origin room
   * outside this set never resolves to `operator_measured`.
   */
  measuredRoomIds?: ReadonlySet<string>;
}

export interface ResolveSketchRoomProvenanceResult {
  provenance: string;
  isExplicitConfirm: boolean;
}

/**
 * RA-7617 / RA-8233 — SketchRoom.provenance is derived on the server.
 *
 * - An AI-origin room (existing `ai_suggested` row, an id the Vision import
 *   recorded, or an `ai-suggested-` id) is `operator_measured` only when a
 *   confirm is requested AND `measuredRoomIds` holds current technician
 *   measurement evidence for it. Otherwise it is `ai_suggested` — including
 *   a row promoted by a bare Confirm before RA-8233.
 * - Any other existing `operator_measured` row is never downgraded.
 * - Otherwise the incoming tag is kept (hand-drawn, LiDAR, untagged default).
 */
export function resolveSketchRoomProvenance(
  input: ResolveSketchRoomProvenanceInput,
): ResolveSketchRoomProvenanceResult {
  const existing =
    typeof input.existingProvenance === "string" &&
    input.existingProvenance.length > 0
      ? input.existingProvenance
      : null;
  const incoming = input.incomingProvenance;
  const id = input.fabricObjectId;
  const aiOrigin =
    existing === AI_SUGGESTED_PROVENANCE ||
    input.rememberedAiRoomIds.has(id) ||
    id.startsWith(AI_SUGGESTED_ROOM_ID_PREFIX);

  // RA-8233: an AI-origin room bills only while current technician
  // measurement evidence exists for it. A Confirm (or a row confirmed
  // before RA-8233) is not enough on its own.
  if (aiOrigin) {
    const measured = input.measuredRoomIds?.has(id) ?? false;
    const confirmRequested =
      existing === OPERATOR_MEASURED_PROVENANCE ||
      incoming === OPERATOR_MEASURED_PROVENANCE ||
      (input.explicitlyConfirmedIds?.has(id) ?? false);
    if (measured && confirmRequested) {
      return {
        provenance: OPERATOR_MEASURED_PROVENANCE,
        isExplicitConfirm: existing !== OPERATOR_MEASURED_PROVENANCE,
      };
    }
    return {
      provenance: AI_SUGGESTED_PROVENANCE,
      isExplicitConfirm: false,
    };
  }

  if (existing === OPERATOR_MEASURED_PROVENANCE) {
    return {
      provenance: OPERATOR_MEASURED_PROVENANCE,
      isExplicitConfirm: false,
    };
  }

  return { provenance: incoming, isExplicitConfirm: false };
}

/** Fabric ids the Vision import assigns (import-from-image route). */
export const AI_SUGGESTED_ROOM_ID_PREFIX = "ai-suggested-";

/**
 * RA-8233 — a technician's on-site measurement of one room, as entered.
 * Either a direct area (irregular rooms) or length × width.
 */
export interface RoomMeasurementInput {
  fabricObjectId: string;
  measuredAreaM2?: number;
  lengthM?: number;
  widthM?: number;
}

/** A measurement may disagree with the drawn area by at most this share. */
export const ROOM_MEASUREMENT_AREA_TOLERANCE = 0.05;
/** …but never less than this many m² (rounding on very small rooms). */
export const ROOM_MEASUREMENT_MIN_TOLERANCE_M2 = 0.1;

/** Measured floor area in m², or null when the entry is not usable. */
export function measuredAreaFromInput(
  input: RoomMeasurementInput,
): number | null {
  if (isPositiveFiniteNumber(input.measuredAreaM2)) return input.measuredAreaM2;
  if (
    isPositiveFiniteNumber(input.lengthM) &&
    isPositiveFiniteNumber(input.widthM)
  ) {
    return input.lengthM * input.widthM;
  }
  return null;
}

/**
 * True when the technician's measured area matches the drawn room area
 * closely enough for the drawn geometry to be billed.
 */
export function measurementAgreesWithDrawnArea(
  measuredM2: number,
  drawnM2: number | null | undefined,
): boolean {
  if (!isPositiveFiniteNumber(measuredM2) || !isPositiveFiniteNumber(drawnM2)) {
    return false;
  }
  const tolerance = Math.max(
    drawnM2 * ROOM_MEASUREMENT_AREA_TOLERANCE,
    ROOM_MEASUREMENT_MIN_TOLERANCE_M2,
  );
  return Math.abs(measuredM2 - drawnM2) <= tolerance + 1e-9;
}

/**
 * `roomMeasurements` from a sketch POST body. Keeps only the room id and the
 * dimension fields; any actor, time, revision or status the client sends is
 * dropped here. One entry per room (the last one wins).
 */
export function parseRoomMeasurementInputs(
  raw: unknown,
): RoomMeasurementInput[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, RoomMeasurementInput>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.fabricObjectId !== "string" || r.fabricObjectId.length === 0) {
      continue;
    }
    const entry: RoomMeasurementInput = { fabricObjectId: r.fabricObjectId };
    if (typeof r.measuredAreaM2 === "number") {
      entry.measuredAreaM2 = r.measuredAreaM2;
    }
    if (typeof r.lengthM === "number") entry.lengthM = r.lengthM;
    if (typeof r.widthM === "number") entry.widthM = r.widthM;
    byId.set(entry.fabricObjectId, entry);
  }
  return [...byId.values()];
}

/** Ids the client listed as technician-confirmed in this POST body. */
export function parseConfirmedFabricObjectIds(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw.filter((id): id is string => typeof id === "string" && id.length > 0),
  );
}
