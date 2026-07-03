/**
 * Unit tests for the AU electrical-load and running-cost model
 * (lib/equipment-power.ts): AS/NZS 3012:2019 80% rule on 10/15/20A circuits,
 * watts totals from the sourced equipment matrix, kWh/day, and tariff maths.
 */

import { describe, it, expect } from "vitest";
import {
  AU_CIRCUIT_RATINGS_A,
  calculateCircuitRequirements,
  calculateElectricityCostPerDay,
  calculateTotalKwhPerDay,
  calculateTotalWatts,
  CONTINUOUS_LOAD_FACTOR,
  DEFAULT_ELECTRICITY_TARIFF_C_PER_KWH,
  wattsToKwhPerDay,
} from "../equipment-power";

describe("calculateCircuitRequirements — AS/NZS 3012:2019 80% rule", () => {
  it("covers the three standard AU ratings with 80% continuous limits", () => {
    const reqs = calculateCircuitRequirements(1);
    expect(reqs.map((r) => r.ratingA)).toEqual([...AU_CIRCUIT_RATINGS_A]);
    expect(reqs.find((r) => r.ratingA === 10)?.maxContinuousA).toBe(8);
    expect(reqs.find((r) => r.ratingA === 15)?.maxContinuousA).toBe(12);
    expect(reqs.find((r) => r.ratingA === 20)?.maxContinuousA).toBe(16);
    expect(CONTINUOUS_LOAD_FACTOR).toBe(0.8);
  });

  it("exactly 8A fits one 10A GPO; 8.01A needs two", () => {
    expect(
      calculateCircuitRequirements(8).find((r) => r.ratingA === 10)
        ?.circuitsRequired,
    ).toBe(1);
    expect(
      calculateCircuitRequirements(8.01).find((r) => r.ratingA === 10)
        ?.circuitsRequired,
    ).toBe(2);
  });

  it("zero load needs zero circuits", () => {
    for (const r of calculateCircuitRequirements(0)) {
      expect(r.circuitsRequired).toBe(0);
    }
  });
});

describe("power totals from the sourced equipment matrix", () => {
  it("sums watts across selections (lgr-85 = 1180W sourced average)", () => {
    expect(
      calculateTotalWatts([{ groupId: "lgr-85", quantity: 2 }]),
    ).toBe(2360);
  });

  it("ignores unknown group ids", () => {
    expect(
      calculateTotalWatts([{ groupId: "does-not-exist", quantity: 3 }]),
    ).toBe(0);
  });

  it("converts to kWh/day for 24h continuous operation", () => {
    expect(wattsToKwhPerDay(1000)).toBe(24);
    expect(
      calculateTotalKwhPerDay([{ groupId: "lgr-85", quantity: 1 }]),
    ).toBeCloseTo(28.32, 2); // 1180W x 24 / 1000
  });
});

describe("electricity running cost", () => {
  it("uses the sourced default tariff (34 c/kWh)", () => {
    expect(DEFAULT_ELECTRICITY_TARIFF_C_PER_KWH).toBe(34);
    expect(
      calculateElectricityCostPerDay([{ groupId: "lgr-85", quantity: 1 }]),
    ).toBeCloseTo(9.63, 2); // 28.32 kWh x $0.34
  });

  it("honours a per-org tariff override", () => {
    expect(
      calculateElectricityCostPerDay(
        [{ groupId: "lgr-85", quantity: 1 }],
        25,
      ),
    ).toBeCloseTo(7.08, 2); // 28.32 kWh x $0.25
  });
});
