/**
 * RA-872: Unit tests for equipment-calculator-fire (IICRC S700).
 * Covers severity tiers, occupancy branching, multi-floor scaling, circuit warnings.
 */

import { describe, it, expect } from "vitest";
import { calculateFireEquipment } from "../equipment-calculator-fire";

describe("calculateFireEquipment — severity tiers", () => {
  it("MINOR: air scrubber + ozone + HEPA vacuum (no NAM, no fogger)", () => {
    const r = calculateFireEquipment({
      affectedAreaM2: 50,
      severity: "MINOR",
    });
    const types = r.equipmentList.map((i) => i.type);
    expect(types).toContain("air_scrubber_hepa");
    expect(types).toContain("ozone_generator");
    expect(types).toContain("hepa_vacuum");
    expect(types).not.toContain("negative_air_machine");
    expect(types).not.toContain("thermal_fogger");
  });

  it("MODERATE: adds thermal fogger", () => {
    const r = calculateFireEquipment({
      affectedAreaM2: 100,
      severity: "MODERATE",
    });
    const types = r.equipmentList.map((i) => i.type);
    expect(types).toContain("thermal_fogger");
    expect(types).not.toContain("negative_air_machine");
  });

  it("SEVERE: adds negative air machine", () => {
    const r = calculateFireEquipment({
      affectedAreaM2: 200,
      severity: "SEVERE",
    });
    const types = r.equipmentList.map((i) => i.type);
    expect(types).toContain("negative_air_machine");
    expect(types).toContain("thermal_fogger");
    expect(types).toContain("air_scrubber_hepa");
  });
});

describe("calculateFireEquipment — occupancy branching (S700 §9.4.2)", () => {
  it("occupied=true uses hydroxyl (not ozone)", () => {
    const r = calculateFireEquipment({
      affectedAreaM2: 100,
      severity: "MODERATE",
      occupied: true,
    });
    const types = r.equipmentList.map((i) => i.type);
    expect(types).toContain("hydroxyl_generator");
    expect(types).not.toContain("ozone_generator");
  });

  it("occupied=false (default) uses ozone", () => {
    const r = calculateFireEquipment({
      affectedAreaM2: 100,
      severity: "MODERATE",
    });
    const types = r.equipmentList.map((i) => i.type);
    expect(types).toContain("ozone_generator");
    expect(types).not.toContain("hydroxyl_generator");
  });
});

describe("calculateFireEquipment — ratios (round up)", () => {
  it("75m² MODERATE air scrubber: 75 ÷ 75 = 1", () => {
    const r = calculateFireEquipment({
      affectedAreaM2: 75,
      severity: "MODERATE",
    });
    const scrubber = r.equipmentList.find(
      (i) => i.type === "air_scrubber_hepa",
    );
    expect(scrubber?.quantity).toBe(1);
  });

  it("76m² MODERATE air scrubber rounds up: 76 ÷ 75 = 1.01 → 2", () => {
    const r = calculateFireEquipment({
      affectedAreaM2: 76,
      severity: "MODERATE",
    });
    const scrubber = r.equipmentList.find(
      (i) => i.type === "air_scrubber_hepa",
    );
    expect(scrubber?.quantity).toBe(2);
  });

  it("200m² SEVERE NAM: 200 ÷ 80 = 2.5 → 3", () => {
    const r = calculateFireEquipment({
      affectedAreaM2: 200,
      severity: "SEVERE",
    });
    const nam = r.equipmentList.find((i) => i.type === "negative_air_machine");
    expect(nam?.quantity).toBe(3);
  });
});

describe("calculateFireEquipment — multi-floor scaling", () => {
  it("floorCount=3 triples area used in ratios", () => {
    const singleFloor = calculateFireEquipment({
      affectedAreaM2: 50,
      severity: "MODERATE",
    });
    const multiFloor = calculateFireEquipment({
      affectedAreaM2: 50,
      severity: "MODERATE",
      floorCount: 3,
    });
    const singleAs = singleFloor.equipmentList.find(
      (i) => i.type === "air_scrubber_hepa",
    );
    const multiAs = multiFloor.equipmentList.find(
      (i) => i.type === "air_scrubber_hepa",
    );
    expect(multiAs!.quantity).toBeGreaterThan(singleAs!.quantity);
  });
});

describe("calculateFireEquipment — electrical load", () => {
  it("recommendedCircuits >= 1 always", () => {
    const r = calculateFireEquipment({
      affectedAreaM2: 10,
      severity: "MINOR",
    });
    expect(r.recommendedCircuits).toBeGreaterThanOrEqual(1);
  });

  it("totalEstimatedAmps is sum of line-item totals", () => {
    const r = calculateFireEquipment({
      affectedAreaM2: 100,
      severity: "MODERATE",
    });
    const sum = r.equipmentList.reduce((s, i) => s + i.estimatedAmpsTotal, 0);
    expect(r.totalEstimatedAmps).toBeCloseTo(sum, 2);
  });
});

describe("calculateFireEquipment — metadata", () => {
  it("classification string contains severity and standard", () => {
    const r = calculateFireEquipment({
      affectedAreaM2: 50,
      severity: "SEVERE",
    });
    expect(r.iicrcClassification).toMatch(/S700/);
    expect(r.iicrcClassification).toMatch(/SEVERE/);
  });

  it("every line item cites IICRC S700", () => {
    const r = calculateFireEquipment({
      affectedAreaM2: 100,
      severity: "MODERATE",
    });
    for (const item of r.equipmentList) {
      expect(item.iicrcReference).toMatch(/IICRC S700/);
    }
  });

  it("summary mentions occupied when true", () => {
    const r = calculateFireEquipment({
      affectedAreaM2: 100,
      severity: "MODERATE",
      occupied: true,
    });
    expect(r.summary).toMatch(/occupied/);
  });
});
