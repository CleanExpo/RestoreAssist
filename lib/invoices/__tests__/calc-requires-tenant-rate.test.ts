/**
 * Regression guard for CodeRabbit finding 6 on PR #2095.
 *
 * `defaultGstRatePercent` was optional with a `= 10` default. Shipping is the
 * one component whose GST is not derived per line item, so it took that
 * default — meaning shipping on a New Zealand invoice was taxed at the
 * Australian rate whenever a caller omitted the argument, which the variations
 * route did.
 *
 * The parameter is now required, so the omission is a compile error rather
 * than a silent 5-percentage-point undercharge. These tests pin the arithmetic
 * that the default was getting wrong.
 */
import { describe, expect, it } from "vitest";

import { calculateInvoiceTotals } from "../calc";
import { getGstTreatment, getGstTreatmentForCurrency } from "@/lib/gst-rules";

const ONE_HUNDRED_DOLLARS = 10_000; // cents
const SHIPPING = 5_000; // cents

describe("calculateInvoiceTotals — shipping uses the jurisdiction rate", () => {
  it("taxes NZ shipping at 15%, not the old 10% default", () => {
    const { gstAmount, subtotalExGST, totalIncGST } = calculateInvoiceTotals({
      lineItems: [{ quantity: 1, unitPrice: ONE_HUNDRED_DOLLARS, gstRate: 15 }],
      shippingAmount: SHIPPING,
      defaultGstRatePercent: getGstTreatment("NZ").ratePercent,
    });

    // 10000 * 15% = 1500 on the line, 5000 * 15% = 750 on shipping.
    expect(gstAmount).toBe(2_250);
    expect(subtotalExGST).toBe(15_000);
    expect(totalIncGST).toBe(17_250);
  });

  it("taxes AU shipping at 10%", () => {
    const { gstAmount } = calculateInvoiceTotals({
      lineItems: [{ quantity: 1, unitPrice: ONE_HUNDRED_DOLLARS, gstRate: 10 }],
      shippingAmount: SHIPPING,
      defaultGstRatePercent: getGstTreatment("AU").ratePercent,
    });

    // 10000 * 10% = 1000 on the line, 5000 * 10% = 500 on shipping.
    expect(gstAmount).toBe(1_500);
  });

  it("differs by exactly the shipping delta between the two jurisdictions", () => {
    const shared = {
      lineItems: [{ quantity: 1, unitPrice: ONE_HUNDRED_DOLLARS, gstRate: 0 }],
      shippingAmount: SHIPPING,
    };

    const au = calculateInvoiceTotals({
      ...shared,
      defaultGstRatePercent: 10,
    });
    const nz = calculateInvoiceTotals({
      ...shared,
      defaultGstRatePercent: 15,
    });

    // The whole bug in one number: 5000 * (15% - 10%) = 250 cents undercharged
    // on every NZ variation carrying shipping.
    expect(nz.gstAmount - au.gstAmount).toBe(250);
  });

  it("derives the rate from an issued document's own currency", () => {
    // A variation belongs to an already-issued invoice, so its rate is fixed
    // by that document's currency — not by where the tenant trades today.
    const { gstAmount } = calculateInvoiceTotals({
      lineItems: [{ quantity: 1, unitPrice: ONE_HUNDRED_DOLLARS, gstRate: 10 }],
      shippingAmount: SHIPPING,
      defaultGstRatePercent:
        getGstTreatmentForCurrency("AUD").ratePercent,
    });

    expect(gstAmount).toBe(1_500);
  });
});
