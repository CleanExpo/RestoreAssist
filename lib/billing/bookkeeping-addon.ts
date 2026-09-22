/**
 * RA-6920 B3 — Online Bookkeeping Connection recurring add-on (SSOT).
 *
 * Layer 2 gate on the Xero / QuickBooks / MYOB integration surfaces
 * (`app/api/integrations/oauth/[provider]/connect` and `.../sync`). A
 * recurring $11/month AUD subscription add-on whose active
 * `FeatureEntitlement` (sku BOOKKEEPING) unlocks connecting or triggering a
 * sync for one of the three bookkeeping providers. Priced inline via Stripe
 * `price_data` at checkout, so NO pre-created Stripe product or price is
 * required.
 *
 * Shared by:
 *   - app/api/addons/checkout/route.ts  (builds the subscription checkout)
 *   - app/api/webhooks/stripe/route.ts  (toggles the entitlement on lifecycle)
 * so the SKU key, price and the subscription-metadata marker never drift.
 */

import { isMyobEnabled, isQuickBooksEnabled } from "@/lib/flags/one-crm-flags";

/** The Prisma `AddonSku` value for this add-on (mirrors ADDON_SKUS). */
export const BOOKKEEPING_SKU = "BOOKKEEPING" as const;

/**
 * The `IntegrationProvider` values gated behind this add-on. ServiceM8 and
 * Ascora are the SERVICE_CRM add-on's providers, not this one — leave them
 * out.
 */
export const BOOKKEEPING_PROVIDERS = ["XERO", "QUICKBOOKS", "MYOB"] as const;

type BookkeepingProvider = (typeof BOOKKEEPING_PROVIDERS)[number];

/** Runtime type-guard: is this `IntegrationProvider` one of the three gated bookkeeping providers? */
export function isBookkeepingProvider(
  provider: string,
): provider is BookkeepingProvider {
  return (BOOKKEEPING_PROVIDERS as readonly string[]).includes(provider);
}

/**
 * `subscription_data.metadata.type` stamped on the Stripe Subscription at
 * checkout. The webhook reads it off `subscription.metadata` to distinguish
 * this add-on subscription from the base $99/month plan subscription (which
 * must NOT touch FeatureEntitlement) and from the other recurring add-ons.
 */
export const BOOKKEEPING_ADDON_SUBSCRIPTION_TYPE = "bookkeeping_addon" as const;

/**
 * RA-7660: buyer-facing copy names only the providers that are listed. Xero is
 * always listed; QuickBooks and MYOB have not passed a real sync test, so each
 * is named only once its NEXT_PUBLIC_* switch is on. Copy only: which
 * providers the entitlement gates (BOOKKEEPING_PROVIDERS) does not change.
 */
export function bookkeepingAddonDescription(listed: {
  quickbooks: boolean;
  myob: boolean;
}): string {
  const names = ["Xero"];
  if (listed.quickbooks) names.push("QuickBooks");
  if (listed.myob) names.push("MYOB");
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return `Connect and sync ${list}.`;
}

/**
 * Recurring price for the add-on. GST-inclusive (AU convention) so Stripe Tax
 * breaks out the 10% GST component rather than adding it on top of $11.
 */
export const BOOKKEEPING_ADDON = {
  sku: BOOKKEEPING_SKU,
  name: "Online Bookkeeping Connection",
  description: bookkeepingAddonDescription({
    quickbooks: isQuickBooksEnabled(),
    myob: isMyobEnabled(),
  }),
  /** Dollars, AUD, GST-inclusive. */
  amount: 11.0,
  currency: "AUD",
  interval: "month",
} as const;
