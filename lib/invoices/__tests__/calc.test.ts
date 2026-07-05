import { describe, it, expect, afterEach, vi } from "vitest";
import {
  calculateInvoiceTotals,
  toLocalDateInputValue,
  addDaysLocalDateInputValue,
  type InvoiceCalcInput,
} from "../calc";

/**
 * Reference implementation copied verbatim from the server routes
 * (app/api/invoices/route.ts POST + app/api/invoices/[id]/route.ts PUT).
 * If `calculateInvoiceTotals` ever drifts from the server, these tests fail.
 * Inputs are in cents, matching the API request body the client sends.
 */
function serverComputeTotals(body: {
  lineItems: Array<{ quantity: number; unitPrice: number; gstRate?: number }>;
  discountAmount?: number;
  discountPercentage?: number;
  shippingAmount?: number;
}): { subtotalExGST: number; gstAmount: number; totalIncGST: number } {
  const { discountAmount, discountPercentage, shippingAmount } = body;
  let subtotalExGST = 0;
  let gstAmount = 0;

  body.lineItems.forEach((item) => {
    const quantity = item.quantity;
    const unitPrice = item.unitPrice;
    const subtotal = Math.round(quantity * unitPrice);
    const gstRate = item.gstRate ?? 10.0;
    const itemGst = Math.round(subtotal * (gstRate / 100));
    subtotalExGST += subtotal;
    gstAmount += itemGst;
  });

  const preDiscountSubtotal = subtotalExGST;
  if (discountAmount) {
    subtotalExGST -= discountAmount;
    gstAmount =
      preDiscountSubtotal > 0
        ? Math.round(gstAmount * (subtotalExGST / preDiscountSubtotal))
        : 0;
  } else if (discountPercentage) {
    const discount = Math.round(subtotalExGST * (discountPercentage / 100));
    subtotalExGST -= discount;
    gstAmount =
      preDiscountSubtotal > 0
        ? Math.round(gstAmount * (subtotalExGST / preDiscountSubtotal))
        : 0;
  }

  if (shippingAmount) {
    subtotalExGST += shippingAmount;
    gstAmount += Math.round(shippingAmount * 0.1);
  }

  const totalIncGST = subtotalExGST + gstAmount;
  return { subtotalExGST, gstAmount, totalIncGST };
}

