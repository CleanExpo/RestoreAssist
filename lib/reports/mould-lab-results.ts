/**
 * RA-7686: the "Sampling & laboratory results" section of the report PDF,
 * built from MouldRemediationAssessment. Pure, so it can be tested without a PDF.
 *
 * Interpretation guard (RA-7686, Nexus 4D research doc):
 * - Missing values read "Not tested", never zero and never blank.
 * - The indoor/outdoor ratio is computed from the recorded counts, never typed,
 *   and is labelled as context, not a health threshold.
 * - No automatic PASS/FAIL. The clearance criterion is printed as recorded,
 *   and the comparison is left to the independent professional who set it.
 */

export interface MouldLabAssessment {
  mouldConditionLevel?: string | null;
  airSamplingRequired?: boolean | null;
  samplingDate?: Date | string | null;
  labName?: string | null;
  labReportReference?: string | null;
  sporeType?: string | null;
  sporeCountPreRemediation?: number | null;
  sporeCountPostRemediation?: number | null;
  outdoorBaselineCount?: number | null;
  clearanceCriterion?: string | null;
  iepAssessmentRequired?: boolean | null;
}

export const NOT_TESTED = "Not tested";

// Labels only: the standard's definitions of each condition are not reproduced.
const CONDITION_LABEL: Record<string, string> = {
  CONDITION_1: "Condition 1",
  CONDITION_2: "Condition 2",
  CONDITION_3: "Condition 3",
};

function text(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  return t || NOT_TESTED;
}

function count(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `${v.toLocaleString("en-AU")} spores/m3` : NOT_TESTED;
}

function date(v: Date | string | null | undefined): string {
  if (!v) return NOT_TESTED;
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? NOT_TESTED
    : d.toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric", timeZone: "Australia/Sydney" });
}

function ratio(indoor: number | null | undefined, outdoor: number | null | undefined): string {
  if (typeof indoor !== "number" || typeof outdoor !== "number" || !Number.isFinite(indoor) || !(outdoor > 0)) {
    return NOT_TESTED;
  }
  return `${(indoor / outdoor).toFixed(2)} (context only, not a health threshold)`;
}

/** Print only on mould jobs: an assessment row exists, or the job is a mould claim. */
export function shouldPrintMouldLabResults(
  assessment: MouldLabAssessment | null | undefined,
  claimType: string | null | undefined,
): boolean {
  return Boolean(assessment) || (claimType ?? "").toUpperCase() === "MOULD";
}

export function mouldLabResultRows(a: MouldLabAssessment | null | undefined): Array<[string, string]> {
  const x = a ?? {};
  const criterion = (x.clearanceCriterion ?? "").trim();
  return [
    ["Condition level:", x.mouldConditionLevel ? CONDITION_LABEL[x.mouldConditionLevel] ?? x.mouldConditionLevel : NOT_TESTED],
    ["Air sampling:", x.airSamplingRequired ? "Required" : x.airSamplingRequired === false ? "Not required" : NOT_TESTED],
    ["Sampling date:", date(x.samplingDate)],
    ["Laboratory:", text(x.labName)],
    ["Lab report reference:", text(x.labReportReference)],
    ["Spore type:", text(x.sporeType)],
    ["Indoor count, before:", count(x.sporeCountPreRemediation)],
    ["Indoor count, after:", count(x.sporeCountPostRemediation)],
    ["Outdoor baseline:", count(x.outdoorBaselineCount)],
    ["Indoor/outdoor ratio, before:", ratio(x.sporeCountPreRemediation, x.outdoorBaselineCount)],
    ["Indoor/outdoor ratio, after:", ratio(x.sporeCountPostRemediation, x.outdoorBaselineCount)],
    [
      "Clearance criterion:",
      criterion
        ? `${criterion} (as recorded; assessment against it rests with the independent professional who set it)`
        : NOT_TESTED,
    ],
    ["Independent assessment:", x.iepAssessmentRequired ? "Required" : x.iepAssessmentRequired === false ? "Not required" : NOT_TESTED],
  ];
}
