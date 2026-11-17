/**
 * RA-8419 slice a: the Senior Project Manager (SPM) line.
 *
 * Founder rule (Phill, 17/11/2026): every claim over $2,500 carries a Senior
 * Project Manager line, 2 hrs at $175/hr = $350 ex GST, covering the site
 * visit and scope. The SPM step is a required part of the process, because
 * larger and more complex claims need the extra data it produces (Decision 5:
 * no waiver).
 *
 * - The threshold is measured ex GST on the estimate total (subtotal plus
 *   contingency) BEFORE the SPM line, so the fee never pushes a job over the
 *   line by itself. "Over $2,500" means strictly greater than 2,500.00.
 * - The SPM line is its own line. Contingency is not charged on it, and no
 *   project-management percentage is added on top (the SPM line replaces the
 *   8% "Project mgmt" setting on these jobs; nothing in the estimate path
 *   applies that percentage today).
 * - Australia only for now. NZ is excluded until the AU jobs prove the rule.
 * - $175/hr is the default; a company rate may be passed in.
 *
 * This module is the one owner of the rule. Every writer of CostEstimate rows
 * calls withSpmLine() just before buildEstimateLines(); never copy the rule.
 *
 * Design note: ~/Documents/RestoreAssist-design-references/
 * SPM-REQUIREMENT-DESIGN-2026-11-17.md (Mini).
 */
import Decimal from "decimal.js";
import type {
  CostEstimateItem,
  CostEstimateResult,
} from "@/lib/nir-cost-estimation";

/** A claim must be strictly over this amount, ex GST, to need an SPM. */
export const SPM_THRESHOLD_EX_GST = 2500;
/** Fixed minimum SPM time: site visit and scope. */
export const SPM_HOURS = 2;
/** Default SPM hourly rate ex GST; each company may set its own. */
export const SPM_DEFAULT_HOURLY_RATE = 175;
/** The line's fixed wording. It identifies the line, so do not edit it. */
export const SPM_LINE_DESCRIPTION =
  "Senior Project Manager: site visit and scope";

export interface SpmOptions {
  /** The property's country. Missing means Australia (RestoreAssist's default). */
  country?: string | null;
  /** Company SPM hourly rate ex GST. Defaults to SPM_DEFAULT_HOURLY_RATE. */
  hourlyRate?: number;
  /**
   * Total ex GST of rows already saved for this job that this estimate is
   * being added to (excluding any SPM row). Counts towards the threshold.
   */
  priorTotalExGst?: number;
  /** True when a saved row for this job is already the SPM line. */
  spmAlreadyCharged?: boolean;
}

/** True when a line (estimate item or saved row) is the SPM line. */
export function isSpmLine(line: { description: string }): boolean {
  return line.description === SPM_LINE_DESCRIPTION;
}

function isNewZealand(country: string | null | undefined): boolean {
  if (country == null) return false;
  const c = country.trim().toUpperCase();
  return c === "NZ" || c === "NZL" || c === "NEW ZEALAND";
}

function money(n: Decimal): number {
  return n.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Return the estimate with the SPM line applied: added when the job is over
 * the threshold, removed when a stale one is present and the job is not. The
 * input is never mutated.
 */
export function withSpmLine(
  estimate: CostEstimateResult,
  options: SpmOptions = {},
): CostEstimateResult {
  const hourlyRate = options.hourlyRate ?? SPM_DEFAULT_HOURLY_RATE;
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    throw new Error(
      `SPM hourly rate must be a positive amount, got ${hourlyRate}`,
    );
  }

  // Measure before the SPM line: take out any SPM line already present.
  const existing = estimate.items.filter(isSpmLine);
  const workItems = estimate.items.filter((i) => !isSpmLine(i));
  const existingSpm = existing.reduce(
    (s, i) => s.plus(i.subtotal),
    new Decimal(0),
  );
  const subtotal = new Decimal(estimate.subtotal).minus(existingSpm);
  const total = new Decimal(estimate.total).minus(existingSpm);
  const other = new Decimal(estimate.breakdown.other).minus(existingSpm);

  const jobTotalExGst = total.plus(options.priorTotalExGst ?? 0);
  const applies =
    !isNewZealand(options.country) &&
    !options.spmAlreadyCharged &&
    jobTotalExGst.greaterThan(SPM_THRESHOLD_EX_GST);

  if (!applies) {
    if (existing.length === 0) return estimate;
    return {
      ...estimate,
      items: workItems,
      subtotal: money(subtotal),
      total: money(total),
      breakdown: { ...estimate.breakdown, other: money(other) },
    };
  }

  const fee = new Decimal(SPM_HOURS).mul(hourlyRate);
  const spmItem: CostEstimateItem = {
    category: "Other",
    description: SPM_LINE_DESCRIPTION,
    quantity: SPM_HOURS,
    unit: "hr",
    rate: hourlyRate,
    subtotal: money(fee),
    nrpgField: null,
    nrpgCompliant: true,
    rateSource: "spm-standard",
    isEstimated: false,
  };

  return {
    ...estimate,
    items: [...workItems, spmItem],
    subtotal: money(subtotal.plus(fee)),
    total: money(total.plus(fee)),
    breakdown: { ...estimate.breakdown, other: money(other.plus(fee)) },
  };
}
