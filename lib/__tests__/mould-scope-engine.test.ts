/**
 * Unit tests for the S520 mould scope engine — RA-852
 *
 * Covers:
 *   - determineMouldScopeItems() from lib/nir-scope-determination.ts
 *   - calculateMouldEquipment()   from lib/equipment-calculator.ts
 */

import { describe, it, expect } from "vitest";
import {
  determineMouldScopeItems,
  type MouldScopeInput,
} from "../nir-scope-determination";
import { calculateMouldEquipment } from "../equipment-calculator";

// ─── determineMouldScopeItems ─────────────────────────────────────────────────

describe("determineMouldScopeItems", () => {
  const baseInput: MouldScopeInput = {
    mouldAffectedArea: 30,
    mouldSeverity: "class1",
    materialsToRemove: false,
    moistureSourceActive: false,
  };

  it("returns items in containment → remediation → air-treatment sequence", () => {
    const items = determineMouldScopeItems(baseInput);
    const types = items.map((i) => i.itemType);

    // Containment comes first
    expect(types.indexOf("containment_barrier")).toBeLessThan(
      types.indexOf("hepa_vacuum_surfaces"),
    );
    // Remediation before air treatment
    expect(types.indexOf("hepa_vacuum_surfaces")).toBeLessThan(
      types.indexOf("hepa_air_filtration"),
    );
    // Clearance test appears after HEPA filtration
    expect(types.indexOf("hepa_air_filtration")).toBeLessThan(
      types.indexOf("clearance_air_test"),
    );
  });

  it("every item carries an S520 clause reference", () => {
    const items = determineMouldScopeItems({
      ...baseInput,
      mouldSeverity: "class3",
      materialsToRemove: true,
      moistureSourceActive: true,
    });
    for (const item of items) {
      expect(
        item.clauseRefs,
        `Item '${item.itemType}' is missing clauseRefs`,
      ).toBeDefined();
      expect(
        (item.clauseRefs ?? []).length,
        `Item '${item.itemType}' has empty clauseRefs`,
      ).toBeGreaterThan(0);
    }
  });

  it("clearance test has taxType INPUT (subcontractor pass-through)", () => {
    const items = determineMouldScopeItems(baseInput);
    const clearance = items.find((i) => i.itemType === "clearance_air_test");
    expect(clearance).toBeDefined();
    expect(clearance?.taxType).toBe("INPUT");
  });

  it("negative_air_pressure always included", () => {
    const items = determineMouldScopeItems(baseInput);
    expect(items.some((i) => i.itemType === "negative_air_pressure")).toBe(
      true,
    );
  });

  it("decontamination_chamber included for class2 but not class1", () => {
    const class1 = determineMouldScopeItems({
      ...baseInput,
      mouldSeverity: "class1",
    });
    const class2 = determineMouldScopeItems({
      ...baseInput,
      mouldSeverity: "class2",
    });
    expect(class1.some((i) => i.itemType === "decontamination_chamber")).toBe(
      false,
    );
    expect(class2.some((i) => i.itemType === "decontamination_chamber")).toBe(
      true,
    );
  });

  it("materialsToRemove=true adds mould_material_removal and mould_waste_disposal", () => {
    const items = determineMouldScopeItems({
      ...baseInput,
      materialsToRemove: true,
    });
    expect(items.some((i) => i.itemType === "mould_material_removal")).toBe(
      true,
    );
    expect(items.some((i) => i.itemType === "mould_waste_disposal")).toBe(true);
  });

  it("materialsToRemove=false with class2 adds encapsulation instead of removal", () => {
    const items = determineMouldScopeItems({
      ...baseInput,
      mouldSeverity: "class2",
      materialsToRemove: false,
    });
    expect(items.some((i) => i.itemType === "encapsulation")).toBe(true);
    expect(items.some((i) => i.itemType === "mould_material_removal")).toBe(
      false,
    );
    expect(items.some((i) => i.itemType === "mould_waste_disposal")).toBe(
      false,
    );
  });

  it("moistureSourceActive=true adds structural_drying_mould", () => {
    const items = determineMouldScopeItems({
      ...baseInput,
      moistureSourceActive: true,
    });
    expect(items.some((i) => i.itemType === "structural_drying_mould")).toBe(
      true,
    );
  });

  it("moistureSourceActive=false omits structural_drying_mould", () => {
    const items = determineMouldScopeItems({
      ...baseInput,
      moistureSourceActive: false,
    });
    expect(items.some((i) => i.itemType === "structural_drying_mould")).toBe(
      false,
    );
  });

  it("area-based items carry quantity in m² equal to mouldAffectedArea", () => {
    const area = 45;
    const items = determineMouldScopeItems({
      ...baseInput,
      mouldAffectedArea: area,
      materialsToRemove: true,
    });
    const areaItems = items.filter((i) => i.unit === "m²");
    for (const item of areaItems) {
      expect(item.quantity).toBe(area);
    }
  });

  it("containment_barrier references IICRC S520:2015 §7.3", () => {
    const items = determineMouldScopeItems(baseInput);
    const barrier = items.find((i) => i.itemType === "containment_barrier");
    expect(barrier?.clauseRefs).toContain("IICRC S520:2015 §7.3");
  });

  it("structural_drying_mould references IICRC S500:2025 §7.1", () => {
    const items = determineMouldScopeItems({
      ...baseInput,
      moistureSourceActive: true,
    });
    const drying = items.find((i) => i.itemType === "structural_drying_mould");
    expect(drying?.clauseRefs).toContain("IICRC S500:2025 §7.1");
  });
});

