/**
 * Unit tests for lib/scope-fire.ts
 *
 * Verifies deterministic scope generation for fire/smoke damage jobs
 * following IICRC S700:2015.
 */

import { describe, it, expect } from "vitest";
import { generateFireScope, type SmokeType } from "../scope-fire";
import { type CompanyPricingRates } from "../nir-cost-estimation";

// ─── TEST FIXTURES ────────────────────────────────────────────────────────────

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

// ─── HELPER ───────────────────────────────────────────────────────────────────

function itemTypes(smokeType: SmokeType, charLevel: 1 | 2 | 3 | 4) {
  return generateFireScope({
    smokeType,
    charLevel,
    affectedAreaM2: 40,
    pricingConfig: MOCK_PRICING,
  }).map((i) => i.itemType);
}

// ─── SMOKE TYPE ITEM SETS ─────────────────────────────────────────────────────

describe("generateFireScope — wet smoke", () => {
  it("produces degreaser_clean, hepa_vacuum, ozone_treatment", () => {
    const types = itemTypes("wet", 1);
    expect(types).toEqual(["degreaser_clean", "hepa_vacuum", "ozone_treatment"]);
  });

  it("includes no structural items at charLevel 1", () => {
    const types = itemTypes("wet", 1);
    expect(types).not.toContain("structural_assessment");
    expect(types).not.toContain("debris_removal");
  });
});

describe("generateFireScope — dry smoke", () => {
  it("produces dry_sponge_wipe, hepa_vacuum, hydroxyl_treatment", () => {
    const types = itemTypes("dry", 1);
    expect(types).toEqual([
      "dry_sponge_wipe",
      "hepa_vacuum",
      "hydroxyl_treatment",
    ]);
  });
});

describe("generateFireScope — protein smoke", () => {
  it("produces enzyme_treatment_1, enzyme_treatment_2, ozone_treatment, deodorisation", () => {
    const types = itemTypes("protein", 1);
    expect(types).toEqual([
      "enzyme_treatment_1",
      "enzyme_treatment_2",
      "ozone_treatment",
      "deodorisation",
    ]);
  });
});

describe("generateFireScope — fuel oil smoke", () => {
  it("produces chemical_sponge_clean, solvent_clean, ozone_treatment", () => {
    const types = itemTypes("fuel_oil", 1);
    expect(types).toEqual([
      "chemical_sponge_clean",
      "solvent_clean",
      "ozone_treatment",
    ]);
  });
});

// ─── CHARRING LEVEL ───────────────────────────────────────────────────────────

describe("generateFireScope — charring level", () => {
  it("does NOT add structural items for charLevel 1", () => {
    const types = itemTypes("dry", 1);
    expect(types).not.toContain("structural_assessment");
    expect(types).not.toContain("debris_removal");
  });

  it("does NOT add structural items for charLevel 2", () => {
    const types = itemTypes("dry", 2);
    expect(types).not.toContain("structural_assessment");
    expect(types).not.toContain("debris_removal");
  });

  it("adds structural_assessment and debris_removal for charLevel 3", () => {
    const types = itemTypes("dry", 3);
    expect(types).toContain("structural_assessment");
    expect(types).toContain("debris_removal");
  });

  it("adds structural_assessment and debris_removal for charLevel 4", () => {
    const types = itemTypes("wet", 4);
    expect(types).toContain("structural_assessment");
    expect(types).toContain("debris_removal");
  });

  it("appends structural items after smoke-type items", () => {
    const types = itemTypes("wet", 3);
    const structIdx = types.indexOf("structural_assessment");
    const lastSmokeIdx = types.indexOf("ozone_treatment");
    expect(structIdx).toBeGreaterThan(lastSmokeIdx);
  });
});

// ─── IICRC REFERENCES ────────────────────────────────────────────────────────

describe("generateFireScope — iicrcReference on every item", () => {
  const smokeTypes: SmokeType[] = ["wet", "dry", "protein", "fuel_oil"];

  smokeTypes.forEach((smokeType) => {
    it(`all items for ${smokeType} smoke have a non-empty iicrcReference`, () => {
      const items = generateFireScope({
        smokeType,
        charLevel: 3,
        affectedAreaM2: 20,
        pricingConfig: MOCK_PRICING,
      });
      items.forEach((item) => {
        expect(item.iicrcReference).toBeTruthy();
        expect(item.iicrcReference).toMatch(/^S700:2015 §\d+\.\d+$/);
      });
    });
  });
});

// ─── QUANTITY SCALING ────────────────────────────────────────────────────────

describe("generateFireScope — quantity scaling", () => {
  it("sets quantity to affectedAreaM2 on area-based items", () => {
    const items = generateFireScope({
      smokeType: "wet",
      charLevel: 1,
      affectedAreaM2: 75,
      pricingConfig: MOCK_PRICING,
    });
    const areaItems = items.filter((i) => i.unit === "m²");
    areaItems.forEach((item) => {
      expect(item.quantity).toBe(75);
    });
  });

  it("structural_assessment has no quantity (fixed scope)", () => {
    const items = generateFireScope({
      smokeType: "dry",
      charLevel: 3,
      affectedAreaM2: 50,
      pricingConfig: MOCK_PRICING,
    });
    const assessment = items.find((i) => i.itemType === "structural_assessment");
    expect(assessment).toBeDefined();
    expect(assessment?.quantity).toBeUndefined();
  });
});

// ─── PRICING CONFIG WIRING ────────────────────────────────────────────────────

describe("generateFireScope — pricingConfig wiring", () => {
  it("degreaser_clean unitCostAud reflects antimicrobialTreatmentRate", () => {
    const items = generateFireScope({
      smokeType: "wet",
      charLevel: 1,
      affectedAreaM2: 10,
      pricingConfig: MOCK_PRICING,
    });
    const item = items.find((i) => i.itemType === "degreaser_clean");
    expect(item?.unitCostAud).toBe(MOCK_PRICING.antimicrobialTreatmentRate);
  });

  it("enzyme_treatment_1 unitCostAud reflects mouldRemediationTreatmentRate", () => {
    const items = generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 10,
      pricingConfig: MOCK_PRICING,
    });
    const item = items.find((i) => i.itemType === "enzyme_treatment_1");
    expect(item?.unitCostAud).toBe(MOCK_PRICING.mouldRemediationTreatmentRate);
  });
});
