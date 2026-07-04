/**
 * RA-6922 — Floor Plan Underlay recurring add-on (SSOT).
 *
 * Layer 2 of the internet-floorplan-overlay gate. A recurring $11/month AUD
 * subscription add-on whose active `FeatureEntitlement` (sku FLOORPLAN_UNDERLAY)
 * unlocks the floor-plan underlay scrape (`app/api/properties/scrape`). Priced
 * inline via Stripe `price_data` at checkout, so NO pre-created Stripe product
 * or price is required.
 *
 * Shared by:
 *   - app/api/addons/checkout/route.ts  (builds the subscription checkout)
 *   - app/api/webhooks/stripe/route.ts  (toggles the entitlement on lifecycle)
 * so the SKU key, price and the subscription-metadata marker never drift.
 */

/** The Prisma `AddonSku` value for this add-on (mirrors ADDON_SKUS). */
export const FLOORPLAN_UNDERLAY_SKU = "FLOORPLAN_UNDERLAY" as const;

/**
 * `subscription_data.metadata.type` stamped on the Stripe Subscription at
 * checkout. The webhook reads it off `subscription.metadata` to distinguish
 * this add-on subscription from the base $99/month plan subscription (which
 * must NOT touch FeatureEntitlement, and whose own handlers must NOT be run for
 * an add-on subscription id).
 */
export const FLOORPLAN_ADDON_SUBSCRIPTION_TYPE = "floorplan_underlay_addon" as const;

/**
 * Recurring price for the add-on. GST-inclusive (AU convention) so Stripe Tax
 * breaks out the 10% GST component rather than adding it on top of $11.
 */
export const FLOORPLAN_UNDERLAY_ADDON = {
  sku: FLOORPLAN_UNDERLAY_SKU,
  name: "Floor Plan Underlay",
  description: "Fetch and trace property floor plans from listing sites.",
  /** Dollars, AUD, GST-inclusive. */
  amount: 11.0,
  currency: "AUD",
  interval: "month",
} as const;
