/**
 * P2 / V1 P1-2 (D-003) — evaluate drying against the **latest** reading per
 * monitoring point, not every row in history. Baseline (unaffected-area)
 * readings are excluded from the drying-goal pass/fail set.
 */

export type MoistureReadingRow = {
  id: string;
  location: string;
  surfaceType: string;
  moistureLevel: number;
  isBaseline?: boolean;
  isMonitoringPoint?: boolean;
  invalidatedAt?: Date | string | null;
  recordedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

function readingTimestamp(r: MoistureReadingRow): number {
  const raw = r.recordedAt ?? r.createdAt;
  if (!raw) return 0;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function pointKey(r: MoistureReadingRow): string {
  return `${r.location.trim().toLowerCase()}|${r.surfaceType.trim().toLowerCase()}`;
}

/**
 * Readings that participate in drying-goal evaluation:
 * - excludes baselines (reference only)
 * - one row per location+surface: the newest by recordedAt/createdAt
 */
export function latestMonitoringReadingsForDryingGoal(
  readings: MoistureReadingRow[],
): MoistureReadingRow[] {
  const candidates = readings.filter((r) => !r.isBaseline && !r.invalidatedAt);
  const byKey = new Map<string, MoistureReadingRow>();

  for (const reading of candidates) {
    const key = pointKey(reading);
    const existing = byKey.get(key);
    if (!existing || readingTimestamp(reading) >= readingTimestamp(existing)) {
      byKey.set(key, reading);
    }
  }

  return [...byKey.values()].sort(
    (a, b) => readingTimestamp(a) - readingTimestamp(b),
  );
}
