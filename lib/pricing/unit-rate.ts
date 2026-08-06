/**
 * Per-report unit economics — the headline number the pricing page is missing.
 *
 * RestoreAssist sells report volume, so the only rate a contractor can compare
 * against a competitor is dollars-per-report. Everything here derives from
 * `PRICING_CONFIG` (lib/pricing.ts); no price is ever restated locally.
 *
 * THE TRAP THIS MODULE EXISTS TO AVOID. The add-on packs are NOT monotonic in
 * value, and two of them are dearer per report than the base plan itself:
 *
 *   base plan   $99 / 50 reports  = $1.98 per report   (the cheapest rate sold)
 *   60-pack    $100 / 60 reports  = $1.67 per report
 *   25-pack     $50 / 25 reports  = $2.00 per report   (dearer than the plan)
 *   8-pack      $20 /  8 reports  = $2.50 per report   (much dearer)
 *
 * A greedy "fill with the biggest pack that fits, then the next biggest"
 * algorithm therefore overcharges. Example: 105 reports/month is 55 over the
 * plan allowance. Greedy buys 2 x 25-pack + 1 x 8-pack = $120 for 58 reports.
 * Buying a single 60-pack costs $100 and delivers 60. Overshooting is cheaper.
 *
 * `planForVolume` runs a min-cost cover (unbounded knapsack) over the packs, so
 * it finds the genuinely cheapest combination and may deliberately overshoot.
 * `reportsProvided` is therefore allowed to exceed `reportsPerMonth`.
 */

import { PRICING_CONFIG, type AddonPack } from "@/lib/pricing";

/** Rendered when there is no meaningful rate (zero or negative reports). */
const NO_RATE = "—";

/** Whole cents, so pack arithmetic never accumulates binary-float error. */
const toCents = (aud: number) => Math.round(aud * 100);

const BASE_PLAN = PRICING_CONFIG.pricing.monthly;

type Pack = {
  pack: AddonPack;
  /** Reports the pack adds to the monthly allowance. */
  reports: number;
  cents: number;
};

/**
 * FAIL CLOSED — do not remove the filter.
 *
 * This derives the pack ladder from every key in `PRICING_CONFIG.addons`, which
 * is safe only while that object holds report packs exclusively. The seven
 * recurring $11/month add-ons live somewhere else entirely
 * (`lib/billing/addon-registry.ts`), so today the assumption holds.
 *
 * If a non-report add-on is ever registered here, `reportLimit` is `undefined`,
 * every arithmetic step downstream becomes `NaN`, and `planForVolume` returns a
 * quote whose total and per-report rate are both `NaN` — silently, with no
 * error, on the page whose whole job is telling a buyer what they will pay. A
 * wrong price shown confidently is worse than no price.
 *
 * So entries without a usable positive integer `reportLimit` are dropped rather
 * than trusted. Dropping one means the optimiser cannot buy it; it does not
 * make the quote wrong for the packs that remain.
 */
const PACKS: readonly Pack[] = (
  Object.keys(PRICING_CONFIG.addons) as AddonPack[]
)
  .map((pack) => ({
    pack,
    reports: PRICING_CONFIG.addons[pack].reportLimit,
    cents: toCents(PRICING_CONFIG.addons[pack].amount),
  }))
  .filter(
    (entry) =>
      Number.isInteger(entry.reports) &&
      entry.reports > 0 &&
      Number.isFinite(entry.cents) &&
      entry.cents > 0,
  );

/** Dollars per report, or null when reports <= 0. */
export function perReportRate(
  amountAud: number,
  reports: number,
): number | null {
  if (!Number.isFinite(reports) || reports <= 0) return null;
  return amountAud / reports;
}

/**
 * "$1.98" style display, "—" when null.
 *
 * Rounds to the nearest cent, so a displayed rate can sit up to half a cent
 * below the true rate. Do not use this string in a binding quote — use the
 * numeric rate for anything a customer is charged against.
 */
export function formatPerReport(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return NO_RATE;
  return `$${rate.toFixed(2)}`;
}

export type PackPurchase = { pack: AddonPack; qty: number };

