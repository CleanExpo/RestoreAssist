/**
 * RA-7611 — technician confirmation for AI-suggested rooms.
 *
 * Follows the RoomPlan pattern in roomplan-correction.ts: land as a
 * suggestion, optional dimension correction, Confirm promotes to
 * `operator_measured` and appends correction history.
 *
 * Confirmation state is persisted on SketchRoom (see confirmSketchRoomMeasurement),
 * not SketchElement — those rows are deleted and recreated on every save.
 */

import {
  AI_SUGGESTED_PROVENANCE,
  OPERATOR_MEASURED_PROVENANCE,
} from "./measured-provenance";
import {
  appendRoomPlanCorrection,
  type RoomPlanCorrectionEntry,
} from "./roomplan-correction";

export type AiSuggestedCorrectionEntry = RoomPlanCorrectionEntry;

export function isAiSuggestedPendingConfirm(data: {
  provenance?: unknown;
}): boolean {
  return data.provenance === AI_SUGGESTED_PROVENANCE;
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
 * Optional metre fields are recorded as a geometry correction first.
 */
export function confirmAiSuggestedMeasurement(
  data: Record<string, unknown>,
  opts?: ConfirmAiSuggestedOpts,
): Record<string, unknown> {
  const at = opts?.at ?? new Date().toISOString();
  let next: Record<string, unknown> = { ...data };

  const hasDimCorrection =
    opts?.areaM2 != null ||
    opts?.lengthM != null ||
    opts?.widthM != null ||
    Array.isArray(opts?.points);

  if (hasDimCorrection) {
    const beforeArea = next.areaM2;
    if (typeof opts?.areaM2 === "number") next.areaM2 = opts.areaM2;
    if (typeof opts?.lengthM === "number") next.lengthM = opts.lengthM;
    if (typeof opts?.widthM === "number") next.widthM = opts.widthM;
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
          points: opts?.points,
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
 * Provenance stays `ai_suggested` until Confirm.
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
  if (data.provenance !== AI_SUGGESTED_PROVENANCE) {
    return {
      ...data,
      areaM2: next.areaM2,
      ...(typeof next.lengthM === "number" ? { lengthM: next.lengthM } : {}),
      ...(typeof next.widthM === "number" ? { widthM: next.widthM } : {}),
    };
  }
  const beforeArea = data.areaM2;
  return {
    ...data,
    areaM2: next.areaM2,
    ...(typeof next.lengthM === "number" ? { lengthM: next.lengthM } : {}),
    ...(typeof next.widthM === "number" ? { widthM: next.widthM } : {}),
    correctionHistory: appendRoomPlanCorrection(
      data.correctionHistory as AiSuggestedCorrectionEntry[] | undefined,
      {
        at: opts?.at,
        by: opts?.by,
        field: "geometry",
        before: { areaM2: beforeArea },
        after: {
          areaM2: next.areaM2,
          points: next.points,
          lengthM: next.lengthM,
          widthM: next.widthM,
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

  if (typeof opts?.areaM2 === "number" && opts.areaM2 !== room.areaM2) {
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
