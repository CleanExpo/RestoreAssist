/**
 * Tests for fire/smoke scope determination (RA-851)
 *
 * Covers: determineFireSmokeScopeItems() and calculateFireEquipment()
 * All clause references are verified against IICRC S700:2015.
 */

import { describe, it, expect } from "vitest";
import {
  determineFireSmokeScopeItems,
  type FireSmokeInput,
} from "../nir-scope-determination";
import { calculateFireEquipment } from "../equipment-calculator";

// ─── determineFireSmokeScopeItems ─────────────────────────────────────────────

describe("determineFireSmokeScopeItems", () => {
  const baseInput: FireSmokeInput = {
    affectedArea: 100,
    smokeCategory: "light",
    waterPresent: false,
    contentsAffected: false,
  };

  // ── Core items always present ───────────────────────────────────────────────

  it("always includes HEPA vacuuming with S700:2015 §6.2 reference", () => {
    const items = determineFireSmokeScopeItems(baseInput);
    const item = items.find((i) => i.itemType === "hepa_vacuum_surfaces");
    expect(item).toBeDefined();
    expect(item!.clauseRefs).toContain("IICRC S700:2015 §6.2");
    expect(item!.quantity).toBe(100);
    expect(item!.unit).toBe("m²");
    expect(item!.isRequired).toBe(true);
  });

  it("always includes soot removal with S700:2015 §6.1 reference", () => {
    const items = determineFireSmokeScopeItems(baseInput);
    const item = items.find((i) => i.itemType === "soot_removal");
    expect(item).toBeDefined();
    expect(item!.clauseRefs).toContain("IICRC S700:2015 §6.1");
    expect(item!.isRequired).toBe(true);
  });

  it("always includes smoke odour treatment with S700:2015 §6.3 reference", () => {
    const items = determineFireSmokeScopeItems(baseInput);
    const item = items.find((i) => i.itemType === "smoke_odour_treatment");
    expect(item).toBeDefined();
    expect(item!.clauseRefs).toContain("IICRC S700:2015 §6.3");
    expect(item!.isRequired).toBe(true);
  });

  it("always includes AFD deployment with S700:2015 §9.1 reference", () => {
    const items = determineFireSmokeScopeItems(baseInput);
    const item = items.find((i) => i.itemType === "afd_deployment");
    expect(item).toBeDefined();
    expect(item!.clauseRefs).toContain("IICRC S700:2015 §9.1");
    expect(item!.isRequired).toBe(true);
  });

  it("always includes clearance air quality test with S700:2015 §10.2 reference", () => {
    const items = determineFireSmokeScopeItems(baseInput);
    const item = items.find((i) => i.itemType === "clearance_air_quality_test");
    expect(item).toBeDefined();
    expect(item!.clauseRefs).toContain("IICRC S700:2015 §10.2");
    expect(item!.isRequired).toBe(true);
  });

  // ── Smoke category gates ────────────────────────────────────────────────────

  it("omits encapsulation and thermal fogging for light smoke", () => {
    const items = determineFireSmokeScopeItems(baseInput);
    const encap = items.find(
      (i) => i.itemType === "encapsulation_smoke_surfaces",
    );
    const fog = items.find((i) => i.itemType === "thermal_fogging");
    expect(encap).toBeUndefined();
    expect(fog).toBeUndefined();
  });

  it("includes encapsulation and thermal fogging for medium smoke", () => {
    const items = determineFireSmokeScopeItems({
      ...baseInput,
      smokeCategory: "medium",
    });
    const encap = items.find(
      (i) => i.itemType === "encapsulation_smoke_surfaces",
    );
    const fog = items.find((i) => i.itemType === "thermal_fogging");
    expect(encap).toBeDefined();
    expect(encap!.clauseRefs).toContain("IICRC S700:2015 §6.4");
    expect(fog).toBeDefined();
    expect(fog!.clauseRefs).toContain("IICRC S700:2015 §7.2");
  });

  it("includes encapsulation and thermal fogging for heavy smoke", () => {
    const items = determineFireSmokeScopeItems({
      ...baseInput,
      smokeCategory: "heavy",
    });
    const encap = items.find(
      (i) => i.itemType === "encapsulation_smoke_surfaces",
    );
    const fog = items.find((i) => i.itemType === "thermal_fogging");
    expect(encap).toBeDefined();
    expect(fog).toBeDefined();
  });

  it("uses dry ice blasting description for heavy smoke soot removal", () => {
    const items = determineFireSmokeScopeItems({
      ...baseInput,
      smokeCategory: "heavy",
    });
    const item = items.find((i) => i.itemType === "soot_removal");
    expect(item!.description).toMatch(/dry ice/i);
  });

  it("uses chemical sponge description for light smoke soot removal", () => {
    const items = determineFireSmokeScopeItems(baseInput);
    const item = items.find((i) => i.itemType === "soot_removal");
    expect(item!.description).toMatch(/chemical sponge/i);
  });

  // ── Water present gate ──────────────────────────────────────────────────────

  it("omits structural drying when waterPresent is false", () => {
    const items = determineFireSmokeScopeItems(baseInput);
    const item = items.find(
      (i) => i.itemType === "structural_drying_fire_suppression",
    );
    expect(item).toBeUndefined();
  });

  it("includes structural drying with S500:2025 §7.1 when waterPresent is true", () => {
    const items = determineFireSmokeScopeItems({
      ...baseInput,
      waterPresent: true,
    });
    const item = items.find(
      (i) => i.itemType === "structural_drying_fire_suppression",
    );
    expect(item).toBeDefined();
    expect(item!.clauseRefs).toContain("IICRC S500:2025 §7.1");
    expect(item!.isRequired).toBe(true);
  });

  // ── Contents gate ───────────────────────────────────────────────────────────

  it("omits contents items when contentsAffected is false", () => {
    const items = determineFireSmokeScopeItems(baseInput);
    expect(
      items.find((i) => i.itemType === "gross_debris_removal"),
    ).toBeUndefined();
    expect(
      items.find((i) => i.itemType === "contents_pack_out"),
    ).toBeUndefined();
    expect(
      items.find((i) => i.itemType === "ozone_chamber_treatment"),
    ).toBeUndefined();
  });

  it("includes all three contents items with correct S700/S760 references when contentsAffected is true", () => {
    const items = determineFireSmokeScopeItems({
      ...baseInput,
      contentsAffected: true,
    });
    const debris = items.find((i) => i.itemType === "gross_debris_removal");
    const packOut = items.find((i) => i.itemType === "contents_pack_out");
    const ozone = items.find((i) => i.itemType === "ozone_chamber_treatment");

    expect(debris).toBeDefined();
    expect(debris!.clauseRefs).toContain("IICRC S700:2015 §5.2");

    expect(packOut).toBeDefined();
    expect(packOut!.clauseRefs).toContain("IICRC S760:2015 §4.1");

    expect(ozone).toBeDefined();
    expect(ozone!.clauseRefs).toContain("IICRC S700:2015 §8.1");
  });

  // ── Quantities scale with affectedArea ──────────────────────────────────────

  it("scales area-based quantities to affectedArea input", () => {
    const items = determineFireSmokeScopeItems({
      ...baseInput,
      affectedArea: 250,
    });
    const hepa = items.find((i) => i.itemType === "hepa_vacuum_surfaces");
    expect(hepa!.quantity).toBe(250);
  });

  // ── suggestedRate populated ─────────────────────────────────────────────────

  it("populates suggestedRate on HEPA vacuum item", () => {
    const items = determineFireSmokeScopeItems(baseInput);
    const item = items.find((i) => i.itemType === "hepa_vacuum_surfaces");
    expect(typeof item!.suggestedRate).toBe("number");
    expect(item!.suggestedRate).toBeGreaterThan(0);
  });

  // ── Full fire/smoke job — all flags set ─────────────────────────────────────

  it("full heavy fire job generates all expected scope items", () => {
    const items = determineFireSmokeScopeItems({
      affectedArea: 300,
      smokeCategory: "heavy",
      waterPresent: true,
      contentsAffected: true,
    });

    const itemTypes = items.map((i) => i.itemType);
    expect(itemTypes).toContain("hepa_vacuum_surfaces");
    expect(itemTypes).toContain("soot_removal");
    expect(itemTypes).toContain("smoke_odour_treatment");
    expect(itemTypes).toContain("afd_deployment");
    expect(itemTypes).toContain("clearance_air_quality_test");
    expect(itemTypes).toContain("encapsulation_smoke_surfaces");
    expect(itemTypes).toContain("thermal_fogging");
    expect(itemTypes).toContain("structural_drying_fire_suppression");
    expect(itemTypes).toContain("gross_debris_removal");
    expect(itemTypes).toContain("contents_pack_out");
    expect(itemTypes).toContain("ozone_chamber_treatment");
  });
});

