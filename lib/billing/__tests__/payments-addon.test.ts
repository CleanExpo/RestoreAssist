/**
 * RA-6920 B4 — PAYMENTS add-on registered in the recurring add-on registry.
 *
 * Checkout-route and webhook genericity over the registry (no per-SKU branch)
 * is already proven by the B0 fixture-addon tests
 * (app/api/addons/checkout/__tests__/registry-recurring-addon.test.ts and
 * app/api/webhooks/stripe/__tests__/registry-addon-entitlement.test.ts). This
 * test exercises the REAL registry to prove PAYMENTS resolves to a correct,
 * uniquely-keyed descriptor — i.e. checkout would price it at $11/mo AUD and
 * the webhook would recognise its lifecycle marker.
 */

import { describe, expect, it } from "vitest";
import {
  getRecurringAddon,
  getRecurringAddonBySubscriptionType,
  RECURRING_ADDONS,
} from "../addon-registry";
import {
  PAYMENTS_ADDON,
  PAYMENTS_ADDON_SUBSCRIPTION_TYPE,
  PAYMENTS_SKU,
} from "../payments-addon";

describe("PAYMENTS add-on registry entry", () => {
  it("prices the add-on at $11/mo AUD, GST-inclusive", () => {
    expect(PAYMENTS_ADDON.sku).toBe("PAYMENTS");
    expect(PAYMENTS_ADDON.amount).toBe(11.0);
    expect(PAYMENTS_ADDON.currency).toBe("AUD");
    expect(PAYMENTS_ADDON.interval).toBe("month");
  });

  it("resolves by addon key via getRecurringAddon", () => {
    const descriptor = getRecurringAddon(PAYMENTS_SKU);
    expect(descriptor).toBeDefined();
    expect(descriptor?.subscriptionType).toBe(PAYMENTS_ADDON_SUBSCRIPTION_TYPE);
    expect(descriptor?.amount).toBe(11.0);
  });

  it("resolves back by subscription metadata marker via getRecurringAddonBySubscriptionType", () => {
    const descriptor = getRecurringAddonBySubscriptionType(
      PAYMENTS_ADDON_SUBSCRIPTION_TYPE,
    );
    expect(descriptor?.sku).toBe("PAYMENTS");
  });

  it("has a subscriptionType that is globally unique across the registry", () => {
    const types = Object.values(RECURRING_ADDONS).map((d) => d.subscriptionType);
    expect(new Set(types).size).toBe(types.length);
  });
});
