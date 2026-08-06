/**
 * Unit-rate / volume-quote guard.
 *
 * The point of this suite is the NON-MONOTONIC pack pricing. The 25-pack is
 * dearer per report than the base plan and the 8-pack is dearer still, so a
 * greedy "biggest pack first, then fill the remainder" optimiser overcharges,
 * and sometimes a single larger pack beats an exact fill from smaller ones.
 *
 * Two independent oracles are used deliberately:
 *   - `bruteForceCheapest` enumerates every pack combination and is the ground
 *     truth the DP must match at every volume in the sweep.
 *   - `greedyByLargest` is the wrong answer we must never ship; at least one
 *     volume in the sweep must beat it, otherwise this suite is not actually
 *     exercising the trap.
 *
 * Every expected number derives from PRICING_CONFIG — no price is restated.
 */

import { describe, expect, it } from "vitest";
import { PRICING_CONFIG, type AddonPack } from "@/lib/pricing";
import {
  formatPerReport,
  perReportRate,
  planForVolume,
} from "../unit-rate";

const BASE = PRICING_CONFIG.pricing.monthly;
const PACK_KEYS = Object.keys(PRICING_CONFIG.addons) as AddonPack[];
const packSize = (p: AddonPack) => PRICING_CONFIG.addons[p].reportLimit;
const packCents = (p: AddonPack) =>
  Math.round(PRICING_CONFIG.addons[p].amount * 100);
/** Largest pack first. */
const BY_SIZE_DESC = [...PACK_KEYS].sort((a, b) => packSize(b) - packSize(a));

