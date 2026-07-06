/**
 * RA-6920 B6 — Field Technician Seats recurring add-on (SSOT).
 *
 * The LAST BYOK-monetisation add-on and the only QUANTITY-BASED one: $11/month
 * AUD GST-inclusive PER SEAT. A workspace buys N seats in one subscription
 * (`quantity: N`), and its `FeatureEntitlement` (sku TECHNICIAN_SEATS) records
 * both `active` and the purchased `seats` count. Priced inline via Stripe
 * `price_data` at checkout, so NO pre-created Stripe product or price is
 * required. Mirrors the shipped flat add-ons (FLOORPLAN_UNDERLAY / SERVICE_CRM /
 * BOOKKEEPING / PAYMENTS / CLIENT_COMMS) except for the per-seat quantity.
 *
 * SCOPE (RA-6920 B6): this SSOT + registry entry + the entitlement-quantity
 * plumbing (checkout `quantity`, webhook `seats`) is the BILLING half. The
 * ENFORCEMENT half — blocking a technician invite beyond the entitled seat
 * count — is DEFERRED: the seat entitlement lives on `Workspace` while the
 * technician roster lives on the separate `Organization`/`User` tenancy model
 * with no linking key, and no base-plan included-seat count is defined
 * anywhere. Wiring the block requires that bridge + a base allowance (see the
 * PR body spec), so it is intentionally NOT wired here rather than fabricated.
 *
 * Registered in `lib/billing/addon-registry.ts`, which both
 * `app/api/addons/checkout/route.ts` and `app/api/webhooks/stripe/route.ts`
 * read from — no per-SKU edits needed to either route for this add-on.
 */

/** The Prisma `AddonSku` value for this add-on (mirrors ADDON_SKUS). */
export const TECHNICIAN_SEATS_SKU = "TECHNICIAN_SEATS" as const;

/**
 * `subscription_data.metadata.type` stamped on the Stripe Subscription at
 * checkout. The webhook reads it off `subscription.metadata` to distinguish
 * this add-on subscription from the base $99/month plan subscription (which
 * must NOT touch FeatureEntitlement) and from every other add-on.
 */
export const TECHNICIAN_SEATS_ADDON_SUBSCRIPTION_TYPE =
  "technician_seats_addon" as const;

/**
 * Recurring price for the add-on. GST-inclusive (AU convention) so Stripe Tax
 * breaks out the 10% GST component rather than adding it on top of $11.
 *
 * `perSeat: true` is the ONLY add-on marker that opts the shared checkout into
 * a buyer-supplied `quantity` (all flat add-ons stay `quantity: 1`), and opts
 * the shared webhook into persisting the purchased `seats` count on the
 * entitlement. `amount` is the price of ONE seat.
 */
export const TECHNICIAN_SEATS_ADDON = {
  sku: TECHNICIAN_SEATS_SKU,
  name: "Field Technician Seat",
  description: "Add a field technician seat to your team.",
  /** Dollars per seat, AUD, GST-inclusive. */
  amount: 11.0,
  currency: "AUD",
  interval: "month",
  /** Quantity-based: the checkout accepts a seat count and the webhook stores it. */
  perSeat: true,
} as const;

/**
 * Hard ceiling on seats purchasable in a single checkout — a boundary guard on
 * untrusted buyer input (not a product limit). Keeps a fat-fingered or
 * malicious `quantity` from creating an absurd subscription line.
 */
export const TECHNICIAN_SEATS_MAX_PER_CHECKOUT = 100;
