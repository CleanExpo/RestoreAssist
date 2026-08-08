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
 *
 * THE SECOND TRAP: THE PLAN RECURS, THE PACKS DO NOT. Not a presentation
 * detail — it moves the headline rate by about 2x. Traced through the shipped
 * billing code, not inferred:
 *
 *   - `app/api/addons/checkout/route.ts` opens the pack checkout with
 *     `mode: "payment"` — a one-off charge, not a subscription line.
 *   - `lib/billing/fulfill-one-time.ts` fulfils it with
 *     `addonReports: { increment: n }` on the user row.
 *   - `lib/report-limits.ts` computes `totalLimit = baseLimit + addonReports`
 *     and zeroes `monthlyReportsUsed` on every month roll. `addonReports` is
 *     never zeroed, decremented or date-filtered anywhere in this repo, and the
 *     `addonPurchase.findMany` behind it filters on `status: "COMPLETED"` with
 *     no date bound at all.
 *
 * So one pack purchase raises the MONTHLY allowance permanently, while the
 * usage counter it is spent against resets each month. A contractor writing
 * 110 reports a month pays $199 in the month they buy the 60-pack and $99 a
 * month from then on, for the same 110 reports — $1.81 per report once, then
 * $0.90 per report for good. A single blended "monthly total" is right for at
 * most one month, so every quote carries a first-month figure and an ongoing
 * figure, each with its own rate.
 */

import { PRICING_CONFIG, type AddonPack } from "@/lib/pricing";

/** Rendered when there is no meaningful rate (zero or negative reports). */
const NO_RATE = "—";

/** Whole cents, so pack arithmetic never accumulates binary-float error. */
const toCents = (aud: number) => Math.round(aud * 100);

const BASE_PLAN = PRICING_CONFIG.pricing.monthly;

