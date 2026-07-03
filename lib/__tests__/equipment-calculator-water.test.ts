/**
 * Unit tests for the IICRC S500 water-damage equipment calculator:
 * area ratios, desiccant selection (Class 4 / low ambient temperature),
 * AS/NZS 3012:2019 circuit maths on 10A GPOs, and the power/running-cost model.
 *
 * Electrical expectations trace to lib/equipment-matrix.ts sourced averages:
 *   air mover (airmover-800):        0.57 A / 131 W
 *   LGR dehu (lgr-85):               5.1 A / 1180 W
 *   desiccant dehu (desiccant-35):   8.0 A / 1850 W
 *   AFD / NAM (afd-500):             1.5 A / 345 W
 */

import { describe, it, expect } from "vitest";
import { calculateEquipment } from "../equipment-calculator";

describe("calculateEquipment — ratio engine", () => {
  it("sizes a Class 2 / Cat 1 30m2 job (2 air movers, 1 LGR, no AFD/NAM)", () => {
    const r = calculateEquipment({
      affectedAreaM2: 30,
      damageClass: "CLASS_2",
      damageCategory: "CAT_1",
    });
    const byType = Object.fromEntries(
      r.equipmentList.map((i) => [i.type, i.quantity]),
    );
    expect(byType.air_mover).toBe(2); // 30/15 = 2
    expect(byType.lgr_dehumidifier).toBe(1); // 30/40 = 0.75 -> 1
    expect(byType.air_scrubber).toBeUndefined();
    expect(byType.negative_air_machine).toBeUndefined();
    expect(byType.desiccant_dehumidifier).toBeUndefined();
  });

  it("sizes a Class 3 / Cat 2 100m2 job with AFDs", () => {
    const r = calculateEquipment({
      affectedAreaM2: 100,
      damageClass: "CLASS_3",
      damageCategory: "CAT_2",
    });
    const byType = Object.fromEntries(
      r.equipmentList.map((i) => [i.type, i.quantity]),
    );
    expect(byType.air_mover).toBe(10); // 100/10
    expect(byType.lgr_dehumidifier).toBe(4); // 100/30 -> ceil
    expect(byType.air_scrubber).toBe(2); // 100/50
    expect(byType.negative_air_machine).toBeUndefined();
  });

  it("adds negative air for Cat 3 (minimum 1)", () => {
    const r = calculateEquipment({
      affectedAreaM2: 20,
      damageClass: "CLASS_2",
      damageCategory: "CAT_3",
    });
    const nam = r.equipmentList.find(
      (i) => i.type === "negative_air_machine",
    );
    expect(nam?.quantity).toBe(1);
  });

  it("multiplies area by floorCount", () => {
    const r = calculateEquipment({
      affectedAreaM2: 30,
      damageClass: "CLASS_2",
      damageCategory: "CAT_1",
      floorCount: 2,
    });
    const airMover = r.equipmentList.find((i) => i.type === "air_mover");
    expect(airMover?.quantity).toBe(4); // 60/15
  });
});

describe("calculateEquipment — desiccant selection", () => {
  it("substitutes desiccant for LGR on Class 4 (specialty drying)", () => {
    const r = calculateEquipment({
      affectedAreaM2: 60,
      damageClass: "CLASS_4",
      damageCategory: "CAT_1",
    });
    const types = r.equipmentList.map((i) => i.type);
    expect(types).toContain("desiccant_dehumidifier");
    expect(types).not.toContain("lgr_dehumidifier");
    const desiccant = r.equipmentList.find(
      (i) => i.type === "desiccant_dehumidifier",
    );
    expect(desiccant?.quantity).toBe(2); // 60/30
    expect(desiccant?.justification).toContain("Class 4");
  });

  it("substitutes desiccant below 15C ambient (LGR efficiency collapse)", () => {
    const r = calculateEquipment({
      affectedAreaM2: 40,
      damageClass: "CLASS_2",
      damageCategory: "CAT_1",
      ambientTempC: 10,
    });
    const types = r.equipmentList.map((i) => i.type);
    expect(types).toContain("desiccant_dehumidifier");
    expect(types).not.toContain("lgr_dehumidifier");
  });

  it("keeps LGR at normal ambient temperature", () => {
    const r = calculateEquipment({
      affectedAreaM2: 40,
      damageClass: "CLASS_2",
      damageCategory: "CAT_1",
      ambientTempC: 24,
    });
    const types = r.equipmentList.map((i) => i.type);
    expect(types).toContain("lgr_dehumidifier");
    expect(types).not.toContain("desiccant_dehumidifier");
  });
});

