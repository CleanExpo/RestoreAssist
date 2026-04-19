/**
 * RA-873: Unit tests for storm equipment calculator.
 */

import { describe, it, expect } from "vitest";
import { calculateStormEquipment } from "../equipment-calculator-storm";

describe("calculateStormEquipment — small job", () => {
  it("sizes a small storm-damage room", () => {
    const r = calculateStormEquipment({
      affectedAreaM2: 20,
      stormWaterVolumeLitres: 200,
      estimatedDays: 3,
    });
    // 200L / 500 = 0.4 → ceil = 1
    expect(r.submersiblePumps).toBe(1);
    // 20 / 200 = 0.1 → ceil = 1
    expect(r.truckMountExtractors).toBe(1);
    // 20 / 14 = 1.43 → ceil = 2
    expect(r.airMovers).toBe(2);
    // 20 × 3 / 80 = 0.75 → ceil = 1
    expect(r.dehumidifiers).toBe(1);
    // 4 × sqrt(20) × 1.2 ≈ 21.466
    expect(r.shrinkWrapRollsM).toBeCloseTo(21.466, 2);
  });
});

describe("calculateStormEquipment — medium job", () => {
  it("sizes a medium storm job", () => {
    const r = calculateStormEquipment({
      affectedAreaM2: 150,
      stormWaterVolumeLitres: 1500,
      estimatedDays: 5,
    });
    // 1500 / 500 = 3
    expect(r.submersiblePumps).toBe(3);
    // 150 / 200 = 0.75 → 1
    expect(r.truckMountExtractors).toBe(1);
    // 150 / 14 = 10.71 → 11
    expect(r.airMovers).toBe(11);
    // 150 × 5 / 80 = 9.375 → 10
    expect(r.dehumidifiers).toBe(10);
    expect(r.shrinkWrapRollsM).toBeCloseTo(4 * Math.sqrt(150) * 1.2, 5);
  });
});

describe("calculateStormEquipment — large job", () => {
  it("sizes a large storm job", () => {
    const r = calculateStormEquipment({
      affectedAreaM2: 1000,
      stormWaterVolumeLitres: 2500,
      estimatedDays: 10,
    });
    // 2500 / 500 = 5
    expect(r.submersiblePumps).toBe(5);
    // 1000 / 200 = 5
    expect(r.truckMountExtractors).toBe(5);
    // 1000 / 14 = 71.4 → 72
    expect(r.airMovers).toBe(72);
    // 1000 × 10 / 80 = 125
    expect(r.dehumidifiers).toBe(125);
  });
});

describe("calculateStormEquipment — zero volume", () => {
  it("returns zero submersible pumps when there is no standing water", () => {
    const r = calculateStormEquipment({
      affectedAreaM2: 50,
      stormWaterVolumeLitres: 0,
      estimatedDays: 2,
    });
    expect(r.submersiblePumps).toBe(0);
    // but other equipment still sized
    expect(r.truckMountExtractors).toBeGreaterThan(0);
    expect(r.airMovers).toBeGreaterThan(0);
    expect(r.dehumidifiers).toBeGreaterThan(0);
  });

  it("returns zero dehumidifiers when estimatedDays is 0", () => {
    const r = calculateStormEquipment({
      affectedAreaM2: 50,
      stormWaterVolumeLitres: 100,
      estimatedDays: 0,
    });
    expect(r.dehumidifiers).toBe(0);
  });

  it("returns zero counts for fully zero input", () => {
    const r = calculateStormEquipment({
      affectedAreaM2: 0,
      stormWaterVolumeLitres: 0,
      estimatedDays: 0,
    });
    expect(r.submersiblePumps).toBe(0);
    expect(r.truckMountExtractors).toBe(0);
    expect(r.airMovers).toBe(0);
    expect(r.dehumidifiers).toBe(0);
    expect(r.shrinkWrapRollsM).toBe(0);
  });
});

describe("calculateStormEquipment — maxima", () => {
  it("caps submersible pumps at 8 even for huge water volumes", () => {
    const r = calculateStormEquipment({
      affectedAreaM2: 500,
      stormWaterVolumeLitres: 100_000,
      estimatedDays: 7,
    });
    expect(r.submersiblePumps).toBe(8);
  });

  it("still caps at 8 exactly at the boundary", () => {
    const r = calculateStormEquipment({
      affectedAreaM2: 100,
      stormWaterVolumeLitres: 4000, // 4000/500 = 8 exactly
      estimatedDays: 1,
    });
    expect(r.submersiblePumps).toBe(8);
  });
});

describe("calculateStormEquipment — shrink wrap overage", () => {
  it("applies 20% overage to 4 × sqrt(area) perimeter estimate", () => {
    const areaM2 = 100;
    const r = calculateStormEquipment({
      affectedAreaM2: areaM2,
      stormWaterVolumeLitres: 0,
      estimatedDays: 1,
    });
    // 4 × sqrt(100) = 40 m base perimeter; × 1.2 = 48 m
    expect(r.shrinkWrapRollsM).toBeCloseTo(48, 5);
  });
});
