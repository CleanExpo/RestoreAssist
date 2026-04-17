/**
 * NZBS Compliance Gate — RA-1136e
 *
 * Checks that required New Zealand Building Standard clauses are addressed
 * before an NZ-jurisdiction inspection can be submitted.
 *
 * BLOCKING for NZ-jurisdiction inspections only.
 * AU inspections receive an immediate no-op early exit (canSubmit: true).
 *
 * Authority: New Zealand Building Code (NZBC) — Schedule 1, Building Act 2004
 *   E2 — External Moisture
 *   E3 — Internal Moisture
 *   F2 — Hazardous Building Materials
 *
 * TODO RA-1120: propertyCountry is not yet on the Inspection model.
 * Until that field is added, this gate defaults to "AU" and is a no-op for all
 * inspections. Wire up the country field once RA-1120 lands.
 */

import { prisma } from "@/lib/prisma";

export type NzbsClause = {
  clause: string;
  title: string;
  addressed: boolean;
};

export type NzbsGateResult = {
  canSubmit: boolean;
  blockers: string[];
  requiredClauses: NzbsClause[];
};

// Water sources that indicate roof/wall ingress (external moisture trigger for E2)
const EXTERNAL_INGRESS_SOURCES = [
  "roof",
  "wall",
  "external",
  "ingress",
  "penetration",
];

/**
 * Evaluate NZBS clause coverage for the inspection.
 *
 * Returns canSubmit: false (with blockers) only for NZ-jurisdiction inspections
 * where one or more required clauses are not addressed.
 */
export async function checkNzbsGate(
  inspectionId: string,
): Promise<NzbsGateResult> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      // TODO RA-1120: add propertyCountry to select once field exists on schema
      propertyYearBuilt: true,
      inspectionDate: true,
      affectedAreas: {
        select: { category: true, waterSource: true },
        take: 200,
      },
    },
  });

  if (!inspection) {
    return { canSubmit: true, blockers: [], requiredClauses: [] };
  }

  // TODO RA-1120: replace with `inspection.propertyCountry ?? "AU"` once field added.
  // Currently no country field exists — default AU so this gate is a no-op.
  const propertyCountry: string = "AU";

  if (propertyCountry !== "NZ") {
    return { canSubmit: true, blockers: [], requiredClauses: [] };
  }

  // ── Determine which NZBS clauses are required ────────────────────────────

  const areas = inspection.affectedAreas;
  const yearBuilt = inspection.propertyYearBuilt;

  // E2 — External Moisture: roof/wall water ingress reported
  const hasExternalIngress = areas.some((a) =>
    EXTERNAL_INGRESS_SOURCES.some((term) =>
      a.waterSource.toLowerCase().includes(term),
    ),
  );

  // E3 — Internal Moisture: any Cat 2 or Cat 3 water damage
  const hasInternalMoisture = areas.some(
    (a) => a.category === "2" || a.category === "3",
  );

  // F2 — Hazardous Building Materials: pre-2000 NZ buildings
  const hasHazardousMaterials = yearBuilt != null && yearBuilt < 2000;

  const requiredClauses: NzbsClause[] = [];

  if (hasExternalIngress) {
    requiredClauses.push({
      clause: "E2",
      title: "External Moisture",
      // "addressed" means the clause has been evaluated — for MVP, requiring a
      // non-empty affectedAreas entry with an external source is sufficient signal.
      addressed: true,
    });
  }

  if (hasInternalMoisture) {
    requiredClauses.push({
      clause: "E3",
      title: "Internal Moisture",
      addressed: true,
    });
  }

  if (hasHazardousMaterials) {
    requiredClauses.push({
      clause: "F2",
      title: "Hazardous Building Materials",
      // Not addressed until the technician explicitly records an F2 evaluation.
      // For MVP, pre-2000 buildings always flag this as unaddressed.
      addressed: false,
    });
  }

  const unaddressed = requiredClauses.filter((c) => !c.addressed);
  const blockers = unaddressed.map(
    (c) => `NZBC ${c.clause} (${c.title}) must be evaluated before submission`,
  );

  return {
    canSubmit: blockers.length === 0,
    blockers,
    requiredClauses,
  };
}
