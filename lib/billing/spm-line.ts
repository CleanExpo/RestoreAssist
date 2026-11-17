/** RA-8419: the business chooses to add this priced recommendation. */
import Decimal from "decimal.js";

export const SPM_THRESHOLD_EX_GST = 2500;
export const SPM_HOURS = 2;
/** Fixed rate for this slice; no company override is accepted by the route. */
export const SPM_DEFAULT_HOURLY_RATE = 175;
export const SPM_LINE_DESCRIPTION = "Senior Project Manager: site visit and scope";
export const SPM_LINE_KIND = "SPM";
export const SPM_REASON = "Claims over $2,500 run more smoothly with a senior project manager on site: a full scope, complete evidence, fewer complaints and faster payment.";

export function isSpmLine(line: { lineKind?: string | null }): boolean {
  return line.lineKind === SPM_LINE_KIND;
}

export function isNewZealand(country: string | null | undefined): boolean {
  return ["NZ", "NZL", "NEW ZEALAND"].includes(country?.trim().toUpperCase() ?? "");
}

export interface SpmRecommendation {
  recommended: boolean;
  workTotalExGst: number;
  line: { description: string; quantity: number; unit: string; rate: number; total: number } | null;
  reason: string | null;
}

/** Pure recommendation over saved rows. Identity is the marker, never wording. */
export function spmRecommendation(
  rows: ReadonlyArray<{ total: Decimal.Value; lineKind?: string | null }>,
  country: string | null | undefined,
  hourlyRate = SPM_DEFAULT_HOURLY_RATE,
): SpmRecommendation {
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) throw new Error("SPM hourly rate must be positive and finite");
  const work = rows.filter(row => !isSpmLine(row)).reduce((sum, row) => sum.plus(row.total), new Decimal(0));
  const recommended = !isNewZealand(country) && !rows.some(isSpmLine) && work.greaterThan(SPM_THRESHOLD_EX_GST);
  return {
    recommended,
    workTotalExGst: work.toNumber(),
    line: recommended ? { description: SPM_LINE_DESCRIPTION, quantity: SPM_HOURS, unit: "hr", rate: hourlyRate, total: new Decimal(SPM_HOURS).mul(hourlyRate).toDecimalPlaces(2).toNumber() } : null,
    reason: recommended ? SPM_REASON : null,
  };
}

/** One structured, non-personal log for each served recommendation. */
export function logSpmRecommendation(inspectionId: string, rows: Parameters<typeof spmRecommendation>[0], country: string | null | undefined): SpmRecommendation {
  const recommendation = spmRecommendation(rows, country);
  console.info("[spm] recommendation", { inspectionId, recommended: recommendation.recommended, workTotalExGst: recommendation.workTotalExGst, hasLine: rows.some(isSpmLine) });
  return recommendation;
}
