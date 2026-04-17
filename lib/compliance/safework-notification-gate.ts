/**
 * SafeWork Notification Gate — RA-1136d
 *
 * Auto-detects conditions that require notification to a state WHS regulator.
 * WARN-ONLY — does not block submission, but returns a list of actionable
 * notifications the user must file before the statutory deadline.
 *
 * Authority:
 *   AU — Work Health and Safety Act 2011 (Cth) + state equivalents
 *   NZ — Health and Safety at Work Act 2015
 *
 * Triggers:
 *   1. Asbestos suspected: building pre-2004 (AU) / pre-2000 (NZ) AND
 *      WHSIncident with incidentType containing "asbestos"
 *   2. Mould Cat 3 >10 m²: AffectedArea category === "3" AND affectedSquareFootage > 10
 *      NOTE: AffectedArea uses affectedSquareFootage (sq ft), so we convert:
 *            10 m² ≈ 107.6 sq ft. TODO RA-XXXX: migrate AffectedArea to SI units.
 *   3. Biohazard: WHSIncident with incidentType containing "biohazard", "sewage", or "blood"
 */

import { prisma } from "@/lib/prisma";

// TODO RA-1120: add propertyCountry to Inspection model. Until then, default AU.
type Jurisdiction =
  | "NSW"
  | "VIC"
  | "QLD"
  | "WA"
  | "SA"
  | "TAS"
  | "ACT"
  | "NT"
  | "NZ";

const REGULATOR_MAP: Record<Jurisdiction, { name: string; url: string }> = {
  NSW: { name: "SafeWork NSW", url: "https://www.safework.nsw.gov.au" },
  VIC: { name: "WorkSafe Victoria", url: "https://www.worksafe.vic.gov.au" },
  QLD: {
    name: "Workplace Health and Safety Queensland",
    url: "https://www.worksafe.qld.gov.au",
  },
  WA: {
    name: "WorkSafe Western Australia",
    url: "https://www.worksafe.wa.gov.au",
  },
  SA: { name: "SafeWork SA", url: "https://www.safework.sa.gov.au" },
  TAS: { name: "WorkSafe Tasmania", url: "https://worksafe.tas.gov.au" },
  ACT: { name: "WorkSafe ACT", url: "https://www.worksafe.act.gov.au" },
  NT: { name: "NT WorkSafe", url: "https://worksafe.nt.gov.au" },
  NZ: { name: "WorkSafe New Zealand", url: "https://www.worksafe.govt.nz" },
};

// Approximate postcode → state mapping (covers AU states only; NZ detection handled separately)
function detectJurisdiction(postcode: string): Jurisdiction {
  const pc = parseInt(postcode, 10);
  if (isNaN(pc)) return "NSW"; // safe fallback
  if (pc >= 1000 && pc <= 2999) return "NSW";
  if (pc >= 3000 && pc <= 3999) return "VIC";
  if (pc >= 4000 && pc <= 4999) return "QLD";
  if (pc >= 5000 && pc <= 5999) return "SA";
  if (pc >= 6000 && pc <= 6999) return "WA";
  if (pc >= 7000 && pc <= 7999) return "TAS";
  if (pc >= 200 && pc <= 299) return "ACT";
  if (pc >= 800 && pc <= 899) return "NT";
  return "NSW"; // safe fallback
}

export type SafeWorkNotification = {
  type: "asbestos" | "mould" | "biohazard";
  regulator: string;
  regulatorUrl: string;
  deadline: Date;
};

export type SafeWorkGateResult = {
  canSubmit: true;
  warnings: string[];
  notifications: SafeWorkNotification[];
};

/**
 * Evaluate WHS notification triggers for the inspection.
 * Always returns canSubmit: true — caller surfaces notifications to the user.
 */
export async function checkSafeworkGate(
  inspectionId: string,
): Promise<SafeWorkGateResult> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      inspectionDate: true,
      propertyPostcode: true,
      propertyYearBuilt: true,
      // TODO RA-1120: select propertyCountry once added to schema
      affectedAreas: {
        select: { category: true, affectedSquareFootage: true },
        take: 200,
      },
      whsIncidents: {
        select: { incidentType: true },
        take: 100,
      },
    },
  });

  if (!inspection) {
    return { canSubmit: true, warnings: [], notifications: [] };
  }

  const notifications: SafeWorkNotification[] = [];
  const warnings: string[] = [];

  // TODO RA-1120: derive jurisdiction from propertyCountry when available.
  // For now, treat all inspections as AU and detect state from postcode.
  const jurisdiction = detectJurisdiction(inspection.propertyPostcode);
  const regulator = REGULATOR_MAP[jurisdiction];
  // Deadline: inspectionDate + 24 hours per WHS Act
  const deadline = new Date(
    inspection.inspectionDate.getTime() + 24 * 60 * 60 * 1000,
  );

  const incidentTypes = inspection.whsIncidents.map((i) =>
    i.incidentType.toLowerCase(),
  );

  // ── Trigger 1: Asbestos suspected ─────────────────────────────────────────
  // AU: pre-2004 building; NZ: pre-2000 building (NZ check skipped until RA-1120)
  const yearBuilt = inspection.propertyYearBuilt;
  const buildingPreDates = yearBuilt != null && yearBuilt < 2004;
  const hasAsbestosIncident = incidentTypes.some((t) => t.includes("asbestos"));
  if (buildingPreDates && hasAsbestosIncident) {
    notifications.push({
      type: "asbestos",
      regulator: regulator.name,
      regulatorUrl: regulator.url,
      deadline,
    });
    warnings.push(
      `Asbestos suspected (pre-2004 building, year built: ${yearBuilt}). ` +
        `Notify ${regulator.name} by ${deadline.toISOString()}.`,
    );
  }

  // ── Trigger 2: Mould Cat 3 > 10 m² ────────────────────────────────────────
  // AffectedArea.affectedSquareFootage is sq ft; 10 m² ≈ 107.6 sq ft
  const MOULD_THRESHOLD_SQFT = 107.6;
  const hasMouldTrigger = inspection.affectedAreas.some(
    (a) => a.category === "3" && a.affectedSquareFootage > MOULD_THRESHOLD_SQFT,
  );
  if (hasMouldTrigger) {
    notifications.push({
      type: "mould",
      regulator: regulator.name,
      regulatorUrl: regulator.url,
      deadline,
    });
    warnings.push(
      `Mould Category 3 area exceeds 10 m². ` +
        `Notify ${regulator.name} by ${deadline.toISOString()}.`,
    );
  }

  // ── Trigger 3: Biohazard ──────────────────────────────────────────────────
  const BIOHAZARD_TERMS = ["biohazard", "sewage", "blood"];
  const hasBiohazard = incidentTypes.some((t) =>
    BIOHAZARD_TERMS.some((term) => t.includes(term)),
  );
  if (hasBiohazard) {
    notifications.push({
      type: "biohazard",
      regulator: regulator.name,
      regulatorUrl: regulator.url,
      deadline,
    });
    warnings.push(
      `Biohazard condition detected. ` +
        `Notify ${regulator.name} by ${deadline.toISOString()}.`,
    );
  }

  return { canSubmit: true, warnings, notifications };
}
