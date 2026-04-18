/**
 * RA-875: Unit tests for gst-treatment-rules.
 *
 * Covers all 10 canonical categories, validation, null-safety, and the
 * critical DISCOUNT bug fix (must return OUTPUT, never NONE).
 */

import { describe, it, expect } from "vitest";
import {
  getGSTTreatment,
  isKnownCategory,
  ALL_CATEGORIES,
} from "../gst-treatment-rules";

describe("getGSTTreatment — canonical 6 service categories (OUTPUT 10%)", () => {
  const TAXABLE = [
    "LABOUR",
    "EQUIPMENT",
    "MATERIALS",
    "SUBCONTRACTOR",
    "PRELIMS",
    "CONTENTS",
  ] as const;

  it.each(TAXABLE)("%s is OUTPUT 10% taxable", (category) => {
    const t = getGSTTreatment(category);
    expect(t.taxType).toBe("OUTPUT");
    expect(t.rate).toBe(10);
    expect(t.atoReference).toMatch(/GSTR 2000\/10/);
  });
});

describe("getGSTTreatment — edge-case billing classes", () => {
  it("INSURANCE_EXCESS is OUTPUT 10% (taxable — GSTR 2006/10)", () => {
    const t = getGSTTreatment("INSURANCE_EXCESS");
    expect(t.taxType).toBe("OUTPUT");
    expect(t.rate).toBe(10);
    expect(t.atoReference).toMatch(/GSTR 2006\/10/);
  });

  it("GOVERNMENT_LEVY is EXEMPT 0% (ATO Div 81)", () => {
    const t = getGSTTreatment("GOVERNMENT_LEVY");
    expect(t.taxType).toBe("EXEMPT");
    expect(t.rate).toBe(0);
    expect(t.atoReference).toMatch(/Div 81/);
  });

  it("DISBURSEMENT is INPUT 10% (on-charged expense — GSTR 2000/37)", () => {
    const t = getGSTTreatment("DISBURSEMENT");
    expect(t.taxType).toBe("INPUT");
    expect(t.rate).toBe(10);
    expect(t.atoReference).toMatch(/GSTR 2000\/37/);
  });

  it("DISCOUNT is OUTPUT 10% — critical bug fix (must NOT be NONE)", () => {
    // Before RA-875, DISCOUNT line items defaulted to TaxType="NONE" which
    // broke Xero GST calculations. Ensure regression never reappears.
    const t = getGSTTreatment("DISCOUNT");
    expect(t.taxType).toBe("OUTPUT");
    expect(t.taxType).not.toBe("NONE");
    expect(t.rate).toBe(10);
    expect(t.atoReference).toMatch(/GSTR 2001\/6/);
  });
});

describe("getGSTTreatment — null / unknown handling", () => {
  it("null returns taxable default (safest — ensures GST applied)", () => {
    const t = getGSTTreatment(null);
    expect(t.taxType).toBe("OUTPUT");
    expect(t.rate).toBe(10);
  });

  it("undefined returns taxable default", () => {
    const t = getGSTTreatment(undefined);
    expect(t.taxType).toBe("OUTPUT");
  });

  it("empty string returns taxable default", () => {
    const t = getGSTTreatment("");
    expect(t.taxType).toBe("OUTPUT");
  });

  it("unknown category returns taxable default (fail-safe toward charging GST)", () => {
    const t = getGSTTreatment("WidgetPolishing");
    expect(t.taxType).toBe("OUTPUT");
    expect(t.rate).toBe(10);
  });

  it("case-insensitive category matching", () => {
    const lower = getGSTTreatment("labour");
    const mixed = getGSTTreatment("Labour");
    const upper = getGSTTreatment("LABOUR");
    expect(lower.taxType).toBe("OUTPUT");
    expect(mixed.taxType).toBe("OUTPUT");
    expect(upper.taxType).toBe("OUTPUT");
    expect(lower.atoReference).toBe(upper.atoReference);
  });

  it("trims whitespace", () => {
    const t = getGSTTreatment("  GOVERNMENT_LEVY  ");
    expect(t.taxType).toBe("EXEMPT");
  });
});

describe("isKnownCategory type-guard", () => {
  it("returns true for all canonical categories", () => {
    for (const c of ALL_CATEGORIES) {
      expect(isKnownCategory(c)).toBe(true);
    }
  });

  it("returns false for unknown values", () => {
    expect(isKnownCategory("WidgetPolishing")).toBe(false);
    expect(isKnownCategory("labour")).toBe(false); // case-sensitive type guard
    expect(isKnownCategory(null)).toBe(false);
    expect(isKnownCategory(undefined)).toBe(false);
    expect(isKnownCategory(123)).toBe(false);
    expect(isKnownCategory({})).toBe(false);
  });
});

describe("ALL_CATEGORIES", () => {
  it("contains exactly 10 canonical categories", () => {
    expect(ALL_CATEGORIES).toHaveLength(10);
  });

  it("includes all 6 service categories plus 4 edge-case classes", () => {
    expect(ALL_CATEGORIES).toEqual(
      expect.arrayContaining([
        "LABOUR",
        "EQUIPMENT",
        "MATERIALS",
        "SUBCONTRACTOR",
        "PRELIMS",
        "CONTENTS",
        "INSURANCE_EXCESS",
        "GOVERNMENT_LEVY",
        "DISBURSEMENT",
        "DISCOUNT",
      ]),
    );
  });
});
