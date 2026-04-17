/**
 * Moisture Trend Anomaly Detection — RA-1131
 *
 * Detects plateau / rising / stuck-high patterns in moisture readings over time.
 * Flags early warning for hidden moisture sources, HVAC faults, and imminent
 * mould risk — prevents the "reopened claim weeks later" scenario.
 *
 * Thresholds per IICRC S500:2025 moisture monitoring concern zone:
 *   - moistureLevel > 20% on Day 3+ is a concern zone breach
 *   - Any rising trend after Day 2 requires investigation
 *   - Stuck-high (>60%) after 48h indicates critical drying failure
 */

import { prisma } from "@/lib/prisma";

export type MoistureAnomaly = {
  location: string;
  severity: "plateau" | "rising" | "stuck_high";
  message: string;
  recentReadings: Array<{
    capturedAt: Date;
    value: number;
    unit: string | null;
  }>;
};

export type MoistureTrendResult = {
  hasAnomalies: boolean;
  anomalies: MoistureAnomaly[];
};

/** IICRC S500:2025 — moisture level concern zone threshold (>20% on Day 3+) */
const IICRC_CONCERN_ZONE = 20;

/**
 * Drying failure threshold — critically dangerous after 48h.
 * Above this level, mould colonisation can begin within 24-48h (IICRC S500:2025 §7).
 * Distinct from the plateau concern zone (>20%): stuck_high only fires when
 * moisture remains critically elevated despite ongoing drying.
 */
const STUCK_HIGH_THRESHOLD = 60;

/** Minimum span required to evaluate a trend (48 hours in ms) */
const MIN_SPAN_MS = 48 * 60 * 60 * 1000;

/** Plateau tolerance — < 5 percentage-point change across the window */
const PLATEAU_DELTA = 5;

export async function detectMoistureTrendAnomalies(
  inspectionId: string,
): Promise<MoistureTrendResult> {
  const readings = await prisma.moistureReading.findMany({
    where: { inspectionId },
    select: {
      location: true,
      moistureLevel: true,
      unit: true,
      recordedAt: true,
    },
    take: 500,
    orderBy: { recordedAt: "asc" },
  });

  // Group readings by location
  const byLocation = new Map<
    string,
    Array<{ capturedAt: Date; value: number; unit: string | null }>
  >();

  for (const r of readings) {
    const key = r.location;
    if (!byLocation.has(key)) {
      byLocation.set(key, []);
    }
    byLocation.get(key)!.push({
      capturedAt: r.recordedAt,
      value: r.moistureLevel,
      unit: r.unit,
    });
  }

  const anomalies: MoistureAnomaly[] = [];

  for (const [location, locationReadings] of byLocation) {
    // Need at least 3 readings
    if (locationReadings.length < 3) continue;

    // Already sorted ascending by recordedAt
    const oldest = locationReadings[0];
    const latest = locationReadings[locationReadings.length - 1];

    // Must span at least 48 hours
    const spanMs = latest.capturedAt.getTime() - oldest.capturedAt.getTime();
    if (spanMs < MIN_SPAN_MS) continue;

    // Take last 3 readings for analysis
    const last3 = locationReadings.slice(-3);
    const first = last3[0];
    const last = last3[last3.length - 1];

    const delta = last.value - first.value;

    let anomaly: MoistureAnomaly | null = null;

    if (delta > 0) {
      // Rising — moisture increasing after 48h+ is always a red flag
      anomaly = {
        location,
        severity: "rising",
        message:
          `IICRC S500:2025: Moisture at "${location}" is rising ` +
          `(${first.value.toFixed(1)} → ${last.value.toFixed(1)}${last.unit ?? "%"}) ` +
          `after ${Math.round(spanMs / 3600000)}h. ` +
          `Investigate for hidden moisture source or HVAC fault.`,
        recentReadings: last3,
      };
    } else if (last.value > STUCK_HIGH_THRESHOLD) {
      // Still critically wet despite some reduction — check before plateau
      // because stuck_high (>60%) is more severe than a plateau at >20%
      anomaly = {
        location,
        severity: "stuck_high",
        message:
          `IICRC S500:2025 §7: Moisture at "${location}" remains critically high ` +
          `at ${last.value.toFixed(1)}${last.unit ?? "%"} after ${Math.round(spanMs / 3600000)}h. ` +
          `Imminent mould risk — review drying strategy and check for structural concealment.`,
        recentReadings: last3,
      };
    } else if (
      Math.abs(delta) < PLATEAU_DELTA &&
      last.value > IICRC_CONCERN_ZONE
    ) {
      // Plateau at elevated level — still wet, not drying
      anomaly = {
        location,
        severity: "plateau",
        message:
          `IICRC S500:2025 §7: Moisture at "${location}" has plateaued at ` +
          `${last.value.toFixed(1)}${last.unit ?? "%"} (concern zone >20%) ` +
          `over ${Math.round(spanMs / 3600000)}h. ` +
          `Probable hidden moisture source or inadequate drying equipment.`,
        recentReadings: last3,
      };
    }

    if (anomaly) {
      anomalies.push(anomaly);
    }
  }

  return {
    hasAnomalies: anomalies.length > 0,
    anomalies,
  };
}
