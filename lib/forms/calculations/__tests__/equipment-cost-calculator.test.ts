/**
 * Unit tests for EquipmentCostCalculator (lib/forms/calculations/equipment-cost-calculator.ts).
 *
 * This module produces customer-facing equipment rental + labour cost estimates
 * from IICRC class/category and affected area. It is pure (no DB, no IO) money +
 * quantity maths and had NO test coverage. A regression here mis-prices a job.
 *
 * RA-7001 follow-up: area/volume inputs are m²/m³ (AU/NZ metric), matching the
 * corrected calculator. Equipment ratios are converted from their original
 * sq-ft/cu-ft figures via SQFT_TO_SQM / CUFT_TO_M3, so expected values below
 * are computed from those exact conversions, not the old sq-ft numbers.
 *
 * Tests lock in the ACTUAL current behaviour (values computed from the source as-is,
 * not from any external spec). They exercise: equipment-quantity ratios, the
 * Math.ceil quantity boundaries, class/category branch inclusion, line-item
 * subtotals, labour cost, the 10% contingency (Math.round on a Float subtotal),
 * the duration cost-range, currency formatting, and the summary text.
 */

import { describe, it, expect } from "vitest";
import {
  EquipmentCostCalculator,
  EQUIPMENT_PRICING,
} from "../equipment-cost-calculator";
import { SQFT_TO_SQM } from "@/lib/units";

const find = (
  est: ReturnType<typeof EquipmentCostCalculator.calculateEquipmentCosts>,
  needle: string,
) => est.equipment.find((e) => e.name.includes(needle));

describe("EquipmentCostCalculator.calculateEquipmentNeeds — quantity ratios (m²)", () => {
  it("air movers scale by class ratio (m² per unit, converted from 1/200, 1/150, 1/100, 1/75 sq ft)", () => {
    expect(
      EquipmentCostCalculator.calculateEquipmentNeeds(1, 1, 200, 540).airMovers,
    ).toBe(11); // ceil(200 / 18.580608)
    expect(
      EquipmentCostCalculator.calculateEquipmentNeeds(2, 1, 300, 810).airMovers,
    ).toBe(22); // ceil(300 / 13.935456)
    expect(
      EquipmentCostCalculator.calculateEquipmentNeeds(3, 1, 500, 1350)
        .airMovers,
    ).toBe(54); // ceil(500 / 9.290304)
    expect(
      EquipmentCostCalculator.calculateEquipmentNeeds(4, 1, 1000, 2700)
        .airMovers,
    ).toBe(144); // ceil(1000 / 6.967728)
  });

  it("air mover quantity rounds UP at the ratio boundary (Math.ceil)", () => {
    // Class 1 ratio = 200 sq ft converted to m². Exactly 1 unit at the ratio;
    // just over tips to 2.
    const ratio = 200 * SQFT_TO_SQM;
    expect(
      EquipmentCostCalculator.calculateEquipmentNeeds(1, 1, ratio, ratio * 2.7)
        .airMovers,
    ).toBe(1);
    expect(
      EquipmentCostCalculator.calculateEquipmentNeeds(
        1,
        1,
        ratio + 0.1,
        (ratio + 0.1) * 2.7,
      ).airMovers,
    ).toBe(2);
  });

  it("unknown class falls back to the Class 4 ratio (|| airMoverRatios[4])", () => {
    expect(
      EquipmentCostCalculator.calculateEquipmentNeeds(9, 1, 150, 405).airMovers,
    ).toBe(22); // ceil(150 / 6.967728)
  });

  it("LGR dehumidifiers scale by 1 per ~35.4 m³ (converted from 1250 cubic feet)", () => {
    // 200 m² * 2.7m ceiling = 540 m³ -> ceil(540/35.396) = 16
    expect(
      EquipmentCostCalculator.calculateEquipmentNeeds(1, 1, 200, 540)
        .dehumidifiersLGR,
    ).toBe(16);
    // 1000 m² * 2.7m = 2700 m³ -> ceil(2700/35.396) = 77
    expect(
      EquipmentCostCalculator.calculateEquipmentNeeds(4, 1, 1000, 2700)
        .dehumidifiersLGR,
    ).toBe(77);
  });

  it("conventional dehumidifiers only added for class >= 3 (1 per ~46.5 m², converted from 500 sq ft)", () => {
    expect(
      EquipmentCostCalculator.calculateEquipmentNeeds(2, 1, 600, 1620)
        .dehumidifiersConventional,
    ).toBe(0);
    expect(
      EquipmentCostCalculator.calculateEquipmentNeeds(3, 1, 500, 1350)
        .dehumidifiersConventional,
    ).toBe(11); // ceil(500 / 46.45152)
    expect(
      EquipmentCostCalculator.calculateEquipmentNeeds(4, 1, 1000, 2700)
        .dehumidifiersConventional,
    ).toBe(22); // ceil(1000 / 46.45152)
  });

  it("air scrubbers only added for category > 1 (1 per ~46.5 m², converted from 500 sq ft)", () => {
    expect(
      EquipmentCostCalculator.calculateEquipmentNeeds(1, 1, 500, 1350)
        .airScrubbers,
    ).toBe(0);
    expect(
      EquipmentCostCalculator.calculateEquipmentNeeds(1, 2, 500, 1350)
        .airScrubbers,
    ).toBe(11); // ceil(500 / 46.45152)
    expect(
      EquipmentCostCalculator.calculateEquipmentNeeds(1, 3, 1000, 2700)
        .airScrubbers,
    ).toBe(22); // ceil(1000 / 46.45152)
  });
});