// ─── calculateMouldEquipment ──────────────────────────────────────────────────

describe("calculateMouldEquipment", () => {
  it("returns all three equipment types", () => {
    const result = calculateMouldEquipment({ mouldAffectedAreaM2: 50 });
    const types = result.equipmentList.map((e) => e.type);
    expect(types).toContain("negative_air_machine");
    expect(types).toContain("hepa_vacuum");
    expect(types).toContain("air_filtration_device");
  });

  it("50m² → 1 negative air machine (1 per 50m²)", () => {
    const result = calculateMouldEquipment({ mouldAffectedAreaM2: 50 });
    const nam = result.equipmentList.find(
      (e) => e.type === "negative_air_machine",
    );
    expect(nam?.quantity).toBe(1);
    expect(nam?.iicrcReference).toBe("IICRC S520:2015 §7.4");
  });

  it("100m² → 2 negative air machines (ceil 100/50)", () => {
    const result = calculateMouldEquipment({ mouldAffectedAreaM2: 100 });
    const nam = result.equipmentList.find(
      (e) => e.type === "negative_air_machine",
    );
    expect(nam?.quantity).toBe(2);
  });

  it("51m² → 2 negative air machines (rounds up)", () => {
    const result = calculateMouldEquipment({ mouldAffectedAreaM2: 51 });
    const nam = result.equipmentList.find(
      (e) => e.type === "negative_air_machine",
    );
    expect(nam?.quantity).toBe(2);
  });

  it("75m² → 1 HEPA vacuum (1 per 75m²)", () => {
    const result = calculateMouldEquipment({ mouldAffectedAreaM2: 75 });
    const hv = result.equipmentList.find((e) => e.type === "hepa_vacuum");
    expect(hv?.quantity).toBe(1);
    expect(hv?.iicrcReference).toBe("IICRC S520:2015 §8.2");
  });

  it("150m² → 2 HEPA vacuums (ceil 150/75)", () => {
    const result = calculateMouldEquipment({ mouldAffectedAreaM2: 150 });
    const hv = result.equipmentList.find((e) => e.type === "hepa_vacuum");
    expect(hv?.quantity).toBe(2);
  });

  it("100m² → 1 AFD (1 per 100m²)", () => {
    const result = calculateMouldEquipment({ mouldAffectedAreaM2: 100 });
    const afd = result.equipmentList.find(
      (e) => e.type === "air_filtration_device",
    );
    expect(afd?.quantity).toBe(1);
    expect(afd?.iicrcReference).toBe("IICRC S520:2015 §8.4");
  });

  it("1m² area → minimum 1 of each type", () => {
    const result = calculateMouldEquipment({ mouldAffectedAreaM2: 1 });
    for (const item of result.equipmentList) {
      expect(item.quantity).toBeGreaterThanOrEqual(1);
    }
  });

  it("summary includes IICRC S520:2015 label", () => {
    const result = calculateMouldEquipment({ mouldAffectedAreaM2: 50 });
    expect(result.summary).toContain("IICRC S520:2015");
  });

  it("totalEstimatedAmps is sum of all item amps", () => {
    const result = calculateMouldEquipment({ mouldAffectedAreaM2: 50 });
    const manualTotal = result.equipmentList.reduce(
      (sum, e) => sum + e.estimatedAmpsTotal,
      0,
    );
    expect(result.totalEstimatedAmps).toBeCloseTo(manualTotal, 2);
  });
});