export type VolumeQuote = {
  reportsPerMonth: number;
  /** Reports included in the base monthly plan. */
  baseIncluded: number;
  /** Reports beyond the base plan. */
  overage: number;
  /** Cheapest combination covering the overage. */
  packs: PackPurchase[];
  packsTotalAud: number;
  /** Base plan + packs. */
  totalAud: number;
  /**
   * baseIncluded + reports from purchased packs. May legitimately EXCEED
   * `reportsPerMonth` — overshooting with one larger pack is often cheaper
   * than an exact fill from smaller ones.
   */
  reportsProvided: number;
  /** totalAud / reportsPerMonth. */
  effectiveRate: number;
};

/**
 * Cheapest set of packs providing at least `overage` reports.
 *
 * Min-cost cover by dynamic programming: `best[n]` is the cheapest way to
 * provide AT LEAST n reports. Buying a pack of size s reduces the requirement
 * to `max(0, n - s)`, which is what lets the optimum overshoot. Ties on cost
 * are broken toward the combination that provides more reports, so the result
 * is deterministic and never worse for the customer.
 */
function cheapestPacks(overage: number): PackPurchase[] {
  if (overage <= 0 || PACKS.length === 0) return [];

  const cost = new Array<number>(overage + 1).fill(Number.POSITIVE_INFINITY);
  const provided = new Array<number>(overage + 1).fill(0);
  const choice = new Array<number>(overage + 1).fill(-1);
  cost[0] = 0;

  for (let need = 1; need <= overage; need++) {
    for (let i = 0; i < PACKS.length; i++) {
      const rest = Math.max(0, need - PACKS[i].reports);
      const candidateCost = cost[rest] + PACKS[i].cents;
      const candidateProvided = provided[rest] + PACKS[i].reports;
      const better =
        candidateCost < cost[need] ||
        (candidateCost === cost[need] && candidateProvided > provided[need]);
      if (better) {
        cost[need] = candidateCost;
        provided[need] = candidateProvided;
        choice[need] = i;
      }
    }
  }

  const qtyByIndex = new Map<number, number>();
  for (let need = overage; need > 0; ) {
    const i = choice[need];
    qtyByIndex.set(i, (qtyByIndex.get(i) ?? 0) + 1);
    need = Math.max(0, need - PACKS[i].reports);
  }

  return [...qtyByIndex.entries()]
    .sort((a, b) => PACKS[b[0]].reports - PACKS[a[0]].reports)
    .map(([i, qty]) => ({ pack: PACKS[i].pack, qty }));
}

/**
 * Cheapest way to serve N reports/month from the base plan plus add-on packs.
 *
 * @throws RangeError when `reportsPerMonth` is not a whole number >= 1. A
 * per-report rate is undefined at zero volume, and `VolumeQuote.effectiveRate`
 * is a plain `number`, so callers driving this from a slider must clamp their
 * minimum to 1 (use `perReportRate`, which returns null, for the nullable case).
 */
export function planForVolume(reportsPerMonth: number): VolumeQuote {
  if (!Number.isInteger(reportsPerMonth) || reportsPerMonth < 1) {
    throw new RangeError(
      `planForVolume expects a whole number of reports >= 1, received ${reportsPerMonth}`,
    );
  }

  // Annotated: PRICING_CONFIG is `as const`, so this is the literal type 50
  // and would narrow the `reportsProvided` accumulator below to that literal.
  const baseIncluded: number = BASE_PLAN.reportLimit;
  const overage = Math.max(0, reportsPerMonth - baseIncluded);
  const packs = cheapestPacks(overage);

  const packsTotalCents = packs.reduce((sum, { pack, qty }) => {
    return sum + toCents(PRICING_CONFIG.addons[pack].amount) * qty;
  }, 0);
  const totalCents = toCents(BASE_PLAN.amount) + packsTotalCents;

  const reportsProvided = packs.reduce((sum, { pack, qty }) => {
    return sum + PRICING_CONFIG.addons[pack].reportLimit * qty;
  }, baseIncluded);

  const totalAud = totalCents / 100;

  return {
    reportsPerMonth,
    baseIncluded,
    overage,
    packs,
    packsTotalAud: packsTotalCents / 100,
    totalAud,
    reportsProvided,
    // Same formula as perReportRate; reportsPerMonth >= 1 is guaranteed above.
    effectiveRate: totalAud / reportsPerMonth,
  };
}
