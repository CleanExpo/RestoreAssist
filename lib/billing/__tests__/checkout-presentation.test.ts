/**
 * RA-7541 — catalog presentment for the $99 Monthly Plan Checkout session.
 *
 * Control: a USD / $73.85 Price must fail `assertCatalogPrice` (the SPM
 * walk number). The happy path must pin AUD, disable Adaptive Pricing, and
 * show RestoreAssist — not CARSI Pty Ltd.
 */

import { describe, expect, it } from "vitest";
import { PRICING_CONFIG } from "@/lib/pricing";
import {
  RESTOREASSIST_MERCHANT_NAME,
  RESTOREASSIST_STATEMENT_DESCRIPTOR,
  assertCatalogPrice,
  billingCountryFromOrg,
  catalogMonthlyAmountCents,
  catalogMonthlyCurrency,
  checkoutSessionLocale,
  customerPreferredLocaleForCountry,
  monthlyCheckoutPresentation,
  monthlyCheckoutSubmitCopy,
  productStatementDescriptorPatch,
} from "../checkout-presentation";

describe("RA-7541 checkout presentation", () => {
  it("catalog monthly SKU is $99 AUD (cents)", () => {
    expect(catalogMonthlyCurrency()).toBe("aud");
    expect(catalogMonthlyAmountCents()).toBe(9900);
    expect(PRICING_CONFIG.pricing.monthly.amount).toBe(99);
    expect(PRICING_CONFIG.pricing.monthly.currency).toBe("AUD");
  });

  it("AU (and missing country) get en-AU customer locale; NZ gets en-NZ", () => {
    expect(customerPreferredLocaleForCountry("AU")).toBe("en-AU");
    expect(customerPreferredLocaleForCountry(null)).toBe("en-AU");
    expect(customerPreferredLocaleForCountry(undefined)).toBe("en-AU");
    expect(customerPreferredLocaleForCountry("US")).toBe("en-AU");
    expect(customerPreferredLocaleForCountry("NZ")).toBe("en-NZ");
    expect(billingCountryFromOrg(undefined)).toBe("AU");
    expect(billingCountryFromOrg("NZ")).toBe("NZ");
    // Hosted Checkout has no en-AU / en-NZ on its locale enum.
    expect(checkoutSessionLocale()).toBe("en");
  });

  it("AU session pins AUD, disables Adaptive Pricing, and names RestoreAssist", () => {
    const params = monthlyCheckoutPresentation({ country: "AU" });
    expect(params.currency).toBe("aud");
    expect(params.locale).toBe("en");
    expect(params.adaptive_pricing).toEqual({ enabled: false });
    expect(params.branding_settings.display_name).toBe(
      RESTOREASSIST_MERCHANT_NAME,
    );
    expect(params.branding_settings.display_name).not.toMatch(/CARSI/i);
    expect(params.custom_text.submit.message).toBe(
      monthlyCheckoutSubmitCopy("AU"),
    );
    expect(params.custom_text.submit.message).toMatch(/\$99 AUD/);
    expect(params.custom_text.submit.message).toMatch(/10% GST/);
  });

  it("NZ org still settles the single catalog in AUD and names 15% GST", () => {
    const params = monthlyCheckoutPresentation({ country: "NZ" });
    expect(params.locale).toBe("en");
    expect(params.currency).toBe("aud");
    expect(params.adaptive_pricing.enabled).toBe(false);
    expect(params.custom_text.submit.message).toMatch(/15% GST/);
  });

  it("accepts the catalog Price (AUD 9900)", () => {
    expect(
      assertCatalogPrice({ currency: "aud", unit_amount: 9900 }),
    ).toEqual({ ok: true });
    expect(
      assertCatalogPrice({ currency: "AUD", unit_amount: 9900 }),
    ).toEqual({ ok: true });
  });

  it("rejects the SPM USD presentment (~$73.85) and other currency drift", () => {
    const usdConverted = assertCatalogPrice({
      currency: "usd",
      unit_amount: 7385,
    });
    expect(usdConverted.ok).toBe(false);
    if (usdConverted.ok) throw new Error("expected rejection");
    expect(usdConverted.reason).toMatch(/usd/i);
    expect(usdConverted.reason).toMatch(/AUD/);

    const wrongAmount = assertCatalogPrice({
      currency: "aud",
      unit_amount: 99000,
    });
    expect(wrongAmount.ok).toBe(false);
    if (wrongAmount.ok) throw new Error("expected rejection");
    expect(wrongAmount.reason).toMatch(/99000/);
    expect(wrongAmount.reason).toMatch(/9900/);
  });

  it("patches a CARSI / empty Product statement descriptor to RESTOREASSIST", () => {
    expect(RESTOREASSIST_STATEMENT_DESCRIPTOR.length).toBeLessThanOrEqual(22);
    expect(
      productStatementDescriptorPatch({
        id: "prod_1",
        statement_descriptor: "CARSI PTY LTD",
      }),
    ).toEqual({
      id: "prod_1",
      statement_descriptor: RESTOREASSIST_STATEMENT_DESCRIPTOR,
    });
    expect(
      productStatementDescriptorPatch({
        id: "prod_1",
        statement_descriptor: null,
      }),
    ).toEqual({
      id: "prod_1",
      statement_descriptor: RESTOREASSIST_STATEMENT_DESCRIPTOR,
    });
    expect(
      productStatementDescriptorPatch({
        id: "prod_1",
        statement_descriptor: RESTOREASSIST_STATEMENT_DESCRIPTOR,
      }),
    ).toBeNull();
    expect(productStatementDescriptorPatch("prod_1")).toBeNull();
    expect(
      productStatementDescriptorPatch({ id: "prod_1", deleted: true }),
    ).toBeNull();
  });
});
