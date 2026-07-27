import { describe, expect, it } from "vitest";

import { calculateInvoiceTotals } from "../calc";

/**
 * A tax invoice's header subtotal MUST equal the sum of its own line items.
 *
 * Regression guard for a defect introduced while wiring
 * `app/api/invoices/[id]/variations/route.ts` to `calc.ts`: the header moved to
 * calc.ts's `round(qty * round(unitPrice*100))` while the persisted line items
 * were left on `round(qty * unitPrice * 100)`. Those differ by a cent whenever
 * quantity is fractional — and `InvoiceLineItem.quantity` is a Float, so hours
 * and m² are normal inputs on a restoration invoice.
 *
 * The route now derives both from the same per-item maths. This test pins the
 * invariant independently of the route so it cannot drift back.
 */

/** Mirrors the route's persisted-line-item computation exactly. */
function persistLine(item: { quantity: number; unitPrice: number; gstRate?: number }) {
  const unitPriceCents = Math.round(item.unitPrice * 100);
  const subtotal = Math.round(item.quantity * unitPriceCents);
  const gstRate = item.gstRate ?? 10;
  const gstAmount = Math.round(subtotal * (gstRate / 100));
  return { subtotal, gstAmount, total: subtotal + gstAmount };
}

/** The old expression, kept only to prove this test can fail. */
function persistLineOldWay(item: { quantity: number; unitPrice: number; gstRate?: number }) {
  const gstRate = item.gstRate ?? 10;
  return {
    subtotal: Math.round(item.quantity * item.unitPrice * 100),
    gstAmount: Math.round(item.quantity * item.unitPrice * 100 * (gstRate / 100)),
  };
}

describe("invoice header equals the sum of its line items", () => {
  // The reviewer's concrete failing case.
  const FRACTIONAL = [{ quantity: 1.5, unitPrice: 1.63, gstRate: 10 }];

  it("agrees on the reviewer's fractional-quantity case", () => {
    const header = calculateInvoiceTotals({
      lineItems: FRACTIONAL.map((i) => ({
        quantity: i.quantity,
        unitPrice: Math.round(i.unitPrice * 100),
        gstRate: i.gstRate,
      })),
    });
    const lines = FRACTIONAL.map(persistLine);

    expect(header.subtotalExGST).toBe(lines.reduce((s, l) => s + l.subtotal, 0));
    expect(header.gstAmount).toBe(lines.reduce((s, l) => s + l.gstAmount, 0));
  });

  it("POSITIVE CONTROL: the old expression genuinely disagreed", () => {
    // Proves this test class can fail — a green result above is meaningful.
    const header = calculateInvoiceTotals({
      lineItems: FRACTIONAL.map((i) => ({
        quantity: i.quantity,
        unitPrice: Math.round(i.unitPrice * 100),
        gstRate: i.gstRate,
      })),
    });
    const oldLines = FRACTIONAL.map(persistLineOldWay);

    expect(header.subtotalExGST).not.toBe(
      oldLines.reduce((s, l) => s + l.subtotal, 0),
    );
  });

  it("agrees across a realistic sweep of prices and fractional quantities", () => {
    const quantities = [0.25, 0.5, 1, 1.5, 2, 2.5, 3, 7.75];
    const prices = [1.63, 9.99, 45.5, 123.45, 87.33, 1999.95];
    const rates = [0, 10, 15];

    for (const quantity of quantities) {
      for (const unitPrice of prices) {
        for (const gstRate of rates) {
          const item = { quantity, unitPrice, gstRate };
          const header = calculateInvoiceTotals({
            lineItems: [
              {
                quantity,
                unitPrice: Math.round(unitPrice * 100),
                gstRate,
              },
            ],
          });
          const line = persistLine(item);

          expect(
            header.subtotalExGST,
            `subtotal mismatch at qty=${quantity} price=${unitPrice} rate=${gstRate}`,
          ).toBe(line.subtotal);
          expect(
            header.gstAmount,
            `gst mismatch at qty=${quantity} price=${unitPrice} rate=${gstRate}`,
          ).toBe(line.gstAmount);
        }
      }
    }
  });

  it("a line omitting gstRate defaults to 10 and never yields NaN", () => {
    const line = persistLine({ quantity: 1.5, unitPrice: 1.63 });

    expect(Number.isNaN(line.gstAmount)).toBe(false);
    expect(Number.isInteger(line.gstAmount)).toBe(true);
  });
});
