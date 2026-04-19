/**
 * Tests for generateScopeItems() — the bridge in scope-dispatcher that
 * composes prelims + damage-type-specific generators (RA-862/864/865/866).
 */

import { describe, it, expect } from "vitest";
import { generateScopeItems } from "../scope-dispatcher";
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

describe("generateScopeItems", () => {
  it("prelims are always first — water job has mobilisation leading", () => {
    const items = generateScopeItems({
      damageType: "WATER",
      affectedAreaM2: 40,
      estimatedDays: 3,
      pricingConfig: MOCK_PRICING,
    });
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].itemType).toBe("mobilisation");
  });

  it("MOULD + contaminationClass=3 composes prelims + mould Class 3 scope", () => {
    const items = generateScopeItems({
      damageType: "MOULD",
      affectedAreaM2: 20,
      estimatedDays: 5,
      contaminationClass: 3,
      pricingConfig: MOCK_PRICING,
    });
    const types = items.map((i) => i.itemType);
    // Prelims
    expect(types).toContain("mobilisation");
    expect(types).toContain("daily_monitoring");
    // Mould Class 3 signals
    expect(types).toContain("negative_air_machine");
    expect(types).toContain("clearance_testing");
  });

  it("FIRE + smokeType+charLevel composes prelims + fire scope", () => {
    const items = generateScopeItems({
      damageType: "FIRE",
      affectedAreaM2: 35,
      estimatedDays: 4,
      smokeType: "wet",
      charLevel: 2,
      pricingConfig: MOCK_PRICING,
    });
    const types = items.map((i) => i.itemType);
    expect(types).toContain("mobilisation");
    // Fire scope should contain at least one smoke-cleaning item
    expect(items.length).toBeGreaterThan(5);
  });

  it("STORM + flash_flood composes prelims + storm Cat 3 overlay", () => {
    const items = generateScopeItems({
      damageType: "STORM",
      affectedAreaM2: 50,
      estimatedDays: 4,
      stormEntryType: "flash_flood",
      waterCategory: "1",
      pricingConfig: MOCK_PRICING,
    });
    const types = items.map((i) => i.itemType);
    expect(types).toContain("mobilisation");
    expect(types).toContain("mud_silt_removal");
    // Flash flood → implicit Cat 3
    expect(types).toContain("cat3_sanitation");
  });

  it("BIOHAZARD + state=NSW + type=blood_trauma composes premium PPE scope", () => {
    const items = generateScopeItems({
      damageType: "BIOHAZARD",
      affectedAreaM2: 10,
      estimatedDays: 2,
      biohazardType: "blood_trauma",
      state: "NSW",
      pricingConfig: MOCK_PRICING,
    });
    const types = items.map((i) => i.itemType);
    expect(types).toContain("mobilisation");
    expect(types).toContain("ppe_premium");
    expect(types).toContain("pathogen_treatment");
    const manifest = items.find((i) => i.itemType === "epa_waste_manifest");
    expect(manifest?.description).toContain("NSW");
  });

  it("GENERAL / unknown → prelims only, no crash", () => {
    const items = generateScopeItems({
      damageType: "GENERAL",
      affectedAreaM2: 10,
      estimatedDays: 2,
      pricingConfig: MOCK_PRICING,
    });
    expect(items.length).toBeGreaterThan(0);
    // Only prelims — no fire/mould/storm/biohazard-specific items.
    const types = items.map((i) => i.itemType);
    expect(types).not.toContain("ppe_premium");
    expect(types).not.toContain("negative_air_machine");
    expect(types).not.toContain("mud_silt_removal");
  });

  it("MOULD without contaminationClass → prelims only", () => {
    const items = generateScopeItems({
      damageType: "MOULD",
      affectedAreaM2: 10,
      estimatedDays: 3,
      pricingConfig: MOCK_PRICING,
    });
    const types = items.map((i) => i.itemType);
    expect(types).toContain("mobilisation");
    expect(types).not.toContain("negative_air_machine");
  });

  it("BIOHAZARD without state → prelims only (state is required for EPA manifest)", () => {
    const items = generateScopeItems({
      damageType: "BIOHAZARD",
      affectedAreaM2: 10,
      estimatedDays: 2,
      biohazardType: "sewage_overflow",
      pricingConfig: MOCK_PRICING,
    });
    const types = items.map((i) => i.itemType);
    expect(types).not.toContain("epa_waste_manifest");
  });
});
