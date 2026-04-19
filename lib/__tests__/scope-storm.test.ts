/**
 * RA-865 — unit tests for lib/scope-storm.ts
 *
 * Acceptance criteria verified:
 *   - Category 3 water always adds sanitation line items
 *   - Flash flood adds mud/silt removal AND implicit Cat 3 overlay
 *   - Base items always present regardless of entry type
 *   - pnpm type-check passes (covered by the TS compile in CI)
 */

import { describe, it, expect } from "vitest";
import {
  generateStormScope,
  type StormEntryType,
  type StormWaterCategory,
} from "../scope-storm";
import { type CompanyPricingRates } from "../nir-cost-estimation";

const MOCK_PRICING: CompanyPricingRates = {
  masterQualifiedNormalHours: 95,
  qualifiedTechnicianNormalHours: 75,
  labourerNormalHours: 55,
  airMoverAxialDailyRate: 45,
  airMoverCentrifugalDailyRate: 55,
  dehumidifierLGRDailyRate: 95,
  dehumidifierDesiccantDailyRate: 140,
  afdUnitLargeDailyRate: 120,
  extractionTruckMountedHourlyRate: 180,
  extractionElectricHourlyRate: 85,
  injectionDryingSystemDailyRate: 110,
  antimicrobialTreatmentRate: 8.5,
  mouldRemediationTreatmentRate: 12,
  biohazardTreatmentRate: 18,
  administrationFee: 150,
  callOutFee: 95,
  thermalCameraUseCostPerAssessment: 75,
};

function run(
  entryType: StormEntryType,
  waterCategory: StormWaterCategory,
  affectedAreaM2: number,
  estimatedDays: number,
) {
  return generateStormScope({
    entryType,
    waterCategory,
    affectedAreaM2,
    estimatedDays,
    pricingConfig: MOCK_PRICING,
  });
}

const BASE_TYPES = [
  "water_extraction",
  "structural_drying",
  "moisture_mapping",
  "debris_removal",
];

describe("generateStormScope", () => {
  it.each<StormEntryType>([
    "roof_penetration",
    "stormwater_ingress",
    "wind_driven_rain",
    "flash_flood",
  ])("base items always present for entryType=%s", (entryType) => {
    const items = run(entryType, 1, 30, 3);
    const types = items.map((i) => i.itemType);
    for (const base of BASE_TYPES) {
      expect(types).toContain(base);
    }
  });

  // ── Category 3 overlay ──────────────────────────────────────────────────
  it("declared Cat 3 → sanitation + antimicrobial + documentation", () => {
    const items = run("wind_driven_rain", 3, 30, 3);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("cat3_sanitation");
    expect(types).toContain("cat3_antimicrobial");
    expect(types).toContain("cat3_category_documentation");
  });

  it("Cat 1 + roof_penetration → NO Cat 3 items", () => {
    const items = run("roof_penetration", 1, 30, 3);
    const types = items.map((i) => i.itemType);
    expect(types).not.toContain("cat3_sanitation");
    expect(types).not.toContain("cat3_antimicrobial");
  });

  // ── Flash flood → implicit Cat 3 + mud/silt ────────────────────────────
  it("flash flood → mud/silt removal AND implicit Cat 3 overlay", () => {
    const items = run("flash_flood", 1, 50, 4); // declared Cat 1
    const types = items.map((i) => i.itemType);
    expect(types).toContain("mud_silt_removal");
    // Flash flood elevates to Cat 3 regardless of declared category.
    expect(types).toContain("cat3_sanitation");
    expect(types).toContain("cat3_antimicrobial");
  });

  it("stormwater ingress → implicit Cat 3 even when declared Cat 1", () => {
    const items = run("stormwater_ingress", 1, 30, 3);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("cat3_sanitation");
  });

  // ── Entry-type-specific overlays ───────────────────────────────────────
  it("roof_penetration → temporary weatherproof + structural inspection", () => {
    const items = run("roof_penetration", 1, 30, 3);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("temporary_weatherproof");
    expect(types).toContain("structural_inspection");
  });

  it("wind_driven_rain → cavity dry-out scaled by estimatedDays", () => {
    const items = run("wind_driven_rain", 1, 30, 5);
    const cavity = items.find((i) => i.itemType === "cavity_drying");
    expect(cavity).toBeDefined();
    expect(cavity?.quantity).toBe(5);
    expect(cavity?.unit).toBe("day");
  });

  it("flash_flood → mud/silt quantity scales with affectedAreaM2", () => {
    const items = run("flash_flood", 3, 45, 3);
    const mud = items.find((i) => i.itemType === "mud_silt_removal");
    expect(mud?.quantity).toBe(45);
    expect(mud?.unit).toBe("m²");
  });

  // ── Every item has required metadata ───────────────────────────────────
  it("every item has IICRC reference, unit, isRequired=true", () => {
    const items = run("flash_flood", 3, 40, 4);
    for (const item of items) {
      expect(typeof item.iicrcReference).toBe("string");
      expect(item.iicrcReference.length).toBeGreaterThan(0);
      expect(typeof item.unit).toBe("string");
      expect(item.isRequired).toBe(true);
    }
  });

  // ── Edge cases ─────────────────────────────────────────────────────────
  it("zero affected area — base items still present, with qty 0 on area-scaled ones", () => {
    const items = run("roof_penetration", 1, 0, 3);
    const types = items.map((i) => i.itemType);
    for (const base of BASE_TYPES) {
      expect(types).toContain(base);
    }
    const extraction = items.find((i) => i.itemType === "water_extraction");
    expect(extraction?.quantity).toBe(0);
  });

  it("zero estimated days — drying line has quantity 0, not omitted", () => {
    const items = run("roof_penetration", 1, 30, 0);
    const drying = items.find((i) => i.itemType === "structural_drying");
    expect(drying).toBeDefined();
    expect(drying?.quantity).toBe(0);
  });

  it("Cat 2 grey water + wind_driven_rain → no Cat 3 overlay", () => {
    const items = run("wind_driven_rain", 2, 30, 3);
    const types = items.map((i) => i.itemType);
    expect(types).not.toContain("cat3_sanitation");
  });

  it("Cat 3 sanitation quantity matches affectedAreaM2", () => {
    const items = run("flash_flood", 3, 60, 3);
    const sanitation = items.find((i) => i.itemType === "cat3_sanitation");
    expect(sanitation?.quantity).toBe(60);
    expect(sanitation?.unit).toBe("m²");
  });
});
