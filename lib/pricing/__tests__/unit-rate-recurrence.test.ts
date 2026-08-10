/**
 * The recurrence split, and the honesty of the overshoot split.
 *
 * TWO FINDINGS ARE PINNED HERE, both of which made the picker print a number
 * that the billing code does not charge.
 *
 * 1. THE PACKS ARE ONE-OFF, THE PLAN RECURS. `app/api/addons/checkout/route.ts`
 *    opens the pack checkout with `mode: "payment"`;
 *    `lib/billing/fulfill-one-time.ts` fulfils it with
 *    `addonReports: { increment: n }`; `lib/report-limits.ts` adds that field
 *    to the base limit and zeroes only `monthlyReportsUsed` on the month roll.
 *    Nothing in the repo ever decrements, zeroes or date-filters
 *    `addonReports`. So a pack raises the monthly allowance permanently, and a
 *    single blended "monthly total" overstates the ongoing rate by about 2x at
 *    every volume above the plan allowance.
 *
 * 2. THE OVERSHOOT HAS TWO CAUSES, NOT ONE. Ties on cost are broken toward
 *    more reports, which is the right call once the packs are known to be
 *    permanent — same money, larger standing allowance. But the excess that
 *    choice produces is NOT block granularity, and copy that says it is, is
 *    false. `spareFromBlockSizes` and `spareFromBuyingUp` separate them.
 *
 * The oracle for (2) is a brute-force enumeration that is deliberately NOT the
 * dynamic program under test: it enumerates every pack combination, takes the
 * minimum cost, and then takes the FEWEST reports provided at that cost.
 */

import { describe, expect, it } from "vitest";
import { PRICING_CONFIG, type AddonPack } from "@/lib/pricing";
import { planForVolume } from "../unit-rate";

const BASE = PRICING_CONFIG.pricing.monthly;
const PACK_KEYS = Object.keys(PRICING_CONFIG.addons) as AddonPack[];
const packSize = (p: AddonPack) => PRICING_CONFIG.addons[p].reportLimit;
const packCents = (p: AddonPack) =>
  Math.round(PRICING_CONFIG.addons[p].amount * 100);

/** Highest volume the picker covers, so the sweep matches the shipped range. */
const MAX_VOLUME = 500;

/**
 * Ground truth for the leanest optimum: enumerate every combination covering
 * `overage`, keep the minimum cost, and among those keep the FEWEST reports.
 *
 * Capping each pack at `ceil(overage / size)` is safe — a quantity beyond that
 * already covers the requirement on its own, so more of it is never cheaper.
 */
function leanestAtMinCost(overage: number): number {
  if (overage <= 0) return 0;
  const caps = PACK_KEYS.map((p) => Math.ceil(overage / packSize(p)));
  let bestCents = Number.POSITIVE_INFINITY;
  let leanest = Number.POSITIVE_INFINITY;
  const walk = (i: number, reports: number, cents: number) => {
    if (reports >= overage) {
      if (cents < bestCents) {
        bestCents = cents;
        leanest = reports;
      } else if (cents === bestCents && reports < leanest) {
        leanest = reports;
      }
      return;
    }
    if (i === PACK_KEYS.length) return;
    for (let qty = 0; qty <= caps[i]; qty++) {
      walk(
        i + 1,
        reports + qty * packSize(PACK_KEYS[i]),
        cents + qty * packCents(PACK_KEYS[i]),
      );
    }
  };
  walk(0, 0, 0);
  return leanest;
}

