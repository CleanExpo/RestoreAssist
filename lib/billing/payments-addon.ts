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
 * SCOPE: this SKU gates the manual bank-deposit payment-recording feature.
 * P1-MNY-01 built invoice card payments on Stripe Connect (Standard accounts,
 * direct charges to the firm's own Stripe account) and also requires this
 * SKU for them, but they stay OFF behind INVOICE_ONLINE_PAYMENT_ENABLED until
 * the founder enables them. While that flag is off, the customer-facing
 * description below (bank deposit only) is the true one; change it in the
 * same release that turns card payments on.
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
