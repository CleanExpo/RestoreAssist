/**
 * RA-866 — unit tests for lib/scope-biohazard.ts
 *
 * Acceptance criteria:
 *   - Each biohazard type produces minimum 5 scope items
 *   - All items include compliance references
 *   - State-specific disposal is surfaced on the EPA manifest line
 *   - Premium PPE rate applied for decomposition + blood_trauma
 */

import { describe, it, expect } from "vitest";
import {
  generateBiohazardScope,
  type BiohazardType,
  type AustralianState,
} from "../scope-biohazard";
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
  biohazardType: BiohazardType,
  affectedAreaM2 = 15,
  state: AustralianState = "NSW",
) {
  return generateBiohazardScope({
    biohazardType,
    affectedAreaM2,
    state,
    pricingConfig: MOCK_PRICING,
  });
}

describe("generateBiohazardScope", () => {
  // ── Minimum item counts ────────────────────────────────────────────────
  it.each<BiohazardType>([
    "sewage_overflow",
    "decomposition",
    "chemical_spill",
    "blood_trauma",
  ])("%s generates at least 5 scope items", (biohazardType) => {
    const items = run(biohazardType);
    expect(items.length).toBeGreaterThanOrEqual(5);
  });

  // ── Every item has a compliance reference ──────────────────────────────
  it.each<BiohazardType>([
    "sewage_overflow",
    "decomposition",
    "chemical_spill",
    "blood_trauma",
  ])("%s — every item carries a compliance reference", (biohazardType) => {
    const items = run(biohazardType);
    for (const item of items) {
      expect(typeof item.iicrcReference).toBe("string");
      expect(item.iicrcReference.length).toBeGreaterThan(0);
      expect(item.isRequired).toBe(true);
    }
  });

  // ── PPE tier by type ───────────────────────────────────────────────────
  it("sewage_overflow → standard PPE ($95)", () => {
    const items = run("sewage_overflow");
    const ppe = items.find((i) => i.itemType.startsWith("ppe"));
    expect(ppe?.itemType).toBe("ppe_standard");
    expect(ppe?.unitCostAud).toBe(95);
  });

  it("chemical_spill → standard PPE ($95)", () => {
    const items = run("chemical_spill");
    const ppe = items.find((i) => i.itemType.startsWith("ppe"));
    expect(ppe?.itemType).toBe("ppe_standard");
    expect(ppe?.unitCostAud).toBe(95);
  });

  it("decomposition → premium PPE ($280)", () => {
    const items = run("decomposition");
    const ppe = items.find((i) => i.itemType === "ppe_premium");
    expect(ppe).toBeDefined();
    expect(ppe?.unitCostAud).toBe(280);
  });

  it("blood_trauma → premium PPE ($280)", () => {
    const items = run("blood_trauma");
    const ppe = items.find((i) => i.itemType === "ppe_premium");
    expect(ppe).toBeDefined();
    expect(ppe?.unitCostAud).toBe(280);
  });

  // ── State-specific EPA manifest ────────────────────────────────────────
  it.each<AustralianState>([
    "NSW",
    "VIC",
    "QLD",
    "WA",
    "SA",
    "TAS",
    "ACT",
    "NT",
  ])("%s — EPA waste manifest references the state", (state) => {
    const items = run("sewage_overflow", 15, state);
    const manifest = items.find((i) => i.itemType === "epa_waste_manifest");
    expect(manifest).toBeDefined();
    expect(manifest?.description).toContain(state);
    // Reference should include a recognisable regulator name per state.
    expect(manifest?.iicrcReference.length).toBeGreaterThan(10);
  });

  // ── Type-specific required items ───────────────────────────────────────
  it("sewage_overflow — two antimicrobial passes + HEPA scrubber", () => {
    const items = run("sewage_overflow");
    const types = items.map((i) => i.itemType);
    expect(types).toContain("antimicrobial_pass_1");
    expect(types).toContain("antimicrobial_pass_2");
    expect(types).toContain("hepa_air_scrubber");
    expect(types).toContain("cat3_sanitation");
  });

  it("decomposition — enzyme + odour bomb + porous removal + bulk PPE", () => {
    const items = run("decomposition");
    const types = items.map((i) => i.itemType);
    expect(types).toContain("enzyme_treatment");
    expect(types).toContain("odour_bomb");
    expect(types).toContain("porous_removal");
    expect(types).toContain("ppe_consumables_bulk");
  });

  it("chemical_spill — identification + neutralisation + specialist disposal + air quality test", () => {
    const items = run("chemical_spill");
    const types = items.map((i) => i.itemType);
    expect(types).toContain("chemical_identification");
    expect(types).toContain("neutralisation_agent");
    expect(types).toContain("specialist_disposal");
    expect(types).toContain("air_quality_clearance");
  });

  it("blood_trauma — pathogen + sharps + licensed disposal + scene decon", () => {
    const items = run("blood_trauma");
    const types = items.map((i) => i.itemType);
    expect(types).toContain("pathogen_treatment");
    expect(types).toContain("sharps_disposal");
    expect(types).toContain("licensed_disposal");
    expect(types).toContain("scene_decontamination");
  });

  // ── Clearance testing matrix ───────────────────────────────────────────
  it("sewage + decomposition + blood_trauma → clearance testing present", () => {
    for (const t of [
      "sewage_overflow",
      "decomposition",
      "blood_trauma",
    ] as const) {
      const items = run(t);
      const types = items.map((i) => i.itemType);
      expect(types).toContain("clearance_testing");
    }
  });

  it("chemical_spill → air_quality_clearance instead of generic clearance", () => {
    const items = run("chemical_spill");
    const types = items.map((i) => i.itemType);
    expect(types).toContain("air_quality_clearance");
    expect(types).not.toContain("clearance_testing");
  });

  // ── Shared items across every type ─────────────────────────────────────
  it("every type includes HEPA vacuum + Safe Work compliance + EPA manifest", () => {
    for (const t of [
      "sewage_overflow",
      "decomposition",
      "chemical_spill",
      "blood_trauma",
    ] as const) {
      const items = run(t);
      const types = items.map((i) => i.itemType);
      expect(types).toContain("hepa_vacuum");
      expect(types).toContain("biohazard_handling_compliance");
      expect(types).toContain("epa_waste_manifest");
    }
  });

  // ── Area scaling ───────────────────────────────────────────────────────
  it("HEPA vacuum quantity scales with affectedAreaM2", () => {
    const items = run("sewage_overflow", 25);
    const vacuum = items.find((i) => i.itemType === "hepa_vacuum");
    expect(vacuum?.quantity).toBe(25);
  });

  it("zero area — still returns PPE + compliance + EPA manifest", () => {
    const items = run("sewage_overflow", 0);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("ppe_standard");
    expect(types).toContain("biohazard_handling_compliance");
    expect(types).toContain("epa_waste_manifest");
  });
});