// ─── calculateFireEquipment ───────────────────────────────────────────────────

describe("calculateFireEquipment", () => {
  it("returns all four equipment types", () => {
    const result = calculateFireEquipment({ affectedAreaM2: 100 });
    const types = result.equipmentList.map((e) => e.type);
    expect(types).toContain("ozone_generator");
    expect(types).toContain("hydroxyl_unit");
    expect(types).toContain("hepa_vacuum");
    expect(types).toContain("afd_unit");
  });

  it("calculates ozone generator at 1 per 200m² (rounds up)", () => {
    // 100m² ÷ 200m² = 0.5 → ceil = 1
    const result = calculateFireEquipment({ affectedAreaM2: 100 });
    const item = result.equipmentList.find((e) => e.type === "ozone_generator");
    expect(item!.quantity).toBe(1);
    expect(item!.iicrcReference).toBe("IICRC S700:2015 §6.3");
  });

  it("calculates hydroxyl unit at 1 per 150m² (rounds up)", () => {
    // 300m² ÷ 150m² = 2
    const result = calculateFireEquipment({ affectedAreaM2: 300 });
    const item = result.equipmentList.find((e) => e.type === "hydroxyl_unit");
    expect(item!.quantity).toBe(2);
    expect(item!.iicrcReference).toBe("IICRC S700:2015 §6.3");
  });

  it("calculates HEPA vacuum at 1 per 100m² (rounds up)", () => {
    // 250m² ÷ 100m² = 2.5 → ceil = 3
    const result = calculateFireEquipment({ affectedAreaM2: 250 });
    const item = result.equipmentList.find((e) => e.type === "hepa_vacuum");
    expect(item!.quantity).toBe(3);
    expect(item!.iicrcReference).toBe("IICRC S700:2015 §6.2");
  });

  it("calculates AFD at 1 per 150m² (rounds up)", () => {
    // 151m² ÷ 150m² = 1.007 → ceil = 2
    const result = calculateFireEquipment({ affectedAreaM2: 151 });
    const item = result.equipmentList.find((e) => e.type === "afd_unit");
    expect(item!.quantity).toBe(2);
    expect(item!.iicrcReference).toBe("IICRC S700:2015 §9.1");
  });

  it("includes area and equipment count in summary string", () => {
    const result = calculateFireEquipment({ affectedAreaM2: 100 });
    expect(result.summary).toMatch(/100/);
    expect(result.summary).toMatch(/S700/);
  });

  it("rounds up fractional quantities (never zero equipment on any area)", () => {
    const result = calculateFireEquipment({ affectedAreaM2: 1 });
    result.equipmentList.forEach((item) => {
      expect(item.quantity).toBeGreaterThanOrEqual(1);
    });
  });
});
