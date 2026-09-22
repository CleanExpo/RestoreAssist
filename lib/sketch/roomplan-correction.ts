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

type GeometryPoint = { x: number; y: number };

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asPoints(value: unknown): GeometryPoint[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const points: GeometryPoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return undefined;
    const { x, y } = item as { x?: unknown; y?: unknown };
    if (typeof x !== "number" || typeof y !== "number") return undefined;
    points.push({ x, y });
  }
  return points;
}

function samePoints(
  a: GeometryPoint[] | undefined,
  b: GeometryPoint[] | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every(
    (point, index) => point.x === b[index]?.x && point.y === b[index]?.y,
  );
}

/**
 * Geometry already recorded on the room: the last geometry correction's
 * points when one exists, otherwise the capture (`originalPoints`).
 * A later label edit must be compared here, not against the original scan.
 */
function currentRecordedPoints(
  data: Record<string, unknown>,
): GeometryPoint[] | undefined {
  const stored = asPoints(data.points);
  if (stored) return stored;
  const history = data.correctionHistory;
  if (Array.isArray(history)) {
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i] as RoomPlanCorrectionEntry | undefined;
      if (!entry || entry.field !== "geometry") continue;
      const after = entry.after;
      if (!after || typeof after !== "object") continue;
      const recorded = asPoints((after as { points?: unknown }).points);
      if (recorded) return recorded;
    }
  }
  return asPoints(data.originalPoints);
}

/**
 * Record a geometry correction after the tech moves or resizes a RoomPlan
 * room. Updates areaM2; does not change provenance (still needs Confirm
 * if pending).
 *
 * An object:modified with no real change — same current area, points and
 * length/width — appends nothing. The comparison is the room's current
 * recorded geometry, not only `originalPoints`, so a room already
 * corrected once does not gain another entry when its label, material
 * or water category is edited.
 */
export function recordRoomPlanGeometryCorrection(
  data: Record<string, unknown>,
  next: {
    points: { x: number; y: number }[];
    areaM2: number;
    lengthM?: number;
    widthM?: number;
  },
  opts?: { by?: string; at?: string },
): Record<string, unknown> {
  if (data.captureAdapter !== "roomplan") {
    return { ...data, areaM2: next.areaM2 };
  }

  const beforePoints = currentRecordedPoints(data);
  const beforeLength = finiteNumber(data.lengthM);
  const beforeWidth = finiteNumber(data.widthM);
  const nextLength = finiteNumber(next.lengthM);
  const nextWidth = finiteNumber(next.widthM);

  const areaChanged = next.areaM2 !== data.areaM2;
  const pointsChanged = !samePoints(beforePoints, next.points);
  const lengthChanged =
    nextLength !== undefined && nextLength !== beforeLength;
  const widthChanged = nextWidth !== undefined && nextWidth !== beforeWidth;

  if (!areaChanged && !pointsChanged && !lengthChanged && !widthChanged) {
    return { ...data };
  }

  return {
    ...data,
    areaM2: next.areaM2,
    ...(lengthChanged ? { lengthM: nextLength } : {}),
    ...(widthChanged ? { widthM: nextWidth } : {}),
    correctionHistory: appendRoomPlanCorrection(
      data.correctionHistory as RoomPlanCorrectionEntry[] | undefined,
      {
        at: opts?.at,
        by: opts?.by,
        field: "geometry",
        before: {
          areaM2: data.areaM2,
          points: beforePoints,
          ...(beforeLength !== undefined ? { lengthM: beforeLength } : {}),
          ...(beforeWidth !== undefined ? { widthM: beforeWidth } : {}),
        },
        after: {
          areaM2: next.areaM2,
          points: next.points,
          ...(lengthChanged ? { lengthM: nextLength } : {}),
          ...(widthChanged ? { widthM: nextWidth } : {}),
        },
      },
    ),
  };
}

/**
 * Mark a RoomPlan room excluded from measured quantities (still on canvas).
 * Forces underlay_reference so it cannot bill even after a prior confirm.
 */
export function recordRoomPlanExclude(
  data: Record<string, unknown>,
  opts?: { by?: string; at?: string; note?: string },
): Record<string, unknown> {
  if (data.captureAdapter !== "roomplan") {
    return { ...data, provenance: "underlay_reference", excluded: true };
  }
  return {
    ...data,
    provenance: "underlay_reference",
    excluded: true,
    correctionHistory: appendRoomPlanCorrection(
      data.correctionHistory as RoomPlanCorrectionEntry[] | undefined,
      {
        at: opts?.at,
        by: opts?.by,
        field: "exclude",
        before: data.provenance,
        after: "excluded",
        note: opts?.note ?? "Technician excluded unscanned / incorrect region",
      },
    ),
  };
}