describe("a pack is bought once; the plan is charged every month", () => {
  it("charges the plan alone from the second month, at the same allowance", () => {
    // 110 a month: 50 in the plan, 60 bought once. The figure the picker used
    // to print as "Total each month" was $199 — right for one month only.
    const quote = planForVolume(110);
    expect(quote.packs).toEqual([{ pack: "pack60", qty: 1 }]);
    expect(quote.firstMonthAud).toBe(199);
    expect(quote.ongoingMonthlyAud).toBe(99);
    expect(quote.reportsProvided).toBe(110);
    // The rate the buyer actually lives with is half the one-month figure.
    expect(quote.firstMonthRate).toBeCloseTo(199 / 110, 10);
    expect(quote.ongoingRate).toBeCloseTo(99 / 110, 10);
    expect(quote.ongoingRate).toBeCloseTo(0.9, 10);
    expect(quote.firstMonthRate / quote.ongoingRate).toBeCloseTo(199 / 99, 10);
  });

  it("never charges a pack twice — the ongoing figure is the plan, always", () => {
    for (let volume = 1; volume <= MAX_VOLUME; volume++) {
      const quote = planForVolume(volume);
      expect(quote.ongoingMonthlyAud, `volume ${volume}`).toBe(BASE.amount);
      expect(quote.firstMonthAud, `volume ${volume}`).toBe(
        BASE.amount + quote.packsTotalAud,
      );
      expect(quote.ongoingRate, `volume ${volume}`).toBeCloseTo(
        BASE.amount / volume,
        10,
      );
    }
  });

  it("is strictly dearer in the first month at every volume over the allowance", () => {
    // The whole reason one number will not do. Below the allowance the two
    // figures agree; above it they must not.
    for (let volume = 1; volume <= BASE.reportLimit; volume++) {
      const quote = planForVolume(volume);
      expect(quote.firstMonthAud, `volume ${volume}`).toBe(
        quote.ongoingMonthlyAud,
      );
      expect(quote.firstMonthRate, `volume ${volume}`).toBeCloseTo(
        quote.ongoingRate,
        10,
      );
    }
    for (let volume = BASE.reportLimit + 1; volume <= MAX_VOLUME; volume++) {
      const quote = planForVolume(volume);
      expect(quote.firstMonthAud, `volume ${volume}`).toBeGreaterThan(
        quote.ongoingMonthlyAud,
      );
      expect(quote.firstMonthRate, `volume ${volume}`).toBeGreaterThan(
        quote.ongoingRate,
      );
    }
  });

  it("keeps the ongoing allowance at or above the volume it was quoted for", () => {
    // The claim the ongoing figure rests on: the buyer does not re-buy, so the
    // allowance they keep must actually cover the volume they said they write.
    for (let volume = 1; volume <= MAX_VOLUME; volume++) {
      expect(
        planForVolume(volume).reportsProvided,
        `volume ${volume}`,
      ).toBeGreaterThanOrEqual(volume);
    }
  });

  it("keeps the original field names meaning the first month", () => {
    // Back-compat, asserted rather than assumed: `totalAud` and
    // `effectiveRate` predate the split and callers may still read them.
    for (const volume of [1, 50, 51, 110, 152, 500]) {
      const quote = planForVolume(volume);
      expect(quote.totalAud, `volume ${volume}`).toBe(quote.firstMonthAud);
      expect(quote.effectiveRate, `volume ${volume}`).toBe(
        quote.firstMonthRate,
      );
    }
  });
});

describe("the overshoot is split by cause, not blamed wholly on block sizes", () => {
  it("separates the forced spare from the free extra at 152 a month", () => {
    // 102 over the allowance. 2 x 60-pack and 1 x 60-pack + 2 x 25-pack both
    // cost $200; the first provides 120, the second 110. So 8 spare reports
    // are forced by the block sizes and 10 are the tie-break's free extra.
    const quote = planForVolume(152);
    expect(quote.overage).toBe(102);
    expect(quote.reportsProvided - quote.reportsPerMonth).toBe(18);
    expect(quote.spareFromBlockSizes).toBe(8);
    expect(quote.spareFromBuyingUp).toBe(10);
  });

  it("matches the brute-force leanest optimum at every volume to 500", () => {
    for (let volume = 1; volume <= MAX_VOLUME; volume++) {
      const quote = planForVolume(volume);
      const leanest = leanestAtMinCost(quote.overage);
      expect(quote.spareFromBlockSizes, `volume ${volume}`).toBe(
        Math.max(0, leanest - quote.overage),
      );
      expect(quote.spareFromBuyingUp, `volume ${volume}`).toBe(
        quote.reportsProvided - quote.baseIncluded - leanest,
      );
    }
  });

  it("accounts for the whole overshoot once a pack is bought", () => {
    for (let volume = BASE.reportLimit + 1; volume <= MAX_VOLUME; volume++) {
      const quote = planForVolume(volume);
      expect(
        quote.spareFromBlockSizes + quote.spareFromBuyingUp,
        `volume ${volume}`,
      ).toBe(quote.reportsProvided - quote.reportsPerMonth);
    }
  });

  it("reports no free extra when no pack is bought", () => {
    for (let volume = 1; volume <= BASE.reportLimit; volume++) {
      const quote = planForVolume(volume);
      expect(quote.packs, `volume ${volume}`).toEqual([]);
      expect(quote.spareFromBlockSizes, `volume ${volume}`).toBe(0);
      expect(quote.spareFromBuyingUp, `volume ${volume}`).toBe(0);
    }
  });

  it("guards the suite — the free extra is genuinely reachable", () => {
    // If this ever hits zero the split above is untested in practice and the
    // assertions become vacuous. It is the whole point of the finding, so it
    // is asserted, not assumed.
    const affected: number[] = [];
    for (let volume = 1; volume <= MAX_VOLUME; volume++) {
      if (planForVolume(volume).spareFromBuyingUp > 0) affected.push(volume);
    }
    expect(affected.length).toBeGreaterThan(0);
    expect(affected).toContain(152);
    // Pinned so a silent change in the pack ladder shows up as a diff rather
    // than as quietly different copy on the page.
    expect(affected.length).toBe(63);
  });
});
