/**
 * xero-category.test.ts — RA-854
 *
 * Locks the GST-matrix-derived scope-itemType → XeroCategory classification.
 * A failing case means the matrix and code are out of sync — either update
 * `docs/gst-treatment-matrix.md` or the classifier.
 */
import { describe, it, expect } from "vitest";
import {
  classifyScopeItem,
  isKnownItemType,
  KNOWN_ITEM_TYPES,
  XERO_CATEGORIES,
  XERO_CATEGORY_DEFAULT_CODES,
  XERO_CATEGORY_DESCRIPTIONS,
  type XeroCategory,
} from "../xero-category";

describe("XeroCategory taxonomy", () => {
  it("exports exactly 10 categories", () => {
    expect(XERO_CATEGORIES).toHaveLength(10);
  });

  it("every category has a default account code + description", () => {
    for (const cat of XERO_CATEGORIES) {
      expect(XERO_CATEGORY_DEFAULT_CODES[cat]).toMatch(/^\d{3,4}$/);
      expect(XERO_CATEGORY_DESCRIPTIONS[cat]).toBeTruthy();
    }
  });

  it("default account codes are unique", () => {
    const codes = Object.values(XERO_CATEGORY_DEFAULT_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("classifyScopeItem — GST matrix coverage", () => {
  // One assertion per itemType from docs/gst-treatment-matrix.md — a new
  // matrix row without a classification entry must fail the build.
  const cases: Array<[string, XeroCategory]> = [
    // scope-prelims
    ["mobilisation", "LABOUR_OWN"],
    ["daily_monitoring", "LABOUR_OWN"],
    ["waste_disposal_standard", "WASTE_DISPOSAL"],
    ["waste_disposal_contaminated", "WASTE_DISPOSAL"],
    ["safety_ppe", "CONSUMABLES"],
    ["ppe_standard", "CONSUMABLES"],
    ["ppe_premium", "CONSUMABLES"],
    ["project_management", "PROJECT_MANAGEMENT"],
    ["equipment_transport", "EQUIPMENT_HIRE_OWN"],

    // scope-mould
    ["hvac_inspection", "THIRD_PARTY_DISBURSEMENT"],
    ["clearance_testing", "THIRD_PARTY_DISBURSEMENT"],
    ["post_remediation_verification", "THIRD_PARTY_DISBURSEMENT"],

    // scope-storm
    ["structural_inspection", "THIRD_PARTY_DISBURSEMENT"],
    ["temporary_weatherproof", "LABOUR_OWN"],

    // scope-biohazard
    ["biohazard_handling_compliance", "LABOUR_OWN"],
    ["licensed_disposal", "WASTE_DISPOSAL"],
    ["sharps_disposal", "WASTE_DISPOSAL"],
    ["specialist_disposal", "WASTE_DISPOSAL"],
    ["epa_waste_manifest", "LABOUR_OWN"],

    // billing
    ["insurance_excess", "INSURANCE_EXCESS"],
    ["discount", "DISCOUNT"],
  ];

  it.each(cases)("classifies %s → %s", (itemType, expected) => {
    expect(classifyScopeItem(itemType)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(classifyScopeItem("MOBILISATION")).toBe("LABOUR_OWN");
    expect(classifyScopeItem("  clearance_testing  ")).toBe(
      "THIRD_PARTY_DISBURSEMENT",
    );
  });

  it("defaults unknown itemType to LABOUR_OWN", () => {
    expect(classifyScopeItem("totally_unknown_thing")).toBe("LABOUR_OWN");
    expect(classifyScopeItem("")).toBe("LABOUR_OWN");
  });

  it("isKnownItemType distinguishes matched vs fallback", () => {
    expect(isKnownItemType("mobilisation")).toBe(true);
    expect(isKnownItemType("MOBILISATION")).toBe(true);
    expect(isKnownItemType("totally_unknown_thing")).toBe(false);
    expect(isKnownItemType("")).toBe(false);
  });

  it("every known itemType classifies to a real XeroCategory", () => {
    for (const itemType of KNOWN_ITEM_TYPES) {
      const cat = classifyScopeItem(itemType);
      expect(XERO_CATEGORIES).toContain(cat);
    }
  });
});
