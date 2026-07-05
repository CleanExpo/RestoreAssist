/**
 * RA-6920 B1 — Service CRM Connection recurring add-on (SSOT).
 *
 * A recurring $11/month AUD subscription add-on whose active
 * `FeatureEntitlement` (sku SERVICE_CRM) unlocks connecting a service CRM —
 * Ascora (`app/api/ascora/connect`, `app/api/ascora/sync`) or DR-NRPG
 * (`app/api/dr-nrpg/connect`). Priced inline via Stripe `price_data` at
 * checkout, so NO pre-created Stripe product or price is required. Mirrors
 * the shipped FLOORPLAN_UNDERLAY add-on (RA-6922).
 *
 * Registered in `lib/billing/addon-registry.ts`, which both
 * `app/api/addons/checkout/route.ts` and `app/api/webhooks/stripe/route.ts`
 * read from — no edits needed to either route for this add-on.
 */

/** The Prisma `AddonSku` value for this add-on (mirrors ADDON_SKUS). */
export const SERVICE_CRM_SKU = "SERVICE_CRM" as const;

/**
 * `subscription_data.metadata.type` stamped on the Stripe Subscription at
 * checkout. The webhook reads it off `subscription.metadata` to distinguish
 * this add-on subscription from the base $99/month plan subscription (which
 * must NOT touch FeatureEntitlement) and from every other add-on.
 */
export const SERVICE_CRM_ADDON_SUBSCRIPTION_TYPE = "service_crm_addon" as const;

/**
 * Recurring price for the add-on. GST-inclusive (AU convention) so Stripe Tax
 * breaks out the 10% GST component rather than adding it on top of $11.
 */
export const SERVICE_CRM_ADDON = {
  sku: SERVICE_CRM_SKU,
  name: "Service CRM Connection",
  description: "Connect Ascora or DR-NRPG to sync jobs and pricing data.",
  /** Dollars, AUD, GST-inclusive. */
  amount: 11.0,
  currency: "AUD",
  interval: "month",
} as const;