type Pack = {
  pack: AddonPack;
  displayName: string;
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
 *
 * THIS IS THE ONLY PLACE THE LADDER IS BUILT. Anything that needs the sellable
 * packs — a rate card, a "packs come in blocks of 8, 25 and 60" sentence, a
 * line item — must read `PACK_LADDER` below rather than re-deriving from
 * `PRICING_CONFIG.addons`. A second, unfiltered derivation elsewhere reinstates
 * exactly the hole this filter closes: the component that used to do it
 * rendered "8, 25, 60 and undefined" into buyer-facing copy.
 */
const PACKS: readonly Pack[] = (
  Object.keys(PRICING_CONFIG.addons) as AddonPack[]
)
  .map((pack) => ({
    pack,
    displayName: PRICING_CONFIG.addons[pack].displayName,
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

/** Look-up of a filtered pack by key. Callers only ever hold filtered keys. */
const PACK_BY_KEY = new Map<AddonPack, Pack>(PACKS.map((p) => [p.pack, p]));

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

/** One sellable report pack, already through the fail-closed filter. */
export type PackRung = {
  pack: AddonPack;
  displayName: string;
  /** Reports the pack adds. Guaranteed a positive integer. */
  reports: number;
  amountAud: number;
  /** amountAud / reports. Never null for a rung — the filter guarantees it. */
  rate: number | null;
};

/**
 * Every pack a buyer can actually be quoted, smallest first.
 *
 * The single source for pack presentation. Empty is a legitimate value (a
 * catalogue of nothing but malformed entries), and a caller rendering from it
 * must survive that rather than assume at least one rung.
 */
export const PACK_LADDER: readonly PackRung[] = [...PACKS]
  .sort((a, b) => a.reports - b.reports)
  .map((entry) => ({
    pack: entry.pack,
    displayName: entry.displayName,
    reports: entry.reports,
    amountAud: entry.cents / 100,
    rate: perReportRate(entry.cents / 100, entry.reports),
  }));

/** Pack block sizes as sold, smallest first. */
export const PACK_SIZES: readonly number[] = PACK_LADDER.map((r) => r.reports);

/**
 * The rung for a pack key, or null when that key was filtered out.
 *
 * Every key reachable from a `VolumeQuote` is a filtered one, so a caller
 * rendering a quote will never see null. It is still nullable rather than
 * asserted, because the alternative is a cast, and a cast is how the unfiltered
 * `undefined` reached buyer-facing copy the first time.
 */
export function packRung(pack: AddonPack): PackRung | null {
  return PACK_LADDER.find((rung) => rung.pack === pack) ?? null;
}

export type PackPurchase = { pack: AddonPack; qty: number };

export type VolumeQuote = {
  reportsPerMonth: number;
  /** Reports included in the base monthly plan. */
  baseIncluded: number;
  /** Reports beyond the base plan. */
  overage: number;
  /** Cheapest combination covering the overage. Bought ONCE, not monthly. */
  packs: PackPurchase[];
  /** One-off cost of `packs`. Charged in the first month and never again. */
  packsTotalAud: number;
  /**
   * Base plan + packs. This is the FIRST MONTH only — see `ongoingMonthlyAud`.
   * Retained under its original name because callers outside this repo may
   * hold it; new code should read `firstMonthAud`, which says what it means.
   */
  totalAud: number;
  /** Plan + one-off packs: what the buyer pays in the month they buy. */
  firstMonthAud: number;
  /**
   * What the buyer pays every month after: the plan alone.
   *
   * The packs are not re-bought, because they were never a subscription and
   * the allowance they bought never expires (see the module header). The
   * allowance stays at `reportsProvided` a month for this price.
   */
  ongoingMonthlyAud: number;
  /**
   * baseIncluded + reports from purchased packs. May legitimately EXCEED
   * `reportsPerMonth` — overshooting with one larger pack is often cheaper
   * than an exact fill from smaller ones.
   */
  reportsProvided: number;
  /**
   * Spare reports that no equally cheap combination could avoid, because packs
   * are sold in fixed blocks. Zero when no pack is bought.
   */
  spareFromBlockSizes: number;
  /**
   * Spare reports on top of that, which the chosen combination adds at NO
   * extra cost over the leanest equally priced one.
   *
   * At 152 reports a month, 2 x 60-pack and 1 x 60-pack + 2 x 25-pack both
   * cost $200. The first is chosen because at the same price it leaves a
   * larger permanent allowance. 8 of the 18 spare reports are forced by the
   * block sizes; the other 10 are this. The two are separated because copy
   * that blames all 18 on block granularity is false.
   */
  spareFromBuyingUp: number;
  /**
   * firstMonthAud / reportsPerMonth. Same value as `firstMonthRate`; kept
   * because the name predates the first-month/ongoing split.
   */
  effectiveRate: number;
  /** firstMonthAud / reportsPerMonth — true for the buying month only. */
  firstMonthRate: number;
  /** ongoingMonthlyAud / reportsPerMonth — true from the second month on. */
  ongoingRate: number;
};

/**
 * Cheapest set of packs providing at least `overage` reports, plus the fewest
 * reports any EQUALLY CHEAP set would have provided.
 *
 * Min-cost cover by dynamic programming: `cost[n]` is the cheapest way to
 * provide AT LEAST n reports. Buying a pack of size s reduces the requirement
 * to `max(0, n - s)`, which is what lets the optimum overshoot.
 *
 * TIES ARE BROKEN TOWARD MORE REPORTS, DELIBERATELY, and the reason changed
 * once the packs were traced as one-off purchases. A pack permanently raises
 * the monthly allowance, so at identical cost the combination providing more
 * reports is strictly better value for the buyer, every month, forever. Taking
 * the leaner tie would be spending the same money for less.
 *
 * What that tie-break must NOT do is let the page blame the resulting excess on
 * block granularity. So `leanestReports` runs the same recurrence with the
 * opposite tie-break: the fewest reports achievable at the same minimum cost.
 * The difference between the two is the part of the overshoot that is a free
 * extra rather than a rounding artefact, and the caller reports them apart.
 *
 * Both extremes are exact, not heuristics: any cover of `need` decomposes into
 * a first pack `i` plus a cover of `max(0, need - s_i)`, the sub-problem's cost
 * is optimal by induction, and the loop tries every `i`.
 */
function cheapestPacks(overage: number): {
  packs: PackPurchase[];
  leanestReports: number;
} {
  if (overage <= 0 || PACKS.length === 0) {
    return { packs: [], leanestReports: 0 };
  }

  const cost = new Array<number>(overage + 1).fill(Number.POSITIVE_INFINITY);
  /** Most reports achievable at `cost[need]` — drives the chosen combination. */
  const providedMax = new Array<number>(overage + 1).fill(0);
  /** Fewest reports achievable at `cost[need]` — reported, never bought. */
  const providedMin = new Array<number>(overage + 1).fill(0);
  const choice = new Array<number>(overage + 1).fill(-1);
  cost[0] = 0;

  for (let need = 1; need <= overage; need++) {
    // Pass 1 — settle the minimum cost for `need`.
    for (let i = 0; i < PACKS.length; i++) {
      const rest = Math.max(0, need - PACKS[i].reports);
      const candidate = cost[rest] + PACKS[i].cents;
      if (candidate < cost[need]) cost[need] = candidate;
    }
    // Pass 2 — among the ways to reach that cost, take both extremes. Split
    // from pass 1 on purpose: a single interleaved pass compares against a
    // cost[need] that is still provisional, and would settle the extremes
    // against a cost it later beats.
    providedMin[need] = Number.POSITIVE_INFINITY;
    for (let i = 0; i < PACKS.length; i++) {
      const rest = Math.max(0, need - PACKS[i].reports);
      if (cost[rest] + PACKS[i].cents !== cost[need]) continue;
      const asMax = providedMax[rest] + PACKS[i].reports;
      if (choice[need] === -1 || asMax > providedMax[need]) {
        providedMax[need] = asMax;
        choice[need] = i;
      }
      const asMin = providedMin[rest] + PACKS[i].reports;
      if (asMin < providedMin[need]) providedMin[need] = asMin;
    }
  }

  const qtyByIndex = new Map<number, number>();
  for (let need = overage; need > 0; ) {
    const i = choice[need];
    qtyByIndex.set(i, (qtyByIndex.get(i) ?? 0) + 1);
    need = Math.max(0, need - PACKS[i].reports);
  }

  return {
    packs: [...qtyByIndex.entries()]
      .sort((a, b) => PACKS[b[0]].reports - PACKS[a[0]].reports)
      .map(([i, qty]) => ({ pack: PACKS[i].pack, qty })),
    leanestReports: providedMin[overage],
  };
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
  const { packs, leanestReports } = cheapestPacks(overage);

  // Both reduces read the FILTERED ladder, not PRICING_CONFIG.addons. Every
  // key here came from the filter already, so this cannot change a number; it
  // means there is no second path into the raw catalogue to go stale.
  const packsTotalCents = packs.reduce((sum, { pack, qty }) => {
    return sum + (PACK_BY_KEY.get(pack)?.cents ?? 0) * qty;
  }, 0);
  const ongoingCents = toCents(BASE_PLAN.amount);
  const firstMonthCents = ongoingCents + packsTotalCents;

  const packsReports = packs.reduce((sum, { pack, qty }) => {
    return sum + (PACK_BY_KEY.get(pack)?.reports ?? 0) * qty;
  }, 0);
  const reportsProvided = baseIncluded + packsReports;

  const firstMonthAud = firstMonthCents / 100;
  const ongoingMonthlyAud = ongoingCents / 100;

  return {
    reportsPerMonth,
    baseIncluded,
    overage,
    packs,
    packsTotalAud: packsTotalCents / 100,
    totalAud: firstMonthAud,
    firstMonthAud,
    ongoingMonthlyAud,
    reportsProvided,
    spareFromBlockSizes: Math.max(0, leanestReports - overage),
    spareFromBuyingUp: Math.max(0, packsReports - leanestReports),
    // Same formula as perReportRate; reportsPerMonth >= 1 is guaranteed above.
    effectiveRate: firstMonthAud / reportsPerMonth,
    firstMonthRate: firstMonthAud / reportsPerMonth,
    ongoingRate: ongoingMonthlyAud / reportsPerMonth,
  };
}
