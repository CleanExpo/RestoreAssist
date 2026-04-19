/**
 * RA-862 — unit tests for lib/scope-prelims.ts
 *
 * Acceptance criteria verified:
 *   - Water job, 3 days → at least 5 items (mobilisation, monitoring,
 *     waste, PPE, equipment transport; PM absorbed at ≤ 2 days, so
 *     3 days adds PM too → 6).
 *   - Fire job → contaminated waste disposal, not standard.
 *   - Zero days → still has mobilisation (and PPE/transport); no
 *     monitoring line.
 *   - Each item carries iicrcReference, unitCostAud, quantity.
 */

import { describe, it, expect } from "vitest";
import { generatePrelims, type PrelimsDamageType } from "../scope-prelims";
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
  damageType: PrelimsDamageType,
  affectedAreaM2: number,
  estimatedDays: number,
) {
  return generatePrelims({
    damageType,
    affectedAreaM2,
    estimatedDays,
    pricingConfig: MOCK_PRICING,
  });
}

describe("generatePrelims", () => {
  it("water job, 3 days, 40 m² → at least 5 prelim items", () => {
    const items = run("water_damage", 40, 3);
    expect(items.length).toBeGreaterThanOrEqual(5);
  });

  it("every item has iicrcReference field (possibly empty), unitCostAud, and quantity", () => {
    const items = run("water_damage", 40, 3);
    for (const item of items) {
      expect(typeof item.iicrcReference).toBe("string");
      expect(typeof item.unitCostAud).toBe("number");
      expect((item.unitCostAud ?? 0) > 0).toBe(true);
      expect(typeof item.quantity).toBe("number");
      expect((item.quantity ?? 0) >= 0).toBe(true);
      expect(item.isRequired).toBe(true);
    }
  });

  it("water job includes standard waste disposal, NOT contaminated", () => {
    const items = run("water_damage", 40, 3);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("waste_disposal_standard");
    expect(types).not.toContain("waste_disposal_contaminated");
  });

  it("fire job uses CONTAMINATED waste disposal", () => {
    const items = run("fire_smoke", 40, 3);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("waste_disposal_contaminated");
    expect(types).not.toContain("waste_disposal_standard");
  });

  it("mould job uses CONTAMINATED waste disposal", () => {
    const items = run("mould", 40, 3);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("waste_disposal_contaminated");
  });

  it("biohazard job uses CONTAMINATED waste disposal", () => {
    const items = run("biohazard", 40, 3);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("waste_disposal_contaminated");
  });

  it("storm job uses standard waste disposal (heavier volume)", () => {
    const items = run("storm", 40, 3);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("waste_disposal_standard");
    expect(types).not.toContain("waste_disposal_contaminated");
  });

  it("zero days → still has mobilisation, PPE, equipment transport", () => {
    const items = run("water_damage", 40, 0);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("mobilisation");
    expect(types).toContain("safety_ppe");
    expect(types).toContain("equipment_transport");
  });

  it("zero days → NO daily monitoring line", () => {
    const items = run("water_damage", 40, 0);
    const types = items.map((i) => i.itemType);
    expect(types).not.toContain("daily_monitoring");
  });

  it("≤ 2 days → NO standalone project management line (absorbed in mobilisation)", () => {
    const items = run("water_damage", 40, 2);
    const types = items.map((i) => i.itemType);
    expect(types).not.toContain("project_management");
  });

  it("3-5 days → project management line with 2 hours", () => {
    const items = run("water_damage", 40, 3);
    const pm = items.find((i) => i.itemType === "project_management");
    expect(pm).toBeDefined();
    expect(pm?.quantity).toBe(2);
  });

  it("6-10 days → project management line with 4 hours", () => {
    const items = run("water_damage", 40, 7);
    const pm = items.find((i) => i.itemType === "project_management");
    expect(pm?.quantity).toBe(4);
  });

  it("> 10 days → project management capped at 6 hours", () => {
    const items = run("water_damage", 40, 30);
    const pm = items.find((i) => i.itemType === "project_management");
    expect(pm?.quantity).toBe(6);
  });

  it("zero affected area → no waste disposal line, other prelims still present", () => {
    const items = run("water_damage", 0, 3);
    const types = items.map((i) => i.itemType);
    expect(types).not.toContain("waste_disposal_standard");
    expect(types).toContain("mobilisation");
    expect(types).toContain("daily_monitoring");
    expect(types).toContain("safety_ppe");
  });

  it("monitoring quantity equals estimatedDays", () => {
    const items = run("water_damage", 40, 5);
    const monitoring = items.find((i) => i.itemType === "daily_monitoring");
    expect(monitoring?.quantity).toBe(5);
  });

  it("waste volume rounds up in 0.5 m³ bands — water damage 40 m² = 6 m³", () => {
    // 40 * 0.15 = 6.0, already whole — should be 6.
    const items = run("water_damage", 40, 3);
    const waste = items.find((i) => i.itemType === "waste_disposal_standard");
    expect(waste?.quantity).toBe(6);
  });

  it("waste volume for fire job uses heavier demo coefficient", () => {
    // 40 * 0.25 = 10.0 → 10 m³.
    const items = run("fire_smoke", 40, 3);
    const waste = items.find(
      (i) => i.itemType === "waste_disposal_contaminated",
    );
    expect(waste?.quantity).toBe(10);
  });
});
