/**
 * RA-6954 — Restoration Pulse client-comms recurring add-on (SSOT).
 *
 * Layer 2 gate on the Restoration Pulse client-facing email sends
 * (`lib/pulse/dispatcher.ts` step-transition / drying-goal-change / daily
 * digest / Code of Practice update, and `lib/pulse/review-ask.ts` post-close
 * review-ask). A recurring $11/month AUD subscription add-on whose active
 * `FeatureEntitlement` (sku CLIENT_COMMS) unlocks sending those emails to the
 * client. Priced inline via Stripe `price_data` at checkout, so NO
 * pre-created Stripe product or price is required. Mirrors the shipped
 * FLOORPLAN_UNDERLAY add-on (RA-6922).
 *
 * SCOPE (RA-6954): this is the client-comms-monetisation half of the ticket
 * only. The V2 sketch-moisture-heatmap half is out of scope — it waits on
 * the V2 sketch tool.
 *
 * Registered in `lib/billing/addon-registry.ts`, which both
 * `app/api/addons/checkout/route.ts` and `app/api/webhooks/stripe/route.ts`
 * read from — no edits needed to either route for this add-on.
 */

/** The Prisma `AddonSku` value for this add-on (mirrors ADDON_SKUS). */
export const CLIENT_COMMS_SKU = "CLIENT_COMMS" as const;

/**
 * `subscription_data.metadata.type` stamped on the Stripe Subscription at
 * checkout. The webhook reads it off `subscription.metadata` to distinguish
 * this add-on subscription from the base $99/month plan subscription (which
 * must NOT touch FeatureEntitlement) and from every other add-on.
 */
export const CLIENT_COMMS_ADDON_SUBSCRIPTION_TYPE = "client_comms_addon" as const;

/**
 * Recurring price for the add-on. GST-inclusive (AU convention) so Stripe Tax
 * breaks out the 10% GST component rather than adding it on top of $11.
 */
export const CLIENT_COMMS_ADDON = {
  sku: CLIENT_COMMS_SKU,
  name: "Restoration Pulse Client Comms",
  description: "Send clients automated Restoration Pulse status emails.",
  /** Dollars, AUD, GST-inclusive. */
  amount: 11.0,
  currency: "AUD",
  interval: "month",
} as const;