/** Ground-truth optimum: enumerate every combination that covers `overage`. */
function bruteForceCheapest(overage: number): number {
  if (overage <= 0) return 0;
  const caps = PACK_KEYS.map((p) => Math.ceil(overage / packSize(p)));
  let best = Number.POSITIVE_INFINITY;
  const walk = (i: number, reports: number, cents: number) => {
    if (cents >= best) return;
    if (reports >= overage) {
      best = cents;
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
  return best;
}

/** The naive algorithm this module must NOT use. */
function greedyByLargest(overage: number): number {
  if (overage <= 0) return 0;
  let remaining = overage;
  let cents = 0;
  for (const p of BY_SIZE_DESC) {
    const qty = Math.floor(remaining / packSize(p));
    cents += qty * packCents(p);
    remaining -= qty * packSize(p);
  }
  if (remaining > 0) cents += packCents(BY_SIZE_DESC[BY_SIZE_DESC.length - 1]);
  return cents;
}

const quoteCents = (reports: number) =>
  Math.round(planForVolume(reports).totalAud * 100);
const packsCents = (reports: number) =>
  Math.round(planForVolume(reports).packsTotalAud * 100);

describe("perReportRate", () => {
  it("derives the base plan rate from PRICING_CONFIG", () => {
    expect(perReportRate(BASE.amount, BASE.reportLimit)).toBeCloseTo(
      BASE.amount / BASE.reportLimit,
      10,
    );
  });

  it("returns null at or below zero reports", () => {
    expect(perReportRate(BASE.amount, 0)).toBeNull();
    expect(perReportRate(BASE.amount, -5)).toBeNull();
    expect(perReportRate(BASE.amount, Number.NaN)).toBeNull();
  });
});

describe("formatPerReport", () => {
  it("renders two decimal places with a dollar sign", () => {
    expect(formatPerReport(BASE.amount / BASE.reportLimit)).toBe("$1.98");
    expect(formatPerReport(2)).toBe("$2.00");
  });

  it("renders an em dash when there is no rate", () => {
    expect(formatPerReport(null)).toBe("—");
  });
});

describe("planForVolume — base allowance", () => {
  it("charges only the base plan up to the included allowance", () => {
    const quote = planForVolume(BASE.reportLimit);
    expect(quote.overage).toBe(0);
    expect(quote.packs).toEqual([]);
    expect(quote.totalAud).toBe(BASE.amount);
    expect(quote.reportsProvided).toBe(BASE.reportLimit);
    expect(quote.effectiveRate).toBeCloseTo(BASE.amount / BASE.reportLimit, 10);
  });

  it("rejects volumes below one report", () => {
    expect(() => planForVolume(0)).toThrow(RangeError);
    expect(() => planForVolume(-1)).toThrow(RangeError);
    expect(() => planForVolume(10.5)).toThrow(RangeError);
  });
});

describe("planForVolume — non-monotonic pack pricing", () => {
  // 55 over the allowance. Greedy: 2 x 25-pack + 1 x 8-pack. Optimum: one
  // 60-pack — cheaper AND more reports.
  const OVERAGE = 55;
  const volume = BASE.reportLimit + OVERAGE;

  it("beats greedy-by-largest at a volume where greedy overcharges", () => {
    const greedy = greedyByLargest(OVERAGE);
    const actual = packsCents(volume);
    expect(greedy).toBeGreaterThan(actual);
    expect(actual).toBe(bruteForceCheapest(OVERAGE));
  });

  it("overshoots when one larger pack is cheaper than an exact fill", () => {
    const quote = planForVolume(volume);
    expect(quote.reportsProvided).toBeGreaterThan(quote.reportsPerMonth);
    // A single pack, not a stack of small ones.
    expect(quote.packs).toHaveLength(1);
    expect(quote.packs[0].qty).toBe(1);
    const bought = quote.packs[0].pack;
    expect(packSize(bought)).toBeGreaterThan(OVERAGE);
  });

  it("matches the brute-force optimum at every volume from 1 to 250", () => {
    for (let reports = 1; reports <= 250; reports++) {
      const overage = Math.max(0, reports - BASE.reportLimit);
      expect(packsCents(reports), `volume ${reports}`).toBe(
        bruteForceCheapest(overage),
      );
      expect(quoteCents(reports), `volume ${reports}`).toBe(
        Math.round(BASE.amount * 100) + bruteForceCheapest(overage),
      );
    }
  });

  it("is strictly cheaper than greedy for at least one volume in that range", () => {
    const divergent: number[] = [];
    for (let reports = 1; reports <= 250; reports++) {
      const overage = Math.max(0, reports - BASE.reportLimit);
      if (packsCents(reports) < greedyByLargest(overage)) divergent.push(reports);
    }
    // Guards the suite itself: if the pack ladder ever becomes monotonic this
    // fails, and the greedy-comparison tests above stop meaning anything.
    expect(divergent.length).toBeGreaterThan(0);
    expect(divergent).toContain(BASE.reportLimit + OVERAGE);
  });

  it("never quotes packs with a non-positive quantity", () => {
    for (let reports = 1; reports <= 250; reports++) {
      for (const purchase of planForVolume(reports).packs) {
        expect(purchase.qty, `volume ${reports}`).toBeGreaterThan(0);
      }
    }
  });

  it("always provides at least the requested volume", () => {
    for (let reports = 1; reports <= 250; reports++) {
      const quote = planForVolume(reports);
      expect(quote.reportsProvided, `volume ${reports}`).toBeGreaterThanOrEqual(
        reports,
      );
    }
  });
});

describe("honest unit economics", () => {
  it("makes the effective rate WORSE just past the included allowance", () => {
    // The finding, pinned: this is not a volume discount. The base plan is the
    // cheapest per-report rate a customer can ever pay, and the first report
    // over the allowance makes the rate jump.
    const atAllowance = planForVolume(BASE.reportLimit).effectiveRate;
    const oneOver = planForVolume(BASE.reportLimit + 1).effectiveRate;
    expect(oneOver).toBeGreaterThan(atAllowance);
  });

  it("prices two packs above the base plan's own per-report rate", () => {
    const baseRate = perReportRate(BASE.amount, BASE.reportLimit);
    const dearer = PACK_KEYS.filter((p) => {
      const rate = perReportRate(
        PRICING_CONFIG.addons[p].amount,
        packSize(p),
      );
      return rate !== null && baseRate !== null && rate > baseRate;
    });
    expect(dearer.length).toBeGreaterThan(0);
  });
});
