/**
 * RA-8592: the storm assessment and site safety rows of the report PDF, built
 * from StormDamageAssessment. Pure, so it can be tested without a PDF.
 *
 * Print rules:
 * - Only fields the technician filled are printed. No "N/A" rows and no
 *   invented values; an absent record prints nothing at all.
 * - The safety flags (asbestosRiskFlag, engineerClearanceRequired,
 *   emergencyTarpingCompleted) default to false in the schema, so a false
 *   value cannot be told apart from "never answered". They print only when
 *   true; the report never states "no asbestos risk".
 */

export interface StormReportAssessment {
  bomEventReference?: string | null;
  windSpeedKmh?: number | null;
  eventType?: string | null;
  eventTimestamp?: Date | string | null;
  roofMaterialType?: string | null;
  roofDamageAreaM2?: number | null;
  damagePenetration?: string | null;
  waterIngressPoints?: string | null;
  engineerClearanceRequired?: boolean | null;
  emergencyTarpingCompleted?: boolean | null;
  emergencyTarpingM2?: number | null;
  emergencyTarpingTimestamp?: Date | string | null;
  waterCategory?: string | null;
  asbestosRiskFlag?: boolean | null;
}

type Row = [string, string];

const EVENT_TYPE: Record<string, string> = {
  STORM: "Storm",
  CYCLONE: "Cyclone",
  HAIL: "Hail",
  DOWNBURST: "Downburst",
  TORNADO: "Tornado",
};

const ROOF_MATERIAL: Record<string, string> = {
  COLORBOND: "Colorbond",
  TERRACOTTA: "Terracotta",
  SHINGLES: "Shingles",
  METAL: "Metal",
  OTHER: "Other",
};

const PENETRATION: Record<string, string> = {
  SURFACE: "Surface",
  PARTIAL: "Partial",
  FULL: "Full",
};

const WATER_CATEGORY: Record<string, string> = {
  CAT_1: "Category 1",
  CAT_2: "Category 2",
  CAT_3: "Category 3",
};

function present(v: string | null | undefined): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function fmtDateTime(v: Date | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Australia/Sydney",
  });
}

const label = (map: Record<string, string>, v: string) => map[v] ?? v;

/** Findings rows: only what was recorded. */
export function stormFindingRows(a: StormReportAssessment | null | undefined): Row[] {
  if (!a) return [];
  const rows: Row[] = [];
  if (present(a.bomEventReference)) rows.push(["BOM event reference:", a.bomEventReference.trim()]);
  if (present(a.eventType)) rows.push(["Event type:", label(EVENT_TYPE, a.eventType)]);
  const when = fmtDateTime(a.eventTimestamp);
  if (when) rows.push(["Event time:", when]);
  if (isNum(a.windSpeedKmh)) rows.push(["Wind speed:", `${a.windSpeedKmh} km/h`]);
  if (present(a.roofMaterialType)) rows.push(["Roof material:", label(ROOF_MATERIAL, a.roofMaterialType)]);
  if (isNum(a.roofDamageAreaM2)) rows.push(["Roof damage area:", `${a.roofDamageAreaM2} m2`]);
  if (present(a.damagePenetration)) rows.push(["Damage penetration:", label(PENETRATION, a.damagePenetration)]);
  if (present(a.waterIngressPoints)) rows.push(["Water entry points:", a.waterIngressPoints.trim()]);
  if (present(a.waterCategory)) rows.push(["Water category:", label(WATER_CATEGORY, a.waterCategory)]);
  if (a.emergencyTarpingCompleted === true) {
    const parts = ["Completed"];
    if (isNum(a.emergencyTarpingM2)) parts.push(`${a.emergencyTarpingM2} m2`);
    const at = fmtDateTime(a.emergencyTarpingTimestamp);
    if (at) parts.push(at);
    rows.push(["Emergency tarping:", parts.join(", ")]);
  }
  return rows;
}

/** Site safety rows: printed only when the technician raised the flag. */
export function stormSafetyRows(a: StormReportAssessment | null | undefined): Row[] {
  if (!a) return [];
  const rows: Row[] = [];
  if (a.asbestosRiskFlag === true) {
    rows.push(["Asbestos risk:", "Flagged by the technician"]);
  }
  if (a.engineerClearanceRequired === true) {
    rows.push(["Structural engineer clearance:", "Required (recorded by the technician)"]);
  }
  return rows;
}