describe("calculateInvoiceTotals matches the server", () => {
  const cases: Array<{ name: string; input: InvoiceCalcInput }> = [
    {
      name: "single line, no extras",
      input: { lineItems: [{ quantity: 1, unitPrice: 10000, gstRate: 10 }] },
    },
    {
      name: "shipping charges GST on freight (AU taxable supply)",
      input: {
        lineItems: [{ quantity: 2, unitPrice: 5000, gstRate: 10 }],
        shippingAmount: 1500,
      },
    },
    {
      name: "fixed discount scales GST proportionally on discounted base",
      input: {
        lineItems: [{ quantity: 1, unitPrice: 20000, gstRate: 10 }],
        discountAmount: 5000,
      },
    },
    {
      name: "mixed per-item rates + fixed discount keeps rates proportional",
      input: {
        lineItems: [
          { quantity: 1, unitPrice: 10000, gstRate: 0 },
          { quantity: 1, unitPrice: 10000, gstRate: 10 },
        ],
        discountAmount: 5000,
      },
    },
    {
      name: "mixed per-item rates + percentage discount keeps rates proportional",
      input: {
        lineItems: [
          { quantity: 1, unitPrice: 10000, gstRate: 0 },
          { quantity: 1, unitPrice: 10000, gstRate: 15 },
        ],
        discountPercentage: 25,
      },
    },
    {
      name: "percentage discount",
      input: {
        lineItems: [{ quantity: 3, unitPrice: 3333, gstRate: 10 }],
        discountPercentage: 12.5,
      },
    },
    {
      name: "discount + shipping together",
      input: {
        lineItems: [
          { quantity: 1, unitPrice: 12345, gstRate: 10 },
          { quantity: 2, unitPrice: 6789, gstRate: 10 },
        ],
        discountAmount: 2000,
        shippingAmount: 999,
      },
    },
    {
      name: "GST-free line item (gstRate 0) is respected, not forced to 10%",
      input: {
        lineItems: [
          { quantity: 1, unitPrice: 10000, gstRate: 0 },
          { quantity: 1, unitPrice: 5000, gstRate: 10 },
        ],
      },
    },
    {
      name: "fractional quantity with per-item rounding",
      input: {
        lineItems: [
          { quantity: 1.5, unitPrice: 333, gstRate: 10 },
          { quantity: 0.25, unitPrice: 777, gstRate: 10 },
        ],
      },
    },
  ];

  cases.forEach(({ name, input }) => {
    it(name, () => {
      const expected = serverComputeTotals({
        lineItems: input.lineItems.map((li) => ({
          quantity: li.quantity as number,
          unitPrice: li.unitPrice as number,
          gstRate: li.gstRate ?? undefined,
        })),
        discountAmount: input.discountAmount ?? undefined,
        discountPercentage: input.discountPercentage ?? undefined,
        shippingAmount: input.shippingAmount ?? undefined,
      });
      expect(calculateInvoiceTotals(input)).toEqual(expected);
    });
  });

  // gst-hardcoded-rate-ignores-item-rates: before this fix the discount
  // branches recomputed GST as round(discountedSubtotal * 0.1), discarding the
  // per-item-weighted gstAmount. Any invoice with a non-10% line (0% or 15%)
  // got a wrong GST total the moment a discount was applied. These pin the
  // correct proportional numbers with explicit expected values that the old
  // flat-10% recompute would fail.
  describe("regression: discount preserves mixed per-item GST rates", () => {
    it("fixed-amount discount scales a mixed 0%/10% invoice proportionally", () => {
      // preSub 20000, weighted gst 1000; discount 5000 -> newSub 15000.
      // proportional: round(1000 * 15000/20000) = 750. Old flat: 1500.
      const result = calculateInvoiceTotals({
        lineItems: [
          { quantity: 1, unitPrice: 10000, gstRate: 0 },
          { quantity: 1, unitPrice: 10000, gstRate: 10 },
        ],
        discountAmount: 5000,
      });
      expect(result.gstAmount).toBe(750);
      expect(result.gstAmount).not.toBe(Math.round(15000 * 0.1)); // 1500 (old bug)
      expect(result.totalIncGST).toBe(15750);
    });

    it("percentage discount scales a mixed 0%/15% invoice proportionally", () => {
      // preSub 20000, weighted gst 1500; 25% discount -> newSub 15000.
      // proportional: round(1500 * 15000/20000) = 1125. Old flat: 1500.
      const result = calculateInvoiceTotals({
        lineItems: [
          { quantity: 1, unitPrice: 10000, gstRate: 0 },
          { quantity: 1, unitPrice: 10000, gstRate: 15 },
        ],
        discountPercentage: 25,
      });
      expect(result.gstAmount).toBe(1125);
      expect(result.gstAmount).not.toBe(Math.round(15000 * 0.1)); // 1500 (old bug)
      expect(result.totalIncGST).toBe(16125);
    });

    it("all-10% invoice is unchanged by the fix (identical to old flat 10%)", () => {
      const result = calculateInvoiceTotals({
        lineItems: [{ quantity: 1, unitPrice: 20000, gstRate: 10 }],
        discountAmount: 5000,
      });
      // newSub 15000; both proportional and flat give 1500 here.
      expect(result.gstAmount).toBe(1500);
      expect(result.gstAmount).toBe(Math.round(15000 * 0.1));
      expect(result.totalIncGST).toBe(16500);
    });
  });

  it("note: gst-free preview would diverge from server under the old hardcoded round(subtotal*0.1)", () => {
    // The OLD client preview did gst = round(subtotal * 0.1) ignoring gstRate.
    // Demonstrates why aligning to the server matters for a GST-free supply.
    const input: InvoiceCalcInput = {
      lineItems: [{ quantity: 1, unitPrice: 10000, gstRate: 0 }],
    };
    const oldClientGst = Math.round(10000 * 0.1); // 1000 — wrong
    const aligned = calculateInvoiceTotals(input);
    expect(aligned.gstAmount).toBe(0);
    expect(aligned.gstAmount).not.toBe(oldClientGst);
  });
});

describe("toLocalDateInputValue / addDaysLocalDateInputValue (no UTC drift)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats the LOCAL calendar date, not the UTC date", () => {
    // 2026-06-14 09:30 UTC. For a +10:00 (AEST) user this is already
    // 2026-06-14 19:30 local — same day. We assert it formats the local
    // year/month/day fields of the Date, which is what matters for the
    // date input default.
    const d = new Date("2026-06-14T09:30:00.000Z");
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(toLocalDateInputValue(d)).toBe(expected);
  });

  it("uses local fields so it never matches the UTC slice when they differ", () => {
    // A timestamp whose UTC date and local date can differ near midnight.
    const d = new Date("2026-06-14T23:30:00.000Z");
    const local = toLocalDateInputValue(d);
    const utc = d.toISOString().slice(0, 10);
    // local must reflect getDate() in the running TZ; if the TZ pushes past
    // midnight, local !== utc — and local is the correct one for the user.
    const expectedLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(local).toBe(expectedLocal);
    // The UTC slice is exactly what the buggy code produced.
    expect(utc).toBe("2026-06-14");
  });

  it("adds whole days on the local calendar", () => {
    const start = new Date(2026, 5, 14); // local 2026-06-14
    expect(addDaysLocalDateInputValue(start, 30)).toBe("2026-07-14");
    expect(addDaysLocalDateInputValue(start, 0)).toBe("2026-06-14");
  });

  it("crosses month/year boundaries correctly", () => {
    const start = new Date(2026, 11, 20); // local 2026-12-20
    expect(addDaysLocalDateInputValue(start, 30)).toBe("2027-01-19");
  });
});
