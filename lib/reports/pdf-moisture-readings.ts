/**
 * Build PDF Section 4 rows from relational MoistureReading rows (P2 / V1 P1-4).
 */

export type RelationalMoistureReading = {
  location: string;
  surfaceType: string;
  moistureLevel: number;
  isBaseline?: boolean;
  isMonitoringPoint?: boolean;
  recordedAt?: Date | null;
  createdAt?: Date | null;
  depth?: string | null;
};

export function relationalMoistureToPdfRows(
  readings: RelationalMoistureReading[],
): Array<Record<string, unknown>> {
  return readings.map((r) => ({
    location: r.location,
    material: r.surfaceType,
    moistureLevel: r.moistureLevel,
    surfaceType: r.surfaceType,
    isBaseline: r.isBaseline,
    isMonitoringPoint: r.isMonitoringPoint,
    date: (r.recordedAt ?? r.createdAt)?.toISOString?.() ?? null,
    role: r.isBaseline
      ? "Baseline"
      : r.isMonitoringPoint
        ? "Monitoring"
        : "Affected",
  }));
}