describe("EquipmentCostCalculator.calculateEquipmentCosts — line items & branching", () => {
  it("Class 1 / Cat 1 baseline: only air movers, LGR, moisture + humidity meters", () => {
    const est = EquipmentCostCalculator.calculateEquipmentCosts(1, 1, 200);
    // air movers, LGR dehu, moisture meter, humidity monitor = 4 items
    expect(est.equipment).toHaveLength(4);
    expect(find(est, "Air Scrubbers")).toBeUndefined();
    expect(find(est, "Conventional")).toBeUndefined();
    expect(find(est, "Portable Heater")).toBeUndefined();
    expect(find(est, "Moisture Meter")).toBeDefined();
    expect(find(est, "Humidity Monitor")).toBeDefined();
  });

  it("Cat > 1 adds air scrubbers", () => {
    const est = EquipmentCostCalculator.calculateEquipmentCosts(2, 2, 300);
    expect(find(est, "Air Scrubbers")).toBeDefined();
  });

  it("Class >= 3 adds conventional dehumidifiers AND a portable heater", () => {
    const est = EquipmentCostCalculator.calculateEquipmentCosts(3, 3, 500);
    expect(find(est, "Conventional")).toBeDefined();
    expect(find(est, "Portable Heater")).toBeDefined();
    // air movers, LGR, conventional, air scrubber, heater, moisture, humidity = 7
    expect(est.equipment).toHaveLength(7);
  });

  it("portable heater is fixed quantity 1 at the heater daily rate", () => {
    const est = EquipmentCostCalculator.calculateEquipmentCosts(3, 1, 400);
    const heater = find(est, "Portable Heater");
    expect(heater?.quantity).toBe(1);
    expect(heater?.dailyRate).toBe(EQUIPMENT_PRICING.heater);
  });

  it("line-item subtotal = quantity * dailyRate * durationDays", () => {
    const est = EquipmentCostCalculator.calculateEquipmentCosts(
      1,
      1,
      200,
      2.7,
      5,
    );
    const air = find(est, "Air Movers");
    expect(air?.quantity).toBe(11);
    expect(air?.dailyRate).toBe(EQUIPMENT_PRICING.airMover.standard); // 45
    expect(air?.subtotal).toBe(11 * 45 * 5); // 2475
  });
});

