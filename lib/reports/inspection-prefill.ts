/**
 * Inspection -> report form prefill.
 *
 * WHY THIS EXISTS. The inspections list links "Generate report" to
 * `/dashboard/reports/new?inspectionId=<id>`, and that page has never read the
 * parameter. A technician who has just recorded the address, postcode, their own
 * name, the attendance date and the water classification lands on an empty form
 * and types all of it again. The second copy is then free to disagree with the
 * first, which is the failure class this codebase keeps paying for: one fact,
 * two surfaces, no owner.
 *
 * WHY IT IS A MODULE AND NOT AN EFFECT IN THE PAGE. The page already carries one
 * hand-rolled mapping (guided-interview -> form fields) written inline. A second
 * inline mapping would be the same fact computed two ways. This module is the one
 * owner of "what a report form can learn from an inspection", it is pure, and it
 * is tested without a database.
 *
 * THE RULE IT FOLLOWS. A field the inspection does not record is ABSENT from the
 * output -- never "" and never a default. An empty string is indistinguishable
 * from a value the technician deliberately cleared, and a default is worse: the
 * guided-interview path in app/dashboard/reports/new/page.tsx defaults
 * `hazardType` to "WATER_DAMAGE", so an asbestos job that reaches it silently
 * claims to be a water job. Nothing here defaults.
 */

import { normalizeClaimType } from "@/lib/evidence/claim-type";

/**
 * The subset of an Inspection this mapping reads. Declared structurally rather
 * than as a Prisma type so the pure function stays testable without a client,
 * and so widening the query cannot silently widen the mapping.
 */
export interface InspectionPrefillSource {
  inspectionNumber?: string | null;
  propertyAddress?: string | null;
  propertyPostcode?: string | null;
  inspectionDate?: Date | string | null;
  technicianName?: string | null;
  lossDescription?: string | null;
  claimType?: string | null;
  propertyYearBuilt?: number | null;
  propertyWallConstruction?: string | null;
  propertyWallMaterial?: string | null;
  waterDamageClassification?: {
    waterCategory?: string | null;
    damageClass?: string | null;
    lossSourceType?: string | null;
  } | null;
  /** Ordered newest-first by the caller; the first final row wins. */
  classifications?: Array<{
    category?: string | null;
    class?: string | null;
    isFinal?: boolean | null;
  }> | null;
}

/** Report form field names, as `ReportWorkflow` and the Report model use them. */
export type ReportPrefillFields = Partial<{
  jobNumber: string;
  propertyAddress: string;
  propertyPostcode: string;
  technicianName: string;
  technicianAttendanceDate: string;
  technicianFieldReport: string;
  hazardType: string;
  buildingAge: number;
  structureType: string;
  waterCategory: string;
  waterClass: string;
  sourceOfWater: string;
}>;

export interface ReportPrefill {
  fields: ReportPrefillFields;
  /** Field names actually populated, in a stable order, for the UI's count. */
  filled: string[];
}

/**
 * `LossSourceType` is a category; `Report.sourceOfWater` is prose that
 * components/reports/damage-report-view.tsx drops into a client-facing sentence,
 * "Water entered the property from <source>." So these read as the tail of that
 * sentence rather than as enum labels -- "from PLUMBING" is not something to put
 * in front of a homeowner.
 *
 * UNKNOWN is deliberately absent. An unrecorded source is not a source, and
 * "Water entered the property from unknown" states a finding nobody made.
 */
const LOSS_SOURCE_PROSE: Record<string, string> = {
  PLUMBING: "a plumbing failure",
  ROOF: "the roof",
  APPLIANCE: "an appliance failure",
  FLOOD: "flooding",
  GROUNDWATER: "groundwater",
  CONDENSATION: "condensation",
  HVAC: "the HVAC system",
};

/** "CAT_2" -> "2", "CLASS_3" -> "3". Report stores the bare digit. */
function digitSuffix(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const m = /^(?:CAT|CLASS)_(\d)$/.exec(value.trim().toUpperCase());
  return m ? m[1] : undefined;
}

