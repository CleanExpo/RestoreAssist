/**
 * Canonical presentation of a variation (change-order) invoice's amount.
 *
 * A variation is itself an `Invoice` row (self-relation `InvoiceVariations`),
 * and its `totalIncGST` is the SIGNED source of truth in cents:
 *   - An ADDITION is created with positive line-item unit prices, so its
 *     stored `totalIncGST` is positive.
 *   - A REDUCTION is created with negative line-item unit prices
 *     (see app/api/invoices/[id]/variations/route.ts), so the server stores
 *     a negative `subtotalExGST`, `gstAmount`, and therefore a negative
 *     `totalIncGST`.
 *
 * Both the variations list page and the invoice detail page must render this
 * single signed value identically. This helper is the one place that decides
 * the sign and formatting so the two screens cannot drift apart.
 */

/** Format signed cents as AUD, e.g. 50000 → "$500.00", -50000 → "-$500.00". */
function formatSignedAUD(cents: number): string {
  // Intl renders the minus sign for negatives; we keep the standard AUD shape
  // and add an explicit "+" for positive deltas so additions read as increases.
  const formatted = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
  return cents > 0 ? `+${formatted}` : formatted;
}

export interface VariationAmountDisplay {
  /** The signed amount in cents, taken directly from the stored `totalIncGST`. */
  cents: number;
  /** Formatted, signed AUD string (e.g. "+$500.00", "-$500.00", "$0.00"). */
  value: string;
  /** True when the variation increases the bill (>= 0); drives colour. */
  positive: boolean;
}

/**
 * Derive the canonical display for a variation amount from its stored,
 * already-signed `totalIncGST` (in cents). Use on BOTH the variations list
 * page and the invoice detail page so they always agree.
 */
export function getVariationAmountDisplay(
  totalIncGSTCents: number,
): VariationAmountDisplay {
  // Normalise -0 to 0 so a zero variation never renders "-$0.00".
  const cents = Object.is(totalIncGSTCents, -0) ? 0 : totalIncGSTCents;
  return {
    cents,
    value: formatSignedAUD(cents),
    positive: cents >= 0,
  };
}
