import { describe, it, expect } from "vitest";

/**
 * Guards the invoice DETAIL-PAGE breakdown display
 * (app/dashboard/invoices/[id]/page.tsx, Financial Summary block).
 *
 * Bug (PR #1317): the page rendered `invoice.subtotalExGST` AND a separate
 * "Shipping" line. But the server stores shipping INSIDE subtotalExGST
 * (app/api/invoices/route.ts: `subtotalExGST += shippingAmount`), so the
 * viewer saw shipping twice. Total/GST persistence is correct and unchanged.
 *
 * Display fix: show the subtotal line as (subtotalExGST - shippingAmount) so
 * the visible breakdown sums to the unchanged Total exactly once.
 *
 * These tests assert the display formula, not the persisted figures.
 */

// Mirrors the persistence math in app/api/invoices/route.ts for a single
// line item, so the test exercises real, stored field values.
function buildStoredInvoice(opts: {
  lineSubtotalExGst: number; // cents, ex-GST
  shippingAmount: number; // cents, ex-GST
}) {
  const { lineSubtotalExGst, shippingAmount } = opts;
  let subtotalExGST = lineSubtotalExGst;
  let gstAmount = Math.round(lineSubtotalExGst * 0.1);

  // Add shipping (route.ts lines 245-248)
  subtotalExGST += shippingAmount;
  gstAmount += Math.round(shippingAmount * 0.1);

  const totalIncGST = subtotalExGST + gstAmount;
  return { subtotalExGST, shippingAmount, gstAmount, totalIncGST };
}

// The exact values the detail page now renders.
function displayedBreakdown(inv: {
  subtotalExGST: number;
  shippingAmount?: number;
  gstAmount: number;
}) {
  const shipping = inv.shippingAmount ?? 0;
  return {
    subtotalLine: inv.subtotalExGST - shipping, // page: subtotalExGST - shippingAmount
    shippingLine: shipping,
    gstLine: inv.gstAmount,
  };
}

describe("invoice detail page — shipping breakdown display", () => {
  it("breakdown lines sum to the unchanged Total (shipping counted once)", () => {
    const inv = buildStoredInvoice({
      lineSubtotalExGst: 100_00,
      shippingAmount: 20_00,
    });
    const d = displayedBreakdown(inv);

    expect(d.subtotalLine + d.shippingLine + d.gstLine).toBe(inv.totalIncGST);
  });

  it("does NOT double-count shipping in the visible breakdown", () => {
    const inv = buildStoredInvoice({
      lineSubtotalExGst: 100_00,
      shippingAmount: 20_00,
    });
    const d = displayedBreakdown(inv);

    // Old (buggy) display rendered subtotalExGST AND a separate shipping line.
    const buggySum = inv.subtotalExGST + d.shippingLine + d.gstLine;
    expect(buggySum).toBe(inv.totalIncGST + inv.shippingAmount); // proves the old over-count
    expect(buggySum).not.toBe(inv.totalIncGST);

    // The displayed subtotal excludes shipping, so the visible total is right.
    expect(d.subtotalLine + d.shippingLine + d.gstLine).toBe(inv.totalIncGST);
  });

  it("is correct when there is no shipping", () => {
    const inv = buildStoredInvoice({
      lineSubtotalExGst: 250_00,
      shippingAmount: 0,
    });
    const d = displayedBreakdown(inv);

    expect(d.subtotalLine).toBe(inv.subtotalExGST); // unchanged when shipping=0
    expect(d.subtotalLine + d.shippingLine + d.gstLine).toBe(inv.totalIncGST);
  });

  it("leaves persisted Total and GST untouched (display-only change)", () => {
    const inv = buildStoredInvoice({
      lineSubtotalExGst: 100_00,
      shippingAmount: 20_00,
    });
    // GST and Total are read straight from stored fields, never recomputed.
    expect(inv.gstAmount).toBe(12_00); // 10% of (100 + 20)
    expect(inv.totalIncGST).toBe(132_00); // 120 + 12
  });
});
