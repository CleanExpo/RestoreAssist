import { describe, expect, it } from "vitest";

import { computeInvoiceTotals } from "../totals";

/**
 * RA-7096. The invoice-variation route recomputed GST as a flat 10% of the
 * adjusted subtotal, discarding the per-line `gstRate` it had just calculated,
 * and persisted `gstRate: item.gstRate || 10` — which coerces a GST-free 0%
 * line to 10% because `0 || 10 === 10` in JavaScript.
 *
 * `app/api/invoices/route.ts` already carries the correct logic AND a comment
 * describing this precise defect. The two implementations drifted; this helper
 * is the single source of truth so they cannot drift again.
 *
 * All money is in cents.
 */
describe("computeInvoiceTotals", () => {
  it("does not charge GST on a GST-free line", () => {
    const r = computeInvoiceTotals({
      lineItems: [
        { quantity: 1, unitPrice: 10000, gstRate: 10 },
        { quantity: 1, unitPrice: 10000, gstRate: 0 },
      ],
    });

    expect(r.subtotal).toBe(20000);
    // Only the first line attracts GST. A flat 10% would give 2000.
    expect(r.gst).toBe(1000);
    expect(r.total).toBe(21000);
  });

  it("preserves an explicit zero rate on the persisted line — never coerces to 10", () => {
    const r = computeInvoiceTotals({
      lineItems: [{ quantity: 1, unitPrice: 10000, gstRate: 0 }],
    });

    expect(r.lineItems[0].gstRate).toBe(0);
    expect(r.lineItems[0].gstAmount).toBe(0);
    expect(r.gst).toBe(0);
  });

  it("defaults a missing rate to 10 without swallowing a real zero", () => {
    const r = computeInvoiceTotals({
      lineItems: [
        { quantity: 1, unitPrice: 10000 },
        { quantity: 1, unitPrice: 10000, gstRate: 0 },
      ],
    });

    expect(r.lineItems[0].gstRate).toBe(10);
    expect(r.lineItems[1].gstRate).toBe(0);
    expect(r.gst).toBe(1000);
  });

  it("handles a mixed-rate invoice", () => {
    const r = computeInvoiceTotals({
      lineItems: [
        { quantity: 2, unitPrice: 5000, gstRate: 10 },
        { quantity: 1, unitPrice: 20000, gstRate: 0 },
        { quantity: 1, unitPrice: 10000, gstRate: 15 },
      ],
    });

    expect(r.subtotal).toBe(40000);
    expect(r.gst).toBe(1000 + 0 + 1500);
  });

  it("scales GST proportionally on a fixed discount rather than recomputing flat", () => {
    const r = computeInvoiceTotals({
      lineItems: [
        { quantity: 1, unitPrice: 10000, gstRate: 10 },
        { quantity: 1, unitPrice: 10000, gstRate: 0 },
      ],
      discountAmount: 10000,
    });

    expect(r.subtotal).toBe(10000);
    // Half the base remains, so half the weighted GST. Flat 10% would say 1000.
    expect(r.gst).toBe(500);
  });

  it("scales GST proportionally on a percentage discount", () => {
    const r = computeInvoiceTotals({
      lineItems: [
        { quantity: 1, unitPrice: 10000, gstRate: 10 },
        { quantity: 1, unitPrice: 10000, gstRate: 0 },
      ],
      discountPercentage: 50,
    });

    expect(r.subtotal).toBe(10000);
    expect(r.gst).toBe(500);
  });

  it("is unchanged from a flat 10% computation for an all-10% invoice", () => {
    const r = computeInvoiceTotals({
      lineItems: [
        { quantity: 1, unitPrice: 10000, gstRate: 10 },
        { quantity: 3, unitPrice: 5000, gstRate: 10 },
      ],
    });

    // Regression guard: the common case must not change behaviour.
    expect(r.gst).toBe(Math.round(r.subtotal * 0.1));
  });

  it("adds shipping to the subtotal without inventing GST on it", () => {
    const r = computeInvoiceTotals({
      lineItems: [{ quantity: 1, unitPrice: 10000, gstRate: 0 }],
      shippingAmount: 5000,
    });

    expect(r.subtotal).toBe(15000);
    expect(r.gst).toBe(0);
  });

  it("never divides by zero on a fully discounted invoice", () => {
    const r = computeInvoiceTotals({
      lineItems: [{ quantity: 1, unitPrice: 10000, gstRate: 10 }],
      discountAmount: 10000,
    });

    expect(r.subtotal).toBe(0);
    expect(r.gst).toBe(0);
    expect(Number.isFinite(r.gst)).toBe(true);
  });
});
