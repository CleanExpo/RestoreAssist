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
}

export interface ResolveSketchRoomProvenanceResult {
  provenance: string;
  isExplicitConfirm: boolean;
}

/**
 * RA-7617 — SketchRoom.provenance is derived on the server.
 *
 * - An existing `ai_suggested` row becomes `operator_measured` only as an
 *   explicit confirm (incoming tag is operator_measured). Any other tag is
 *   ignored; the row stays `ai_suggested`.
 * - An existing `operator_measured` row is never downgraded.
 * - A first save whose fabric id the server recorded as AI-produced cannot
 *   claim `operator_measured`, unless this POST lists that id in
 *   `confirmedFabricObjectIds` (a genuine Confirm that raced the first save).
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
  const remembered = input.rememberedAiRoomIds.has(input.fabricObjectId);
  const explicitlyConfirmed =
    incoming === OPERATOR_MEASURED_PROVENANCE &&
    (input.explicitlyConfirmedIds?.has(input.fabricObjectId) ?? false);

  if (existing === OPERATOR_MEASURED_PROVENANCE) {
    return {
      provenance: OPERATOR_MEASURED_PROVENANCE,
      isExplicitConfirm: false,
    };
  }

  if (existing === AI_SUGGESTED_PROVENANCE) {
    if (incoming === OPERATOR_MEASURED_PROVENANCE) {
      return {
        provenance: OPERATOR_MEASURED_PROVENANCE,
        isExplicitConfirm: true,
      };
    }
    return {
      provenance: AI_SUGGESTED_PROVENANCE,
      isExplicitConfirm: false,
    };
  }

  if (!existing && remembered) {
    if (explicitlyConfirmed) {
      return {
        provenance: OPERATOR_MEASURED_PROVENANCE,
        isExplicitConfirm: true,
      };
    }
    return {
      provenance: AI_SUGGESTED_PROVENANCE,
      isExplicitConfirm: false,
    };
  }

  return { provenance: incoming, isExplicitConfirm: false };
}

/** Ids the client listed as technician-confirmed in this POST body. */
export function parseConfirmedFabricObjectIds(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw.filter((id): id is string => typeof id === "string" && id.length > 0),
  );
}
