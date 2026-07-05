import { describe, it, expect } from "vitest";
import {
  SERVICE_CRM_SKU,
  SERVICE_CRM_ADDON_SUBSCRIPTION_TYPE,
  SERVICE_CRM_ADDON,
} from "../service-crm-addon";
import {
  getRecurringAddon,
  getRecurringAddonBySubscriptionType,
} from "../addon-registry";

describe("SERVICE_CRM_ADDON SSOT (RA-6920 B1)", () => {
  it("prices at $11/mo AUD", () => {
    expect(SERVICE_CRM_ADDON.amount).toBe(11.0);
    expect(SERVICE_CRM_ADDON.currency).toBe("AUD");
    expect(SERVICE_CRM_ADDON.interval).toBe("month");
  });

  it("sku matches the Prisma AddonSku value", () => {
    expect(SERVICE_CRM_SKU).toBe("SERVICE_CRM");
    expect(SERVICE_CRM_ADDON.sku).toBe("SERVICE_CRM");
  });
});

describe("SERVICE_CRM registered in the recurring add-on registry", () => {
  it("resolves by add-on key (the checkout route's lookup)", () => {
    const descriptor = getRecurringAddon("SERVICE_CRM");
    expect(descriptor).toBeDefined();
    expect(descriptor?.subscriptionType).toBe(SERVICE_CRM_ADDON_SUBSCRIPTION_TYPE);
    expect(descriptor?.amount).toBe(11.0);
  });

  it("resolves by subscription metadata marker (the webhook's reverse lookup)", () => {
    const descriptor = getRecurringAddonBySubscriptionType(
      SERVICE_CRM_ADDON_SUBSCRIPTION_TYPE,
    );
    expect(descriptor?.sku).toBe("SERVICE_CRM");
  });
});
