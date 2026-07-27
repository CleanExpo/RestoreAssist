/**
 * RA-7091 — Technician correction + confirmation for RoomPlan rooms.
 *
 * Flow (plan §5 + MVP R5): scan → land as reference pending confirm → tech
 * corrects labels/geometry on canvas → Confirm measurement → operator_measured.
 * Original capture snapshot and a revision history are preserved on `data`.
 */

export interface RoomPlanCorrectionEntry {
  /** ISO timestamp */
  at: string;
  /** Optional operator id / display name when known */
  by?: string;
  field: "label" | "confirm" | "geometry" | "exclude";
  before?: unknown;
  after?: unknown;
  note?: string;
}

export interface RoomPlanRoomData {
  type: "room";
  id: string;
  label: string;
  areaM2: number;
  provenance: "operator_measured" | "underlay_reference";
  captureAdapter: "roomplan";
  /** Pixel-space polygon as captured (pre-correction). */
  originalPoints: { x: number; y: number }[];
  originalLabel: string;
  originalAreaM2: number;
  correctionHistory: RoomPlanCorrectionEntry[];
  confirmedAt?: string;
  confirmedBy?: string;
}

export function isRoomPlanPendingConfirm(data: {
  captureAdapter?: unknown;
  provenance?: unknown;
}): boolean {
  return (
    data.captureAdapter === "roomplan" &&
    data.provenance === "underlay_reference"
  );
}

export function appendRoomPlanCorrection(
  history: RoomPlanCorrectionEntry[] | undefined,
  entry: Omit<RoomPlanCorrectionEntry, "at"> & { at?: string },
): RoomPlanCorrectionEntry[] {
  return [
    ...(history ?? []),
    {
      ...entry,
      at: entry.at ?? new Date().toISOString(),
    },
  ];
}

/**
 * Promote a pending RoomPlan room to operator_measured and record confirmation.
 */
export function confirmRoomPlanMeasurement(
  data: Record<string, unknown>,
  opts?: { by?: string; at?: string },
): Record<string, unknown> {
  const at = opts?.at ?? new Date().toISOString();
  const before = data.provenance;
  return {
    ...data,
    provenance: "operator_measured",
    confirmedAt: at,
    confirmedBy: opts?.by,
    correctionHistory: appendRoomPlanCorrection(
      data.correctionHistory as RoomPlanCorrectionEntry[] | undefined,
      {
        at,
        by: opts?.by,
        field: "confirm",
        before,
        after: "operator_measured",
        note: "Technician confirmed LiDAR measurement on site",
      },
    ),
  };
}

/**
 * Record a label correction on a RoomPlan room (does not change provenance).
 */
export function recordRoomPlanLabelCorrection(
  data: Record<string, unknown>,
  nextLabel: string,
  opts?: { by?: string; at?: string },
): Record<string, unknown> {
  if (data.captureAdapter !== "roomplan") {
    return { ...data, label: nextLabel };
  }
  const before = data.label;
  if (before === nextLabel) return data;
  return {
    ...data,
    label: nextLabel,
    correctionHistory: appendRoomPlanCorrection(
      data.correctionHistory as RoomPlanCorrectionEntry[] | undefined,
      {
        at: opts?.at,
        by: opts?.by,
        field: "label",
        before,
        after: nextLabel,
      },
    ),
  };
}
