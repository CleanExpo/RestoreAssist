/**
 * RA-6920 B4 — Payments Collection recurring add-on (SSOT).
 *
 * Layer 2 of the manual/bank-deposit payment-recording gate. A recurring
 * $11/month AUD subscription add-on whose active `FeatureEntitlement` (sku
 * PAYMENTS) unlocks recording a payment against an invoice via the
 * bank-deposit path (`app/api/invoices/[id]/payments`). Priced inline via
 * Stripe `price_data` at checkout, so NO pre-created Stripe product or price
 * is required.
 *
 * SCOPE: this SKU gates the EXISTING manual bank-deposit payment-recording
 * feature only. The Stripe Connect payment rail (client-account onboarding
 * for payment links) is a separate, owner-gated (O1) phase
 * (byok-monetisation-spec §5, "P2b — Stripe Connect rail") and is
 * intentionally out of scope here.
 *
 * Shared by:
 *   - app/api/addons/checkout/route.ts  (builds the subscription checkout)
 *   - app/api/webhooks/stripe/route.ts  (toggles the entitlement on lifecycle)
 * so the SKU key, price and the subscription-metadata marker never drift.
 */

/** The Prisma `AddonSku` value for this add-on (mirrors ADDON_SKUS). */
export const PAYMENTS_SKU = "PAYMENTS" as const;

/**
 * `subscription_data.metadata.type` stamped on the Stripe Subscription at
 * checkout. The webhook reads it off `subscription.metadata` to distinguish
 * this add-on subscription from the base $99/month plan subscription (which
 * must NOT touch FeatureEntitlement, and whose own handlers must NOT be run for
 * an add-on subscription id).
 */
export const PAYMENTS_ADDON_SUBSCRIPTION_TYPE = "payments_addon" as const;

/**
 * Recurring price for the add-on. GST-inclusive (AU convention) so Stripe Tax
 * breaks out the 10% GST component rather than adding it on top of $11.
 */
export const PAYMENTS_ADDON = {
  sku: PAYMENTS_SKU,
  name: "Payments Collection",
  description: "Record client payments against invoices via bank deposit.",
  /** Dollars, AUD, GST-inclusive. */
  amount: 11.0,
  currency: "AUD",
  interval: "month",
} as const;
