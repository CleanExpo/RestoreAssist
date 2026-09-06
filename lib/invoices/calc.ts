/**
 * Single source of truth for invoice financial totals.
 *
 * This MUST mirror the server-side computation in
 * `app/api/invoices/route.ts` (POST) and `app/api/invoices/[id]/route.ts`
 * (PUT) exactly, so that the total a user approves on the create/edit
 * preview equals the total that gets persisted.
 *
 * RA-invoice-preview-correctness: the previous client previews hardcoded
 * `gst = round(subtotal * 0.1)` over the whole base, ignoring per-line
 * `gstRate` and applying a different rounding order than the server. That
 * could make the approved preview total diverge from the saved invoice
 * (e.g. a GST-free line item, or per-item rounding with many lines).
 *
 * AU/NZ GST note: the server intentionally charges GST on shipping/freight
 * using the tenant rate, which is generally correct for a
 * taxable supply. We do NOT change that tax treatment here — we only align
 * the preview to whatever the server already does.
 *
 * All money is in integer cents. Inputs match the API request shape:
 *   - lineItems[].unitPrice : cents (integer)
 *   - lineItems[].quantity  : number (may be fractional)
 *   - lineItems[].gstRate   : percent; defaults to the tenant rate
 *   - discountAmount        : cents (integer) — fixed-amount discount
 *   - discountPercentage    : percent (number)
 *   - shippingAmount        : cents (integer)
 */

export interface InvoiceCalcLineItem {
  quantity: number | string;
  unitPrice: number | string; // cents
  gstRate?: number | null;
}

export interface InvoiceCalcInput {
  lineItems: InvoiceCalcLineItem[];
  discountAmount?: number | null; // cents
  discountPercentage?: number | null; // percent
  shippingAmount?: number | null; // cents
  /**
   * Authoritative jurisdiction rate (10 AU / 15 NZ).
   *
   * Required, and deliberately so. It was optional with a `= 10` default,
   * which meant every caller that forgot it silently computed Australian GST:
   * shipping on a New Zealand variation was taxed at 10% instead of 15%. All
   * three callers had in fact forgotten it. A default here cannot be right —
   * the value belongs to the tenant or to the document's own currency, never
   * to this function — so the type now forces the caller to say.
   *
   * Resolve it from `getGstTreatment(country).ratePercent` for a new document,
   * or `getGstTreatmentForCurrency(doc.currency).ratePercent` for an existing
   * one, whose currency is immutable. See CLAUDE.md, "Single sources of truth".
   */
  defaultGstRatePercent: number;
}

export interface InvoiceCalcResult {
  subtotalExGST: number; // cents
  gstAmount: number; // cents
  totalIncGST: number; // cents
}

/**
 * Compute invoice totals identically to the create/update API routes.
 *
 * Mirrors, line-for-line, the server algorithm:
 *  1. per-item: subtotal = round(qty * unitPrice); itemGst = round(subtotal * gstRate/100)
 *  2. discount (amount OR percentage): subtract from subtotal, then scale the
 *     weighted gstAmount proportionally — gstAmount = round(gstAmount *
 *     (discountedSubtotal / preDiscountSubtotal))  [preserves per-item rates]
 *  3. shipping: subtotalExGST += shipping; GST uses defaultGstRatePercent
 *  4. totalIncGST = subtotalExGST + gstAmount
 */
export function calculateInvoiceTotals(
  input: InvoiceCalcInput,
): InvoiceCalcResult {
  const {
    lineItems,
    discountAmount,
    discountPercentage,
    shippingAmount,
    defaultGstRatePercent,
  } = input;

  let subtotalExGST = 0;
  let gstAmount = 0;

  for (const item of lineItems) {
    const quantity =
      typeof item.quantity === "string"
        ? parseFloat(item.quantity)
        : item.quantity;
    const unitPrice =
      typeof item.unitPrice === "string"
        ? parseInt(item.unitPrice, 10)
        : item.unitPrice;
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) continue;

    const subtotal = Math.round(quantity * unitPrice);
    const gstRate = item.gstRate ?? defaultGstRatePercent;
    const itemGst = Math.round(subtotal * (gstRate / 100));

    subtotalExGST += subtotal;
    gstAmount += itemGst;
  }

  // Apply discounts — matches server: scale the per-item-weighted GST total
  // proportionally to the discounted base (NOT a flat round(subtotal * 0.1),
  // which would override mixed per-item gstRate on a discounted invoice).
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

  // Add shipping — server charges GST on shipping/freight.
  if (shippingAmount) {
    subtotalExGST += shippingAmount;
    gstAmount += Math.round(
      shippingAmount * (defaultGstRatePercent / 100),
    );
  }

  const totalIncGST = subtotalExGST + gstAmount;

  return { subtotalExGST, gstAmount, totalIncGST };
}

/**
 * Format the current LOCAL calendar date as `YYYY-MM-DD` for use as the
 * default value of an `<input type="date">`.
 *
 * RA-invoice-preview-correctness: `new Date().toISOString().slice(0,10)`
 * formats in UTC, so an AEST/AEDT-evening user gets TOMORROW's date by
 * default (and SSR/client can disagree across the UTC-midnight boundary).
 * This uses the local timezone's calendar fields instead.
 */
export function toLocalDateInputValue(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Add `days` whole days to a date and return the LOCAL `YYYY-MM-DD` string.
 * Used to derive a default due date from the invoice date without UTC drift.
 */
export function addDaysLocalDateInputValue(
  startDate: Date,
  days: number,
): string {
  const d = new Date(startDate);
  d.setDate(d.getDate() + days);
  return toLocalDateInputValue(d);
}
