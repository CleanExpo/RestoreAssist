/**
 * RA-873: Unit tests for HEPA vacuum + negative-air machine calculator.
 */

import { describe, it, expect } from "vitest";
import { calculateHepaNegativeAir } from "../equipment-hepa-negative-air";

describe("calculateHepaNegativeAir — containment class ACH defaults", () => {
  it("uses ACH 4 for critical-barrier", () => {
    const r = calculateHepaNegativeAir({
      roomVolumeM3: 100,
      containmentClass: "critical-barrier",
    });
    expect(r.airChangesPerHour).toBe(4);
  });

  it("uses ACH 6 for negative-pressure", () => {
    const r = calculateHepaNegativeAir({
      roomVolumeM3: 100,
      containmentClass: "negative-pressure",
    });
    expect(r.airChangesPerHour).toBe(6);
  });

  it("uses ACH 8 for secondary-containment", () => {
    const r = calculateHepaNegativeAir({
      roomVolumeM3: 100,
      containmentClass: "secondary-containment",
    });
    expect(r.airChangesPerHour).toBe(8);
  });

  it("allows ACH override", () => {
    const r = calculateHepaNegativeAir({
      roomVolumeM3: 100,
      containmentClass: "critical-barrier",
      ach: 12,
    });
    expect(r.airChangesPerHour).toBe(12);
  });
});

describe("calculateHepaNegativeAir — NAM sizing from CFM", () => {
  it("sizes NAMs for a small 50 m³ critical-barrier room", () => {
    const r = calculateHepaNegativeAir({
      roomVolumeM3: 50,
      containmentClass: "critical-barrier",
    });
    // CFM = 50 × 35.3147 × 4 / 60 ≈ 117.72 → /500 = 0.24 → ceil = 1
    expect(r.negativeAirMachineCount).toBe(1);
  });

  it("sizes NAMs for a 200 m³ negative-pressure room", () => {
    const r = calculateHepaNegativeAir({
      roomVolumeM3: 200,
      containmentClass: "negative-pressure",
    });
    // CFM = 200 × 35.3147 × 6 / 60 = 706.29 → /500 = 1.41 → ceil = 2
    expect(r.negativeAirMachineCount).toBe(2);
  });

  it("sizes NAMs for a large 1000 m³ secondary-containment room", () => {
    const r = calculateHepaNegativeAir({
      roomVolumeM3: 1000,
      containmentClass: "secondary-containment",
    });
    // CFM = 1000 × 35.3147 × 8 / 60 = 4708.6 → /500 = 9.42 → ceil = 10
    expect(r.negativeAirMachineCount).toBe(10);
  });

  it("zero volume → zero NAMs", () => {
    const r = calculateHepaNegativeAir({
      roomVolumeM3: 0,
      containmentClass: "negative-pressure",
    });
    expect(r.negativeAirMachineCount).toBe(0);
    expect(r.hepaVacuumCount).toBe(0);
  });
});

describe("calculateHepaNegativeAir — HEPA vacuum sizing", () => {
  it("sizes HEPA vacuums from estimated surface area", () => {
    const r = calculateHepaNegativeAir({
      roomVolumeM3: 60,
      containmentClass: "critical-barrier",
    });
    // floor area = 60/2.4 = 25 m²; surface = 50 m²; /25 = 2
    expect(r.hepaVacuumCount).toBe(2);
  });

  it("rounds up HEPA vacuum count", () => {
    const r = calculateHepaNegativeAir({
      roomVolumeM3: 30, // floor = 12.5, surface = 25, /25 = 1
      containmentClass: "critical-barrier",
    });
    expect(r.hepaVacuumCount).toBe(1);
  });

  it("returns at least 1 HEPA vacuum for any non-zero volume", () => {
    const r = calculateHepaNegativeAir({
      roomVolumeM3: 5,
      containmentClass: "critical-barrier",
    });
    expect(r.hepaVacuumCount).toBeGreaterThanOrEqual(1);
  });
});

describe("calculateHepaNegativeAir — non-integer room sizes", () => {
  it("handles fractional room volume", () => {
    const r = calculateHepaNegativeAir({
      roomVolumeM3: 87.5,
      containmentClass: "negative-pressure",
    });
    expect(r.negativeAirMachineCount).toBeGreaterThan(0);
    expect(r.hepaVacuumCount).toBeGreaterThan(0);
    expect(Number.isInteger(r.negativeAirMachineCount)).toBe(true);
    expect(Number.isInteger(r.hepaVacuumCount)).toBe(true);
  });

  it("handles fractional ACH override", () => {
    const r = calculateHepaNegativeAir({
      roomVolumeM3: 100,
      containmentClass: "critical-barrier",
      ach: 5.5,
    });
    expect(r.airChangesPerHour).toBe(5.5);
    // CFM = 100 × 35.3147 × 5.5 / 60 ≈ 323.72 → 1
    expect(r.negativeAirMachineCount).toBe(1);
  });
});