/** A bare digit, from either the enum form or a column that already holds one. */
function classificationDigit(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d$/.test(trimmed)) return trimmed;
  return digitSuffix(trimmed);
}

function isoDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function text(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Fields this mapping will NOT populate, and why. Kept in code rather than in a
 * commit message so the next person adding one has to argue with the reason.
 *
 * - `affectedArea`. Report.affectedArea's schema comment says square footage;
 *   AffectedArea.affectedAreaSqm is square metres (RA-7001) and its sq ft column
 *   is deprecated. NO consumer settles it: the only reader is excel-export.ts,
 *   which prints the number with no unit and no conversion. Summing m² into a
 *   field that may mean sq ft is a silent 10.76x error in a document that prices
 *   work. Leave it for a human until the column's unit is decided.
 * - `clientName`, `clientContactDetails`, `claimReferenceNumber`,
 *   `insuranceType`. Not columns on Inspection. There is nothing to copy.
 * - `incidentDate`. Derivable only as inspectionDate minus
 *   AffectedArea.timeSinceLoss, which is an inference, not a record. A date on a
 *   report reads as observed; this one would not be.
 */
export const DELIBERATELY_NOT_PREFILLED = [
  "affectedArea",
  "clientName",
  "clientContactDetails",
  "claimReferenceNumber",
  "insuranceType",
  "incidentDate",
] as const;

export function buildReportPrefill(
  inspection: InspectionPrefillSource,
): ReportPrefill {
  const fields: ReportPrefillFields = {};

  const set = <K extends keyof ReportPrefillFields>(
    key: K,
    value: ReportPrefillFields[K] | undefined,
  ) => {
    if (value !== undefined) fields[key] = value;
  };

  set("jobNumber", text(inspection.inspectionNumber));
  set("propertyAddress", text(inspection.propertyAddress));
  set("propertyPostcode", text(inspection.propertyPostcode));
  set("technicianName", text(inspection.technicianName));
  set("technicianAttendanceDate", isoDate(inspection.inspectionDate));
  set("technicianFieldReport", text(inspection.lossDescription));

  // Via the single boundary normaliser. It returns null for the ClaimType values
  // with no unambiguous JobType (CONTENTS, BIOHAZARD, ODOUR, CARPET, HVAC,
  // ASBESTOS) -- those leave hazardType absent rather than guessing.
  const jobType = normalizeClaimType(inspection.claimType);
  if (jobType) fields.hazardType = jobType;

  // Report.buildingAge is the YEAR BUILT, not an age in years -- it is the
  // pre-1990 asbestos/lead trigger. Copy the year straight across; subtracting
  // it from the current year would move every pre-1990 job out of that trigger.
  if (
    typeof inspection.propertyYearBuilt === "number" &&
    Number.isInteger(inspection.propertyYearBuilt)
  ) {
    fields.buildingAge = inspection.propertyYearBuilt;
  }

  set(
    "structureType",
    text(inspection.propertyWallConstruction) ??
      text(inspection.propertyWallMaterial),
  );

  // The dedicated classification row is the newer, gated record (IICRC S500:2021
  // §7), so it wins. The Classification table is the older AI-classifier output
  // and only a row marked final may stand in for it.
  const wdc = inspection.waterDamageClassification;
  const finalClassification = (inspection.classifications ?? []).find(
    (c) => c?.isFinal,
  );

  set(
    "waterCategory",
    classificationDigit(wdc?.waterCategory) ??
      classificationDigit(finalClassification?.category),
  );
  set(
    "waterClass",
    classificationDigit(wdc?.damageClass) ??
      classificationDigit(finalClassification?.class),
  );

  const lossSource = wdc?.lossSourceType?.trim().toUpperCase();
  if (lossSource && LOSS_SOURCE_PROSE[lossSource]) {
    fields.sourceOfWater = LOSS_SOURCE_PROSE[lossSource];
  }

  return { fields, filled: Object.keys(fields) };
}
