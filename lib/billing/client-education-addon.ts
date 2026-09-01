/**
 * Client Education Library recurring add-on (SSOT).
 *
 * Layer 2 gate on the client-facing explainer library and the `/learn` kiosk
 * view of the client portal — the tablet a technician hands the homeowner so
 * they can read who is on site, what the equipment does, how long it stays and
 * what "done" looks like, instead of stopping the technician to ask. A recurring
 * $11/month AUD subscription add-on whose active `FeatureEntitlement` (sku
 * CLIENT_EDUCATION) unlocks it. Priced inline via Stripe `price_data` at
 * checkout, so NO pre-created Stripe product or price is required. Mirrors the
 * shipped CLIENT_COMMS add-on (RA-6954).
 *
 * WHY THIS IS NOT FOLDED INTO CLIENT_COMMS, which is also $11/month: that SKU is
 * scoped narrowly to "Send clients automated Restoration Pulse status emails"
 * (`lib/billing/client-comms-addon.ts`). A firm may want the education library
 * without Pulse emails, or Pulse emails without the library. Two capabilities,
 * two entitlements.
 *
 * FLAT, PER COMPANY — never per technician. `perSeat` is deliberately absent, so
 * the shared checkout bills Stripe `quantity: 1` and the webhook leaves
 * `FeatureEntitlement.seats` null. Adding a field technician must not change
 * this price. TECHNICIAN_SEATS is the ONLY quantity-based add-on.
 *
 * Registered in `lib/billing/addon-registry.ts`, which both
 * `app/api/addons/checkout/route.ts` and `app/api/webhooks/stripe/route.ts`
 * read from — no edits needed to either route for this add-on.
 */

/** The Prisma `AddonSku` value for this add-on (mirrors ADDON_SKUS). */
export const CLIENT_EDUCATION_SKU = "CLIENT_EDUCATION" as const;

/**
 * `subscription_data.metadata.type` stamped on the Stripe Subscription at
 * checkout. The webhook reads it off `subscription.metadata` to distinguish
 * this add-on subscription from the base $99/month plan subscription (which
 * must NOT touch FeatureEntitlement) and from every other add-on. MUST stay
 * globally unique across the registry.
 */
export const CLIENT_EDUCATION_ADDON_SUBSCRIPTION_TYPE =
  "client_education_addon" as const;

/**
 * Recurring price for the add-on. GST-inclusive (AU convention) so Stripe Tax
 * breaks out the 10% GST component rather than adding it on top of $11. Do not
 * re-derive GST here — `lib/gst-rules.ts` is the SSOT (AU 10%, NZ 15%).
 */
export const CLIENT_EDUCATION_ADDON = {
  sku: CLIENT_EDUCATION_SKU,
  name: "Client Education Library",
  description:
    "Give clients an on-site video and guide library explaining the restoration process.",
  /** Dollars, AUD, GST-inclusive. */
  amount: 11.0,
  currency: "AUD",
  interval: "month",
} as const;
