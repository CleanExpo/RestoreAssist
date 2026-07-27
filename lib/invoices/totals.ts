/**
 * Single source of truth for invoice money maths (RA-7096).
 *
 * Why this file exists: `app/api/invoices/route.ts` and
 * `app/api/invoices/[id]/variations/route.ts` each carried their own copy of
 * this calculation. The copies drifted — the variations route recomputed GST
 * as a flat 10% of the adjusted subtotal, discarding the per-line rates it had
 * just summed, and persisted `gstRate: item.gstRate || 10`, which coerces a
 * GST-free 0% line to 10% because `0 || 10 === 10`. The invoices route had
 * already been fixed and even carries a comment describing the defect, but the
 * fix was never ported. Duplicated money logic is the root cause; keep it here.
 *
 * All amounts are in CENTS. Rates are percentages (10 means 10%).
 */

export interface InvoiceLineItemInput {
  quantity: number;
  /** Cents. */
  unitPrice: number;
  /** Percentage. Omitted/null means "not specified" and defaults to 10 — an explicit 0 is honoured. */
  gstRate?: number | null;
  [key: string]: unknown;
}

export interface ComputedLineItem {
  quantity: number;
  unitPrice: number;
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  total: number;
}

export interface InvoiceTotalsInput {
  lineItems: InvoiceLineItemInput[];
  /** Cents. */
  discountAmount?: number | null;
  /** Percentage. */
  discountPercentage?: number | null;
  /** Cents. */
  shippingAmount?: number | null;
}

export interface InvoiceTotals {
  /** Ex-GST, after discount and shipping. Cents. */
  subtotal: number;
  /** Cents. */
  gst: number;
  /** Cents. */
  total: number;
  lineItems: ComputedLineItem[];
}

export const DEFAULT_GST_RATE = 10;

export function computeInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  let subtotal = 0;
  let gst = 0;

  const lineItems: ComputedLineItem[] = input.lineItems.map((item) => {
    // `??` not `||` — an explicit 0 is a GST-free supply, not a missing value.
    const gstRate = item.gstRate ?? DEFAULT_GST_RATE;
    const lineSubtotal = Math.round(item.quantity * item.unitPrice);
    const gstAmount = Math.round(lineSubtotal * (gstRate / 100));

    subtotal += lineSubtotal;
    gst += gstAmount;

    return {
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: lineSubtotal,
      gstRate,
      gstAmount,
      total: lineSubtotal + gstAmount,
    };
  });

  // Scale the per-line-weighted GST proportionally to the discounted base
  // rather than recomputing at a flat rate. For an all-10% invoice this is
  // identical; for any mixed-rate or GST-free line a flat recompute is wrong.
  const preDiscountSubtotal = subtotal;
  const scaleGst = () => {
    gst =
      preDiscountSubtotal > 0
        ? Math.round(gst * (subtotal / preDiscountSubtotal))
        : 0;
  };

  if (input.discountAmount) {
    subtotal -= Math.round(input.discountAmount);
    scaleGst();
  } else if (input.discountPercentage) {
    subtotal -= Math.round(subtotal * (input.discountPercentage / 100));
    scaleGst();
  }

  // Shipping is added after GST scaling: it is not part of the line-item base
  // the per-line rates were derived from.
  if (input.shippingAmount) {
    subtotal += Math.round(input.shippingAmount);
  }

  return { subtotal, gst, total: subtotal + gst, lineItems };
}