describe("calculateEquipment — AS/NZS 3012 circuit maths (10A GPO primary)", () => {
  it("small job fits one 10A GPO circuit with no warning", () => {
    const r = calculateEquipment({
      affectedAreaM2: 30,
      damageClass: "CLASS_2",
      damageCategory: "CAT_1",
    });
    // 2 air movers (1.14A) + 1 LGR (5.1A) = 6.24A <= 8A continuous
    expect(r.totalEstimatedAmps).toBeCloseTo(6.24, 2);
    expect(r.recommendedCircuits).toBe(1);
    expect(r.circuitLoadWarning).toBeUndefined();
  });

  it("large Cat 3 job spreads across multiple circuits and warns", () => {
    const r = calculateEquipment({
      affectedAreaM2: 100,
      damageClass: "CLASS_3",
      damageCategory: "CAT_3",
    });
    // 10 air movers 5.7A + 4 LGR 20.4A + 2 AFD 3A + 2 NAM 3A = 32.1A
    expect(r.totalEstimatedAmps).toBeCloseTo(32.1, 2);
    expect(r.recommendedCircuits).toBe(5); // ceil(32.1 / 8)
    expect(r.circuitLoadWarning).toContain("AS/NZS 3012:2019");
    expect(r.circuitLoadWarning).toContain("10A");
  });

  it("reports 10A / 15A / 20A circuit options under the 80% rule", () => {
    const r = calculateEquipment({
      affectedAreaM2: 100,
      damageClass: "CLASS_3",
      damageCategory: "CAT_3",
    });
    const byRating = Object.fromEntries(
      r.circuitOptions.map((c) => [c.ratingA, c]),
    );
    expect(byRating[10].maxContinuousA).toBe(8);
    expect(byRating[15].maxContinuousA).toBe(12);
    expect(byRating[20].maxContinuousA).toBe(16);
    expect(byRating[10].circuitsRequired).toBe(5); // ceil(32.1/8)
    expect(byRating[15].circuitsRequired).toBe(3); // ceil(32.1/12)
    expect(byRating[20].circuitsRequired).toBe(3); // ceil(32.1/16)
  });
});

describe("calculateEquipment — power and running-cost model", () => {
  it("computes watts, kWh/day and cost/day at the default tariff", () => {
    const r = calculateEquipment({
      affectedAreaM2: 30,
      damageClass: "CLASS_2",
      damageCategory: "CAT_1",
    });
    // 2 air movers (262W) + 1 LGR (1180W) = 1442W
    expect(r.totalEstimatedWatts).toBe(1442);
    expect(r.totalKwhPerDay).toBeCloseTo(34.61, 2); // 1442 x 24 / 1000
    expect(r.tariffCentsPerKwh).toBe(34);
    expect(r.energyCostPerDay).toBeCloseTo(11.77, 2); // 34.61 x 0.34
  });

  it("honours a caller-supplied tariff override", () => {
    const r = calculateEquipment({
      affectedAreaM2: 30,
      damageClass: "CLASS_2",
      damageCategory: "CAT_1",
      tariffCentsPerKwh: 25,
    });
    expect(r.tariffCentsPerKwh).toBe(25);
    expect(r.energyCostPerDay).toBeCloseTo(8.65, 2); // 34.61 x 0.25
  });

  it("every line item carries per-unit and total electrical figures", () => {
    const r = calculateEquipment({
      affectedAreaM2: 100,
      damageClass: "CLASS_3",
      damageCategory: "CAT_3",
    });
    for (const item of r.equipmentList) {
      expect(item.estimatedAmpsEach).toBeGreaterThan(0);
      expect(item.estimatedWattsEach).toBeGreaterThan(0);
      expect(item.estimatedWattsTotal).toBe(
        item.estimatedWattsEach * item.quantity,
      );
      expect(item.kwhPerDayTotal).toBeCloseTo(
        (item.estimatedWattsTotal * 24) / 1000,
        1,
      );
    }
  });
});

describe("calculateEquipment — citations", () => {
  it("only cites corpus-verified S500 sections (12.5 / 12.4.2 / 12.3.2)", () => {
    const r = calculateEquipment({
      affectedAreaM2: 100,
      damageClass: "CLASS_3",
      damageCategory: "CAT_3",
    });
    const allowed = ["§12.5", "§12.4.2", "§12.3.2"];
    for (const item of r.equipmentList) {
      expect(item.iicrcReference).toContain("S500:2021");
      expect(
        allowed.some((s) => item.iicrcReference.includes(s)),
        `unexpected citation: ${item.iicrcReference}`,
      ).toBe(true);
    }
  });

  it("never cites the fabricated §9.x equipment sections", () => {
    const r = calculateEquipment({
      affectedAreaM2: 100,
      damageClass: "CLASS_4",
      damageCategory: "CAT_3",
    });
    for (const item of r.equipmentList) {
      expect(item.iicrcReference).not.toMatch(/§9\./);
    }
  });
});
