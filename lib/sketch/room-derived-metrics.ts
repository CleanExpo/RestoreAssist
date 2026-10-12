/**
 * V1 Phase 3 (P3-4) — derive area from SketchRoom for scope/PDF.
 */

export type SketchRoomMetrics = {
  areaM2: number | null;
  perimeterM: number | null;
  heightM: number | null;
};

export function metricsFromSketchRoom(room: {
  areaM2?: number | null;
  perimeterM?: number | null;
  heightM?: number | null;
}): SketchRoomMetrics {
  return {
    areaM2: room.areaM2 ?? null,
    perimeterM: room.perimeterM ?? null,
    heightM: room.heightM ?? null,
  };
}

export function volumeM3(metrics: SketchRoomMetrics): number | null {
  if (
    metrics.areaM2 == null ||
    metrics.heightM == null ||
    !Number.isFinite(metrics.areaM2) ||
    !Number.isFinite(metrics.heightM)
  ) {
    return null;
  }
  return Math.round(metrics.areaM2 * metrics.heightM * 100) / 100;
}
