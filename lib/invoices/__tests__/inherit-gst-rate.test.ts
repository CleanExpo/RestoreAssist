import { describe, expect, it } from "vitest";
import {
  inheritGstRate,
  resolveLineGstRate,
} from "@/lib/invoices/inherit-gst-rate";
import { calculateInvoiceTotals } from "@/lib/invoices/calc";

describe("inheritGstRate (RA-7096)", () => {
  it("defaults to 10 when parent has no lines", () => {
    expect(inheritGstRate([])).toBe(10);
    expect(inheritGstRate(undefined)).toBe(10);
    expect(inheritGstRate(null)).toBe(10);
  });

  it("inherits 0 from a GST-free parent", () => {
    expect(inheritGstRate([{ gstRate: 0 }, { gstRate: 0 }])).toBe(0);
  });

  it("picks the modal rate on mixed parents", () => {
    expect(
      inheritGstRate([
        { gstRate: 10 },
        { gstRate: 0 },
        { gstRate: 10 },
      ]),
    ).toBe(10);
    expect(
      inheritGstRate([
        { gstRate: 0 },
        { gstRate: 0 },
        { gstRate: 10 },
      ]),
    ).toBe(0);
  });

  it("treats nullish / NaN parent rates as the fallback for counting", () => {
    expect(inheritGstRate([{ gstRate: null }, { gstRate: undefined }])).toBe(
      10,
    );
  });
});

describe("resolveLineGstRate (RA-7096)", () => {
  it("preserves explicit 0 (does not coerce with ||)", () => {
    expect(resolveLineGstRate(0, 10)).toBe(0);
  });

  it("falls back to inherited when omitted", () => {
    expect(resolveLineGstRate(undefined, 0)).toBe(0);
    expect(resolveLineGstRate(null, 0)).toBe(0);
    expect(resolveLineGstRate(undefined, 10)).toBe(10);
  });
});

describe("variation totals with inherited GST-free rate", () => {
  it("a variation line at gstRate 0 yields zero GST (calc SSOT)", () => {
    const totals = calculateInvoiceTotals({
      lineItems: [{ quantity: 1, unitPrice: 50000, gstRate: 0 }],
    });
    expect(totals.gstAmount).toBe(0);
    expect(totals.subtotalExGST).toBe(50000);
    expect(totals.totalIncGST).toBe(50000);
  });

  it("explicit gstRate 0 survives resolve + calc end-to-end", () => {
    const rate = resolveLineGstRate(0, inheritGstRate([{ gstRate: 10 }]));
    expect(rate).toBe(0);
    const totals = calculateInvoiceTotals({
      lineItems: [{ quantity: 1, unitPrice: 10000, gstRate: rate }],
    });
    expect(totals.gstAmount).toBe(0);
  });
});
