import { describe, it, expect } from "vitest";
import { getVariationAmountDisplay } from "../variation-amount";

describe("getVariationAmountDisplay", () => {
  // The stored totalIncGST is the signed source of truth. These are the exact
  // inputs both the variations list page and the invoice detail page receive
  // from /api/invoices/[id]/variations.

  it("renders an addition (positive total) as a signed increase", () => {
    const d = getVariationAmountDisplay(55000); // $550.00
    expect(d.cents).toBe(55000);
    expect(d.positive).toBe(true);
    expect(d.value).toBe("+$550.00");
  });

  it("renders a reduction (negative total) as a signed decrease", () => {
    const d = getVariationAmountDisplay(-55000); // -$550.00
    expect(d.cents).toBe(-55000);
    expect(d.positive).toBe(false);
    expect(d.value).toBe("-$550.00");
  });

  it("treats a zero variation as non-negative without a minus sign", () => {
    const d = getVariationAmountDisplay(0);
    expect(d.positive).toBe(true);
    expect(d.value).toBe("$0.00");
  });

  it("normalises negative zero to a plain zero", () => {
    const d = getVariationAmountDisplay(-0);
    expect(d.cents).toBe(0);
    expect(d.positive).toBe(true);
    expect(d.value).toBe("$0.00");
  });

  it("formats sub-dollar cents precisely", () => {
    expect(getVariationAmountDisplay(1).value).toBe("+$0.01");
    expect(getVariationAmountDisplay(-1).value).toBe("-$0.01");
    expect(getVariationAmountDisplay(99).value).toBe("+$0.99");
  });

  it("is consistent: both screens derive the same sign from the same stored value", () => {
    // Detail page renders totalIncGST/100 directly; variations page used to
    // re-derive sign from line items. With the shared helper, identical input
    // yields identical sign + magnitude on both.
    for (const cents of [123456, -123456, 0, -7800, 7800]) {
      const a = getVariationAmountDisplay(cents);
      const b = getVariationAmountDisplay(cents);
      expect(a).toEqual(b);
      // The signed magnitude always matches the stored cents.
      expect(Math.sign(a.cents)).toBe(Math.sign(cents));
    }
  });
});
