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
 *   2. Mould Cat 3 ≥10 m²: AffectedArea category === "3" AND affectedAreaSqm >= 10 (RA-7001).
 *      affectedAreaSqm (m²) is the canonical unit; legacy rows fall back to
 *      converting the deprecated affectedSquareFootage (sq ft) via resolveAreaSqm.
 *   3. Biohazard: WHSIncident with incidentType containing "biohazard", "sewage", or "blood"
 */

import { prisma } from "@/lib/prisma";
import { regulationFor } from "@/lib/compliance/regulatory-registry";
import { resolveAreaSqm } from "@/lib/units";
import {
  asbestosEraBasis,
  presumeAsbestosFromEra,
  type AsbestosJurisdiction,
} from "./asbestos-era";

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
  /**
   * What the law actually requires, resolved from the registry per country.
   *
   * REPLACES A `deadline: Date` THAT WAS WRONG TWICE OVER. It was computed as
   * `inspectionDate + 24 hours` under a comment reading "per WHS Act". The
   * figure 24 appears in neither country's Act: Australia requires notification
   * IMMEDIATELY (WHS Act s38) and New Zealand AS SOON AS POSSIBLE (HSWA s56).
   * And the clock ran from the inspection date rather than from the moment the
   * business became aware, so an incident found later was handed a deadline
   * already in the past.
   *
   * A countdown is the wrong shape for this duty at all: it tells a reader they
   * have time in hand, and they do not. So the notification now carries the
   * instruction, its source, and the date it was checked.
   */
  notifyBy: string;
  /** The registry entry backing the above, so the claim is traceable. */
  registryEntryId: string;
  instrument: string;
  provision?: string;
  sourceUrl: string;
  verifiedAt: string;
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
      propertyCountry: true,
      affectedAreas: {
        select: {
          category: true,
          affectedAreaSqm: true,
          affectedSquareFootage: true,
        },
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

  // A New Zealand job is notified to WorkSafe New Zealand, not to an Australian
  // state regulator.
  //
  // This used to read the postcode alone. detectJurisdiction() parses Australian
  // postcode ranges and falls back to "NSW", so it can never return NZ -- which
  // made the NZ entry in REGULATOR_MAP unreachable and told a New Zealand
  // technician to notify SafeWork NSW within 24 hours. Australian and New
  // Zealand postcodes are both four digits and overlap, so the postcode could
  // not have distinguished them even in principle.
  //
  // Inspection.propertyCountry has existed since RA-6996; the TODOs claiming
  // otherwise were stale. It defaults to "AU", so only a positive "NZ" is
  // treated as decisive -- an "AU" falls through to postcode-based state
  // detection exactly as before, which keeps every existing Australian result
  // unchanged.
  const jurisdiction: Jurisdiction =
    inspection.propertyCountry?.trim().toUpperCase() === "NZ"
      ? "NZ"
      : detectJurisdiction(inspection.propertyPostcode);
  const regulator = REGULATOR_MAP[jurisdiction];

  // The duty, from the registry rather than from a literal here. Resolved for
  // the job's country: a New Zealand job must never be shown Australia's rule.
  const duty = regulationFor(
    "whs",
    jurisdiction,
    "notifiable-incident-duty",
  );
  const notifyBy = duty
    ? {
        notifyBy: firstSentence(duty.requirement),
        registryEntryId: duty.id,
        instrument: duty.instrument,
        provision: duty.provision,
        sourceUrl: duty.sourceUrl,
        verifiedAt: duty.verifiedAt,
      }
    : // Cannot happen with the registry as it stands -- both countries carry an
      // entry -- but silence here would be a notification with no duty on it,
      // so say plainly that the requirement could not be resolved.
      {
        notifyBy:
          "RestoreAssist could not resolve the notification requirement for this jurisdiction. Contact the regulator named above without delay.",
        registryEntryId: "",
        instrument: "",
        sourceUrl: "",
        verifiedAt: "",
      };

  const incidentTypes = inspection.whsIncidents.map((i) =>
    i.incidentType.toLowerCase(),
  );

  // ── Trigger 1: Asbestos suspected ─────────────────────────────────────────
  //
  // Through the SSOT, not a literal. This carried `yearBuilt < 2004` beside a
  // comment reading "NZ check skipped until RA-1120", which was harmless only
  // for as long as `jurisdiction` could never BE New Zealand -- it came from an
  // Australian postcode map. Reading propertyCountry above made NZ reachable
  // and turned that dormant note into a live defect: New Zealand's threshold is
  // 1 January 2000, so a 2002 Auckland building was told it pre-dated the
  // threshold when its own rule says it does not.
  //
  // presumeAsbestosFromEra reads both years from
  // lib/compliance/regulatory-registry/asbestos.ts, where each carries its
  // instrument, source and verification date.
  const asbestosJurisdiction: AsbestosJurisdiction =
    jurisdiction === "NZ" ? "NZ" : "AU";
  const eraBasis = asbestosEraBasis(asbestosJurisdiction);
  const yearBuilt = inspection.propertyYearBuilt;
  const buildingPreDates = presumeAsbestosFromEra(
    yearBuilt,
    asbestosJurisdiction,
  );
  const hasAsbestosIncident = incidentTypes.some((t) => t.includes("asbestos"));
  if (buildingPreDates && hasAsbestosIncident) {
    notifications.push({
      type: "asbestos",
      regulator: regulator.name,
      regulatorUrl: regulator.url,
      ...notifyBy,
    });
    warnings.push(
      // The year the gate actually applied, not a fixed one. "pre-2004" printed
      // on a New Zealand job teaches the technician the wrong rule even when
      // the decision itself was right.
      `Asbestos suspected (pre-${eraBasis.year} building, year built: ${yearBuilt}). ` +
        `${regulator.name}: ${notifyBy.notifyBy}`,
    );
  }

  // ── Trigger 2: Mould Cat 3 ≥ 10 m² ────────────────────────────────────────
  // Canonical unit is m² (affectedAreaSqm). RA-7001 removed the sq-ft literal.
  const MOULD_THRESHOLD_SQM = 10;
  const hasMouldTrigger = inspection.affectedAreas.some(
    (a) => a.category === "3" && resolveAreaSqm(a) >= MOULD_THRESHOLD_SQM,
  );
  if (hasMouldTrigger) {
    notifications.push({
      type: "mould",
      regulator: regulator.name,
      regulatorUrl: regulator.url,
      ...notifyBy,
    });
    warnings.push(
      `Mould Category 3 area exceeds 10 m². ` +
        `${regulator.name}: ${notifyBy.notifyBy}`,
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
      ...notifyBy,
    });
    warnings.push(
      `Biohazard condition detected. ` +
        `${regulator.name}: ${notifyBy.notifyBy}`,
    );
  }

  return { canSubmit: true, warnings, notifications };
}

/**
 * The first sentence of a requirement, for a surface with one line to give.
 *
 * The full text and its source travel alongside on the same object, so this is
 * a summary the reader can expand -- never a paraphrase, which would be a second
 * wording of the rule and could drift from the registry's.
 */
function firstSentence(requirement: string): string {
  const stop = requirement.indexOf(". ");
  return stop === -1 ? requirement : requirement.slice(0, stop + 1).trim();
}
