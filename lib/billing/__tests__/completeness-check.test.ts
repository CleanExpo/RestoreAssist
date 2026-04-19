/**
 * Tests for lib/billing/completeness-check.ts — RA-859 Task 3.
 */

import { describe, it, expect } from "vitest";
import {
  checkBillingCompleteness,
  blockingBillingWarnings,
  type CompletenessCheckInput,
} from "../completeness-check";

// A fully-prelim'd water job — should produce zero warnings.
const COMPLETE_WATER_SCOPE: CompletenessCheckInput = {
  damageType: "WATER",
  scopeItems: [
    { itemType: "mobilisation" },
    { itemType: "daily_monitoring" },
    { itemType: "waste_disposal_standard" },
    { itemType: "safety_ppe" },
    { itemType: "equipment_transport" },
  ],
};

describe("checkBillingCompleteness", () => {
  it("complete water scope → zero warnings", () => {
    expect(checkBillingCompleteness(COMPLETE_WATER_SCOPE)).toEqual([]);
  });

  // ── Prelim warnings ─────────────────────────────────────────────────────

  it("missing mobilisation → MISSING_MOBILISATION warning", () => {
    const warnings = checkBillingCompleteness({
      ...COMPLETE_WATER_SCOPE,
      scopeItems: COMPLETE_WATER_SCOPE.scopeItems.filter(
        (i) => i.itemType !== "mobilisation",
      ),
    });
    expect(warnings.map((w) => w.code)).toContain("MISSING_MOBILISATION");
  });

  it("missing waste disposal → MISSING_WASTE_DISPOSAL warning", () => {
    const warnings = checkBillingCompleteness({
      ...COMPLETE_WATER_SCOPE,
      scopeItems: COMPLETE_WATER_SCOPE.scopeItems.filter(
        (i) => !i.itemType.startsWith("waste_disposal"),
      ),
    });
    expect(warnings.map((w) => w.code)).toContain("MISSING_WASTE_DISPOSAL");
  });

  it("missing PPE → MISSING_PPE warning", () => {
    const warnings = checkBillingCompleteness({
      ...COMPLETE_WATER_SCOPE,
      scopeItems: COMPLETE_WATER_SCOPE.scopeItems.filter(
        (i) => !i.itemType.includes("ppe"),
      ),
    });
    expect(warnings.map((w) => w.code)).toContain("MISSING_PPE");
  });

  it("waste disposal variants (licensed_disposal, specialist_disposal) count as present", () => {
    const warnings = checkBillingCompleteness({
      damageType: "BIOHAZARD",
      biohazardType: "blood_trauma",
      scopeItems: [
        { itemType: "mobilisation" },
        { itemType: "ppe_premium" },
        { itemType: "equipment_transport" },
        { itemType: "biohazard_handling_compliance" },
        { itemType: "epa_waste_manifest" },
        { itemType: "licensed_disposal" }, // counts as waste_disposal
        { itemType: "clearance_testing" },
      ],
    });
    expect(warnings.map((w) => w.code)).not.toContain("MISSING_WASTE_DISPOSAL");
  });

  // ── Biohazard-specific ──────────────────────────────────────────────────

  it("BIOHAZARD missing biohazard_handling_compliance → ERROR severity", () => {
    const warnings = checkBillingCompleteness({
      damageType: "BIOHAZARD",
      biohazardType: "sewage_overflow",
      scopeItems: [
        { itemType: "mobilisation" },
        { itemType: "waste_disposal_contaminated" },
        { itemType: "ppe_standard" },
        { itemType: "equipment_transport" },
        { itemType: "epa_waste_manifest" },
        { itemType: "clearance_testing" },
      ],
    });
    const complianceWarning = warnings.find(
      (w) => w.code === "MISSING_BIOHAZARD_COMPLIANCE",
    );
    expect(complianceWarning).toBeDefined();
    expect(complianceWarning?.severity).toBe("error");
  });

  it("BIOHAZARD missing EPA manifest → ERROR severity", () => {
    const warnings = checkBillingCompleteness({
      damageType: "BIOHAZARD",
      biohazardType: "sewage_overflow",
      scopeItems: [
        { itemType: "mobilisation" },
        { itemType: "waste_disposal_contaminated" },
        { itemType: "ppe_standard" },
        { itemType: "equipment_transport" },
        { itemType: "biohazard_handling_compliance" },
        { itemType: "clearance_testing" },
      ],
    });
    const manifestWarning = warnings.find(
      (w) => w.code === "MISSING_EPA_MANIFEST",
    );
    expect(manifestWarning?.severity).toBe("error");
  });

  it("chemical spill does NOT require clearance_testing (has air_quality_clearance)", () => {
    const warnings = checkBillingCompleteness({
      damageType: "BIOHAZARD",
      biohazardType: "chemical_spill",
      scopeItems: [
        { itemType: "mobilisation" },
        { itemType: "waste_disposal_contaminated" },
        { itemType: "ppe_standard" },
        { itemType: "equipment_transport" },
        { itemType: "biohazard_handling_compliance" },
        { itemType: "epa_waste_manifest" },
        // no clearance line at all
      ],
    });
    expect(warnings.map((w) => w.code)).not.toContain(
      "MISSING_CLEARANCE_TESTING",
    );
  });

  // ── Mould ──────────────────────────────────────────────────────────────

  it("MOULD Class 3 without clearance → MISSING_CLEARANCE_TESTING warning", () => {
    const warnings = checkBillingCompleteness({
      damageType: "MOULD",
      mouldContaminationClass: 3,
      scopeItems: [
        { itemType: "mobilisation" },
        { itemType: "daily_monitoring" },
        { itemType: "waste_disposal_standard" },
        { itemType: "safety_ppe" },
        { itemType: "equipment_transport" },
      ],
    });
    expect(warnings.map((w) => w.code)).toContain("MISSING_CLEARANCE_TESTING");
  });

  it("MOULD Class 1 without clearance → NO clearance warning (optional at Class 1)", () => {
    const warnings = checkBillingCompleteness({
      damageType: "MOULD",
      mouldContaminationClass: 1,
      scopeItems: [
        { itemType: "mobilisation" },
        { itemType: "daily_monitoring" },
        { itemType: "waste_disposal_standard" },
        { itemType: "safety_ppe" },
        { itemType: "equipment_transport" },
      ],
    });
    expect(warnings.map((w) => w.code)).not.toContain(
      "MISSING_CLEARANCE_TESTING",
    );
  });

  // ── BIOHAZARD monitoring exception ─────────────────────────────────────

  it("BIOHAZARD trauma job without daily_monitoring → NO monitoring warning (single-visit)", () => {
    const warnings = checkBillingCompleteness({
      damageType: "BIOHAZARD",
      biohazardType: "blood_trauma",
      scopeItems: [
        { itemType: "mobilisation" },
        { itemType: "licensed_disposal" },
        { itemType: "ppe_premium" },
        { itemType: "equipment_transport" },
        { itemType: "biohazard_handling_compliance" },
        { itemType: "epa_waste_manifest" },
        { itemType: "clearance_testing" },
      ],
    });
    expect(warnings.map((w) => w.code)).not.toContain("MISSING_MONITORING");
  });

  // ── blockingBillingWarnings() helper ────────────────────────────────────

  it("blockingBillingWarnings returns only errors, not warnings", () => {
    const input: CompletenessCheckInput = {
      damageType: "BIOHAZARD",
      biohazardType: "sewage_overflow",
      scopeItems: [], // empty — everything is missing
    };
    const all = checkBillingCompleteness(input);
    const blocking = blockingBillingWarnings(input);
    expect(blocking.every((w) => w.severity === "error")).toBe(true);
    expect(blocking.length).toBeLessThan(all.length);
    // Specifically: biohazard compliance + EPA manifest are errors.
    const codes = blocking.map((w) => w.code);
    expect(codes).toContain("MISSING_BIOHAZARD_COMPLIANCE");
    expect(codes).toContain("MISSING_EPA_MANIFEST");
  });

  // ── Defensive ──────────────────────────────────────────────────────────

  it("empty scope items → many warnings, no crash", () => {
    const warnings = checkBillingCompleteness({ scopeItems: [] });
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("null damageType treated as generic — still checks prelims", () => {
    const warnings = checkBillingCompleteness({
      damageType: null,
      scopeItems: [],
    });
    const codes = warnings.map((w) => w.code);
    expect(codes).toContain("MISSING_MOBILISATION");
    expect(codes).toContain("MISSING_PPE");
  });

  it("each warning carries a human-readable message", () => {
    const warnings = checkBillingCompleteness({ scopeItems: [] });
    for (const w of warnings) {
      expect(typeof w.message).toBe("string");
      expect(w.message.length).toBeGreaterThan(10);
    }
  });
});
