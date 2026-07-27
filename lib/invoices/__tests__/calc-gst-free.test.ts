import { describe, expect, it } from "vitest";

import { calculateInvoiceTotals } from "../calc";

/**
 * RA-7096 regression tests.
 *
 * `app/api/invoices/[id]/variations/route.ts` summed per-line GST and then
 * discarded it with `gst = Math.round(subtotal * 0.1)`, taxing GST-free (0%)
 * lines at 10% on a tax invoice, and persisted `gstRate: item.gstRate || 10`
 * which coerces an explicit 0 to 10 (`0 || 10 === 10`).
 *
 * `lib/invoices/calc.ts` was ALREADY the documented single source of truth and
 * already handled all of this correctly — the variations route simply never
 * used it. These tests pin the behaviour the route now depends on, so a future
 * change to calc.ts cannot silently reintroduce the defect.
 *
 * All money in integer cents.
 */
describe("calculateInvoiceTotals — GST-free and mixed rates (RA-7096)", () => {
  it("does not charge GST on a GST-free line", () => {
    const r = calculateInvoiceTotals({
      lineItems: [
        { quantity: 1, unitPrice: 10000, gstRate: 10 },
        { quantity: 1, unitPrice: 10000, gstRate: 0 },
      ],
    });

    expect(r.subtotalExGST).toBe(20000);
    // A flat 10% recompute — the old behaviour — would give 2000.
    expect(r.gstAmount).toBe(1000);
    expect(r.totalIncGST).toBe(21000);
  });

  it("honours an explicit zero rate rather than defaulting it to 10", () => {
    const r = calculateInvoiceTotals({
      lineItems: [{ quantity: 1, unitPrice: 10000, gstRate: 0 }],
    });

    expect(r.gstAmount).toBe(0);
  });

  it("defaults a missing rate to 10 without swallowing a real zero", () => {
    const r = calculateInvoiceTotals({
      lineItems: [
        { quantity: 1, unitPrice: 10000 },
        { quantity: 1, unitPrice: 10000, gstRate: 0 },
      ],
    });

    expect(r.gstAmount).toBe(1000);
  });

  it("handles a mixed-rate invoice", () => {
    const r = calculateInvoiceTotals({
      lineItems: [
        { quantity: 2, unitPrice: 5000, gstRate: 10 },
        { quantity: 1, unitPrice: 20000, gstRate: 0 },
        { quantity: 1, unitPrice: 10000, gstRate: 15 },
      ],
    });

    expect(r.subtotalExGST).toBe(40000);
    expect(r.gstAmount).toBe(1000 + 0 + 1500);
  });

  it("scales GST proportionally on a fixed discount instead of recomputing flat", () => {
    const r = calculateInvoiceTotals({
      lineItems: [
        { quantity: 1, unitPrice: 10000, gstRate: 10 },
        { quantity: 1, unitPrice: 10000, gstRate: 0 },
      ],
      discountAmount: 10000,
    });

    expect(r.subtotalExGST).toBe(10000);
    // Half the base remains, so half the weighted GST. Flat 10% would say 1000.
    expect(r.gstAmount).toBe(500);
  });

  it("scales GST proportionally on a percentage discount", () => {
    const r = calculateInvoiceTotals({
      lineItems: [
        { quantity: 1, unitPrice: 10000, gstRate: 10 },
        { quantity: 1, unitPrice: 10000, gstRate: 0 },
      ],
      discountPercentage: 50,
    });

    expect(r.subtotalExGST).toBe(10000);
    expect(r.gstAmount).toBe(500);
  });

  it("charges GST on shipping — the server's deliberate tax treatment", () => {
    // Pinned so a future 'simplification' cannot silently change the tax
    // treatment of freight on every invoice.
    const r = calculateInvoiceTotals({
      lineItems: [{ quantity: 1, unitPrice: 10000, gstRate: 0 }],
      shippingAmount: 5000,
    });

    expect(r.subtotalExGST).toBe(15000);
    expect(r.gstAmount).toBe(500);
  });

  it("is identical to a flat 10% computation for an all-10% invoice", () => {
    const r = calculateInvoiceTotals({
      lineItems: [
        { quantity: 1, unitPrice: 10000, gstRate: 10 },
        { quantity: 3, unitPrice: 5000, gstRate: 10 },
      ],
    });

    // The common path must be provably unchanged.
    expect(r.gstAmount).toBe(Math.round(r.subtotalExGST * 0.1));
  });

  it("never divides by zero on a fully discounted invoice", () => {
    const r = calculateInvoiceTotals({
      lineItems: [{ quantity: 1, unitPrice: 10000, gstRate: 10 }],
      discountAmount: 10000,
    });

    expect(r.subtotalExGST).toBe(0);
    expect(r.gstAmount).toBe(0);
    expect(Number.isFinite(r.gstAmount)).toBe(true);
  });
});
