/**
 * P2 / V1 P1-2 (D-003) — evaluate drying against the **latest** reading per
 * monitoring point, not every row in history. Baseline (unaffected-area)
 * readings are excluded from the drying-goal pass/fail set.
 */

import { isProgressReading } from "@/lib/iicrc-dry-standards";

export type MoistureReadingRow = {
  id: string;
  location: string;
  surfaceType: string;
  moistureLevel: number;
  unit?: string | null;
  // Required keys (RA-8508 review): readers select both, or pass null when
  // their query already excludes invalidated rows.
  isBaseline: boolean;
  isMonitoringPoint?: boolean;
  invalidatedAt: Date | string | null;
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
export function latestMonitoringReadingsForDryingGoal<T extends MoistureReadingRow>(
  readings: T[],
): T[] {
  const candidates = readings.filter(isProgressReading);
  const byKey = new Map<string, T>();

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
