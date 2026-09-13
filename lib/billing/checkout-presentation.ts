/**
 * RA-7541 — Checkout presentment for the $99 Monthly Plan.
 *
 * Public copy (`PRICING_CONFIG.pricing.monthly`) is $99 AUD GST-inclusive.
 * Stripe Checkout still defaulted to Adaptive Pricing + the shared CARSI
 * Pty Ltd account business name, so a US-IP walk showed ~$73.85 USD and
 * "Pay CARSI Pty Ltd". Session params here pin currency, locale, Adaptive
 * Pricing, and the RestoreAssist display name so the hosted page matches
 * the catalog.
 *
 * Settlement currency still comes from the Stripe Price. `assertCatalogPrice`
 * fail-closes when `STRIPE_PRICE_MONTHLY` is not AUD $99.
 */

import { PRICING_CONFIG } from "@/lib/pricing";

export const RESTOREASSIST_MERCHANT_NAME = "RestoreAssist";

/** Card-statement descriptor — Stripe max 22 characters, letters required. */
export const RESTOREASSIST_STATEMENT_DESCRIPTOR = "RESTOREASSIST";

/** Stripe Customer preferred_locales — BCP 47, not the Checkout Session enum. */
export type CustomerPreferredLocale = "en-AU" | "en-NZ";

/**
 * Hosted Checkout `locale` allowlist has `en` / `en-GB` but not `en-AU` or
 * `en-NZ`. Passing an unlisted value can 400 the session create — use `en`
 * and pin AUD separately via `currency` + Adaptive Pricing off.
 */
export type CheckoutSessionLocale = "en";
export type CheckoutCurrency = "aud";

export type CheckoutPresentationParams = {
  currency: CheckoutCurrency;
  locale: CheckoutSessionLocale;
  adaptive_pricing: { enabled: false };
  branding_settings: { display_name: string };
  custom_text: { submit: { message: string } };
};

export function catalogMonthlyAmountCents(): number {
  return Math.round(PRICING_CONFIG.pricing.monthly.amount * 100);
}

export function catalogMonthlyCurrency(): CheckoutCurrency {
  const currency = PRICING_CONFIG.pricing.monthly.currency.toLowerCase();
  if (currency !== "aud") {
    throw new Error(
      `PRICING_CONFIG.pricing.monthly.currency must be AUD, got ${PRICING_CONFIG.pricing.monthly.currency}`,
    );
  }
  return currency;
}

/** NZ orgs get en-NZ customer copy; the sellable SKU stays AUD. */
export function customerPreferredLocaleForCountry(
  country: string | null | undefined,
): CustomerPreferredLocale {
  return country === "NZ" ? "en-NZ" : "en-AU";
}

export function checkoutSessionLocale(): CheckoutSessionLocale {
  return "en";
}

export function billingCountryFromOrg(
  country: string | null | undefined,
): "AU" | "NZ" {
  return country === "NZ" ? "NZ" : "AU";
}

export function monthlyCheckoutSubmitCopy(): string {
  const { displayName, amount, currency } = PRICING_CONFIG.pricing.monthly;
  return `RestoreAssist ${displayName} — $${amount} ${currency} including GST.`;
}

export function monthlyCheckoutPresentation(_input?: {
  country?: string | null;
}): CheckoutPresentationParams {
  return {
    currency: catalogMonthlyCurrency(),
    locale: checkoutSessionLocale(),
    // Overrides the Dashboard Adaptive Pricing default so a US-IP walker
    // cannot be shown a converted USD presentment of the AUD catalog.
    adaptive_pricing: { enabled: false },
    branding_settings: {
      display_name: RESTOREASSIST_MERCHANT_NAME,
    },
    custom_text: {
      submit: { message: monthlyCheckoutSubmitCopy() },
    },
  };
}

export type CatalogPriceCheck =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * The allowlisted Price must match the public $99 AUD catalog. A USD Price
 * (or a different unit_amount) is how public copy and Checkout disagree.
 */
export function assertCatalogPrice(price: {
  currency?: string | null;
  unit_amount?: number | null;
}): CatalogPriceCheck {
  const expectedCurrency = catalogMonthlyCurrency();
  const expectedAmount = catalogMonthlyAmountCents();
  const currency = (price.currency ?? "").toLowerCase();

  if (currency !== expectedCurrency) {
    return {
      ok: false,
      reason: `STRIPE_PRICE_MONTHLY is ${currency || "unset"} but the public catalog is $${PRICING_CONFIG.pricing.monthly.amount} ${expectedCurrency.toUpperCase()}.`,
    };
  }
  if (price.unit_amount !== expectedAmount) {
    return {
      ok: false,
      reason: `STRIPE_PRICE_MONTHLY unit_amount is ${String(price.unit_amount)} but the public catalog is ${expectedAmount} cents.`,
    };
  }
  return { ok: true };
}

/**
 * Subscription charges take statement_descriptor from the Product, not the
 * Checkout Session. Return a patch when the expanded Product still carries
 * the shared CARSI account default (or nothing).
 */
export function productStatementDescriptorPatch(
  product: unknown,
): { id: string; statement_descriptor: string } | null {
  if (!product || typeof product !== "object") return null;
  if ("deleted" in product && (product as { deleted?: unknown }).deleted) {
    return null;
  }
  const id = (product as { id?: unknown }).id;
  if (typeof id !== "string" || id.length === 0) return null;
  const current = (product as { statement_descriptor?: unknown })
    .statement_descriptor;
  if (current === RESTOREASSIST_STATEMENT_DESCRIPTOR) return null;
  return {
    id,
    statement_descriptor: RESTOREASSIST_STATEMENT_DESCRIPTOR,
  };
}