describe("EquipmentCostCalculator.calculateEquipmentCosts — totals, labour & contingency", () => {
  it("Class 1 / Cat 1 / 200 m² / defaults: locked totals", () => {
    const est = EquipmentCostCalculator.calculateEquipmentCosts(1, 1, 200);
    expect(est.breakdown.equipmentCost).toBe(8700);
    expect(est.laborCost).toBe(1000); // 200/day * 5 days
    expect(est.subtotal).toBe(9700);
    expect(est.contingency).toBe(970);
    expect(est.total).toBe(10670);
    expect(est.durationDays).toBe(5);
    expect(est.laborDays).toBe(5);
  });

  it("Class 4 / Cat 3 / 1000 m² / defaults: locked totals", () => {
    const est = EquipmentCostCalculator.calculateEquipmentCosts(4, 3, 1000);
    expect(est.breakdown.equipmentCost).toBe(72150);
    expect(est.laborCost).toBe(1000);
    expect(est.subtotal).toBe(73150);
    expect(est.contingency).toBe(7315);
    expect(est.total).toBe(80465);
  });

  it("contingency is 10% of subtotal, Math.round half-up on the Float subtotal", () => {
    const est = EquipmentCostCalculator.calculateEquipmentCosts(1, 1, 200);
    expect(est.subtotal * 0.1).toBeCloseTo(970, 6);
    expect(est.contingency).toBe(970);
  });

  it("total always equals subtotal + contingency and breakdown is internally consistent", () => {
    const est = EquipmentCostCalculator.calculateEquipmentCosts(2, 2, 300);
    expect(est.total).toBe(est.subtotal + est.contingency);
    expect(est.subtotal).toBe(
      est.breakdown.equipmentCost + est.breakdown.laborCost,
    );
    expect(est.breakdown.contingency).toBe(est.contingency);
  });

  it("respects custom durationDays and laborCostPerDay", () => {
    const est = EquipmentCostCalculator.calculateEquipmentCosts(
      1,
      1,
      200,
      2.7,
      10,
      300,
    );
    expect(est.durationDays).toBe(10);
    expect(est.laborDays).toBe(10);
    expect(est.laborCost).toBe(3000); // 300 * 10
    expect(est.laborCostPerDay).toBe(300);
  });

  it("custom ceiling height changes volume (m³) and LGR dehu count", () => {
    // 200 m² * 7m ceiling = 1400 m³ -> ceil(1400/35.396) = 40 LGR units
    const est = EquipmentCostCalculator.calculateEquipmentCosts(
      1,
      1,
      200,
      7,
      5,
    );
    const lgr = find(est, "Dehumidifiers (LGR)");
    expect(lgr?.quantity).toBe(40);
  });

  it("zero affected area yields ceil(0)=0 movers but still 0 LGR + meters (no NaN)", () => {
    const est = EquipmentCostCalculator.calculateEquipmentCosts(1, 1, 0);
    expect(find(est, "Air Movers")?.quantity).toBe(0);
    // 0 * 2.7 = 0 m³ -> ceil(0/35.396) = 0 LGR
    expect(find(est, "Dehumidifiers (LGR)")?.quantity).toBe(0);
    expect(Number.isNaN(est.total)).toBe(false);
    // equipment cost = only meters: (25 + 20) * 5 days = 225
    expect(est.breakdown.equipmentCost).toBe(225);
  });
});

describe("EquipmentCostCalculator.getCostEstimateRange", () => {
  it("Class 2 maps to a 3–5 day drying window with min/max/avg costs", () => {
    const r = EquipmentCostCalculator.getCostEstimateRange(2, 2, 250);
    expect(r.minDays).toBe(3);
    expect(r.maxDays).toBe(5);
    expect(r.minCost).toBe(9620);
    expect(r.maxCost).toBe(16033);
    expect(r.averageCost).toBe(12827);
  });

  it("min/max costs follow the duration window monotonically (max >= min)", () => {
    const r = EquipmentCostCalculator.getCostEstimateRange(3, 3, 500);
    expect(r.minDays).toBe(5);
    expect(r.maxDays).toBe(7);
    expect(r.maxCost).toBeGreaterThan(r.minCost);
  });

  it("unknown class falls back to the Class 4 (7–10 day) window", () => {
    const r = EquipmentCostCalculator.getCostEstimateRange(9, 1, 100);
    expect(r.minDays).toBe(7);
    expect(r.maxDays).toBe(10);
  });

  it("averageCost is the rounded mean of min and max totals", () => {
    const r = EquipmentCostCalculator.getCostEstimateRange(1, 1, 200);
    expect(r.averageCost).toBe(Math.round((r.minCost + r.maxCost) / 2));
  });
});

describe("EquipmentCostCalculator.formatCost", () => {
  it("formats AUD with no decimals", () => {
    expect(EquipmentCostCalculator.formatCost(2008)).toBe("$2,008");
    expect(EquipmentCostCalculator.formatCost(0)).toBe("$0");
  });

  it("only sets a MINIMUM of 0 fraction digits, so non-integers KEEP their decimals", () => {
    // minimumFractionDigits: 0 does NOT cap decimals; a fractional input is shown
    // as-is. In practice contingency/subtotal/total are integers so this never
    // surfaces, but the formatter itself does not round fractional input.
    expect(EquipmentCostCalculator.formatCost(182.5)).toBe("$182.5");
  });
});

describe("EquipmentCostCalculator.generateSummary", () => {
  it("includes equipment lines, totals, contingency and a TOTAL footer", () => {
    const est = EquipmentCostCalculator.calculateEquipmentCosts(1, 1, 200);
    const summary = EquipmentCostCalculator.generateSummary(est);
    expect(summary).toContain("Equipment Cost Estimation Summary");
    expect(summary).toContain("Contingency (10%):");
    expect(summary).toContain("TOTAL:");
    expect(summary).toContain(
      EquipmentCostCalculator.formatCost(est.total),
    );
  });
});
