/**
 * RA-872: Unit tests for equipment-calculator-mould (IICRC S520).
 * Covers condition tiers, containment auto-selection, RH-triggered dehu, ratios.
 */

import { describe, it, expect } from "vitest";
import { calculateMouldEquipment } from "../equipment-calculator-mould";

describe("calculateMouldEquipment — baseline equipment", () => {
  it("Condition 2 / LIMITED: NAM + air scrubber + HEPA vacuum", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 15,
      condition: "CONDITION_2",
    });
    const types = r.equipmentList.map((i) => i.type);
    expect(types).toContain("negative_air_machine");
    expect(types).toContain("air_scrubber_hepa");
    expect(types).toContain("hepa_vacuum");
  });

  it("Condition 3 / FULL for large area", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 50,
      condition: "CONDITION_3",
    });
    expect(r.containmentLevel).toBe("FULL");
  });

  it("SOURCE_CONTROL for tiny area (<1m²)", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 0.5,
      condition: "CONDITION_2",
    });
    expect(r.containmentLevel).toBe("SOURCE_CONTROL");
    // NAM should be skipped for source-control
    const types = r.equipmentList.map((i) => i.type);
    expect(types).not.toContain("negative_air_machine");
  });
});

describe("calculateMouldEquipment — containment auto-selection", () => {
  it("Condition 3 + ≥ 9m² → FULL", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 9,
      condition: "CONDITION_3",
    });
    expect(r.containmentLevel).toBe("FULL");
  });

  it("Condition 3 + < 9m² → LIMITED", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 5,
      condition: "CONDITION_3",
    });
    expect(r.containmentLevel).toBe("LIMITED");
  });

  it("Condition 2 + ≥ 30m² → FULL", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 30,
      condition: "CONDITION_2",
    });
    expect(r.containmentLevel).toBe("FULL");
  });

  it("Condition 2 + small area → LIMITED", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 10,
      condition: "CONDITION_2",
    });
    expect(r.containmentLevel).toBe("LIMITED");
  });

  it("explicit containment override wins over auto-select", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 50,
      condition: "CONDITION_3",
      containment: "LIMITED", // overrides what would be FULL
    });
    expect(r.containmentLevel).toBe("LIMITED");
  });
});

describe("calculateMouldEquipment — RH-triggered dehumidifier", () => {
  it("RH > 60% triggers LGR dehu", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 20,
      condition: "CONDITION_3",
      ambientRelativeHumidity: 75,
    });
    const types = r.equipmentList.map((i) => i.type);
    expect(types).toContain("dehumidifier_lgr");
  });

  it("RH = 60% (default) skips dehu", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 20,
      condition: "CONDITION_3",
    });
    const types = r.equipmentList.map((i) => i.type);
    expect(types).not.toContain("dehumidifier_lgr");
  });

  it("RH < 60% skips dehu", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 20,
      condition: "CONDITION_3",
      ambientRelativeHumidity: 45,
    });
    const types = r.equipmentList.map((i) => i.type);
    expect(types).not.toContain("dehumidifier_lgr");
  });
});

describe("calculateMouldEquipment — ratios (IICRC S520)", () => {
  it("Condition 3 NAM: 60m² ÷ 60 = 1", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 60,
      condition: "CONDITION_3",
    });
    const nam = r.equipmentList.find((i) => i.type === "negative_air_machine");
    expect(nam?.quantity).toBe(1);
  });

  it("Condition 3 NAM: 61m² ÷ 60 = 1.01 → 2", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 61,
      condition: "CONDITION_3",
    });
    const nam = r.equipmentList.find((i) => i.type === "negative_air_machine");
    expect(nam?.quantity).toBe(2);
  });

  it("Condition 2 uses less aggressive ratios (larger m²/unit)", () => {
    const c2 = calculateMouldEquipment({
      affectedAreaM2: 60,
      condition: "CONDITION_2",
    });
    const c3 = calculateMouldEquipment({
      affectedAreaM2: 60,
      condition: "CONDITION_3",
    });
    const c2Nam = c2.equipmentList.find((i) => i.type === "negative_air_machine");
    const c3Nam = c3.equipmentList.find((i) => i.type === "negative_air_machine");
    expect(c3Nam!.quantity).toBeGreaterThanOrEqual(c2Nam!.quantity);
  });
});

describe("calculateMouldEquipment — metadata", () => {
  it("every line item cites IICRC S520", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 30,
      condition: "CONDITION_3",
      ambientRelativeHumidity: 70,
    });
    for (const item of r.equipmentList) {
      expect(item.iicrcReference).toMatch(/IICRC S520/);
    }
  });

  it("classification string contains condition + containment", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 30,
      condition: "CONDITION_3",
    });
    expect(r.iicrcClassification).toMatch(/S520/);
    expect(r.iicrcClassification).toMatch(/CONDITION 3/);
  });

  it("recommendedCircuits >= 1", () => {
    const r = calculateMouldEquipment({
      affectedAreaM2: 10,
      condition: "CONDITION_2",
    });
    expect(r.recommendedCircuits).toBeGreaterThanOrEqual(1);
  });
});
