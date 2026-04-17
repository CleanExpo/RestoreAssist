/**
 * NZ Moisture-in-Buildings Advisory Gate — RA-1136c
 *
 * Evaluates moisture readings against AS/NZS 4849.1 material limits.
 * WARN-ONLY — does not block submission, but surfaces advisory warnings
 * so the technician is informed before finalising the report.
 *
 * Authority: AS/NZS 4849.1 (Moisture in buildings — Assessment and evaluation)
 */

import { prisma } from "@/lib/prisma";

// Material moisture limits per AS/NZS 4849.1 (simplified for MVP)
// Keys are prefix-matched against the lowercase surfaceType field.
const MOISTURE_LIMITS: Record<string, number> = {
  timber: 20, // %MC dry-standard
  plasterboard: 1, // WME
  concrete: 4, // %MC
  carpet: 10, // %MC
  "solid wood floor": 12,
  default: 18,
};

function getLimitForSurface(surfaceType: string): {
  limit: number;
  material: string;
} {
  const lower = surfaceType.toLowerCase();
  for (const [key, limit] of Object.entries(MOISTURE_LIMITS)) {
    if (key === "default") continue;
    if (lower.startsWith(key)) {
      return { limit, material: key };
    }
  }
  return { limit: MOISTURE_LIMITS.default, material: "default" };
}

export type NzMoistureGateResult = {
  canSubmit: true;
  warnings: string[];
};

/**
 * Check each moisture reading on the inspection against AS/NZS 4849.1 limits.
 * Always returns canSubmit: true — this gate is advisory only.
 */
export async function checkNzMoistureGate(
  inspectionId: string,
): Promise<NzMoistureGateResult> {
  const readings = await prisma.moistureReading.findMany({
    where: { inspectionId },
    select: {
      id: true,
      surfaceType: true,
      moistureLevel: true,
      unit: true,
      location: true,
    },
    take: 200,
  });

  const warnings: string[] = [];

  for (const reading of readings) {
    const { limit, material } = getLimitForSurface(reading.surfaceType);
    if (reading.moistureLevel > limit) {
      warnings.push(
        `AS/NZS 4849.1: ${reading.surfaceType} at ${reading.location} reads ` +
          `${reading.moistureLevel}${reading.unit ?? "%"} — exceeds ${material} limit of ${limit}`,
      );
    }
  }

  return { canSubmit: true, warnings };
}
