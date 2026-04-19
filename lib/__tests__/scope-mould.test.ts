/**
 * RA-864 — unit tests for lib/scope-mould.ts
 *
 * Acceptance criteria verified:
 *   - Class 3 generates ≥ 6 scope items
 *   - Class 4 adds HVAC inspection item (NADCA reference)
 *   - Clearance testing item always present for Class ≥ 2
 *   - Tests for all 4 classes
 */

import { describe, it, expect } from "vitest";
import { generateMouldScope, type ContaminationClass } from "../scope-mould";
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
  contaminationClass: ContaminationClass,
  affectedAreaM2: number,
  estimatedDays: number,
  hvacInvolved = false,
) {
  return generateMouldScope({
    contaminationClass,
    affectedAreaM2,
    estimatedDays,
    hvacInvolved,
    pricingConfig: MOCK_PRICING,
  });
}

describe("generateMouldScope", () => {
  // ── Class 1 ─────────────────────────────────────────────────────────────
  it("Class 1 — HEPA vacuum + antimicrobial only", () => {
    const items = run(1, 0.5, 1);
    const types = items.map((i) => i.itemType);
    expect(types).toEqual(["hepa_vacuum", "antimicrobial_wipe"]);
  });

  it("Class 1 — NO containment, NO air scrubber, NO clearance", () => {
    const items = run(1, 0.5, 1);
    const types = items.map((i) => i.itemType);
    expect(types).not.toContain("containment_setup");
    expect(types).not.toContain("hepa_air_scrubber");
    expect(types).not.toContain("clearance_testing");
  });

  // ── Class 2 ─────────────────────────────────────────────────────────────
  it("Class 2 — adds containment, air scrubber, clearance", () => {
    const items = run(2, 5, 3);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("containment_setup");
    expect(types).toContain("hepa_air_scrubber");
    expect(types).toContain("clearance_testing");
  });

  it("Class 2 — critical barrier containment (not negative pressure)", () => {
    const items = run(2, 5, 3);
    const containment = items.find((i) => i.itemType === "containment_setup");
    expect(containment?.description).toMatch(/Critical barrier/i);
    expect(containment?.description).not.toMatch(/negative-pressure/i);
  });

  it("Class 2 — NO negative air machine, NO worker decon", () => {
    const items = run(2, 5, 3);
    const types = items.map((i) => i.itemType);
    expect(types).not.toContain("negative_air_machine");
    expect(types).not.toContain("worker_decon");
  });

  // ── Class 3 ─────────────────────────────────────────────────────────────
  it("Class 3 — generates at least 6 scope items", () => {
    const items = run(3, 20, 5);
    expect(items.length).toBeGreaterThanOrEqual(6);
  });

  it("Class 3 — full negative-pressure containment", () => {
    const items = run(3, 20, 5);
    const containment = items.find((i) => i.itemType === "containment_setup");
    expect(containment?.description).toMatch(/negative-pressure/i);
  });

  it("Class 3 — has negative air machine + worker decon + clearance", () => {
    const items = run(3, 20, 5);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("negative_air_machine");
    expect(types).toContain("worker_decon");
    expect(types).toContain("clearance_testing");
  });

  it("Class 3 — negative air machine scales with estimatedDays", () => {
    const items = run(3, 20, 7);
    const nam = items.find((i) => i.itemType === "negative_air_machine");
    expect(nam?.quantity).toBe(7);
    expect(nam?.unit).toBe("day");
  });

  // ── Class 4 ─────────────────────────────────────────────────────────────
  it("Class 4 — adds HVAC inspection line with NADCA reference", () => {
    const items = run(4, 10, 5);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("hvac_inspection");
    const hvac = items.find((i) => i.itemType === "hvac_inspection");
    expect(hvac?.iicrcReference).toMatch(/NADCA/);
  });

  it("Class 4 — carries Class 3 scope (negative air, decon, clearance)", () => {
    const items = run(4, 10, 5);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("negative_air_machine");
    expect(types).toContain("worker_decon");
    expect(types).toContain("clearance_testing");
  });

  // ── HVAC involvement can upgrade non-Class-4 jobs ──────────────────────
  it("Class 2 + hvacInvolved=true — adds HVAC inspection", () => {
    const items = run(2, 5, 3, true);
    const types = items.map((i) => i.itemType);
    expect(types).toContain("hvac_inspection");
  });

  it("Class 1 + hvacInvolved=false — NO HVAC inspection", () => {
    const items = run(1, 0.5, 1, false);
    const types = items.map((i) => i.itemType);
    expect(types).not.toContain("hvac_inspection");
  });

  // ── Every item carries required metadata ───────────────────────────────
  it("every item has IICRC reference, unit, isRequired=true", () => {
    const items = run(3, 20, 5);
    for (const item of items) {
      expect(typeof item.iicrcReference).toBe("string");
      expect(item.iicrcReference.length).toBeGreaterThan(0);
      expect(typeof item.unit).toBe("string");
      expect(item.isRequired).toBe(true);
    }
  });

  it("clearance testing is mandatory for Class ≥ 2", () => {
    for (const cls of [2, 3, 4] as const) {
      const items = run(cls, 10, 3);
      const types = items.map((i) => i.itemType);
      expect(types).toContain("clearance_testing");
    }
  });

  it("quantities scale — HEPA vacuum quantity equals affectedAreaM2", () => {
    const items = run(2, 8, 3);
    const vacuum = items.find((i) => i.itemType === "hepa_vacuum");
    expect(vacuum?.quantity).toBe(8);
  });

  it("zero affected area — still returns Class 1 items with qty 0", () => {
    const items = run(1, 0, 1);
    const vacuum = items.find((i) => i.itemType === "hepa_vacuum");
    expect(vacuum?.quantity).toBe(0);
  });
});
