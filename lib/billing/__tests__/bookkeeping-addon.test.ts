/**
 * RA-6920 B3 — BOOKKEEPING add-on SSOT values + provider guard.
 */

import { describe, expect, it } from "vitest";
import {
  BOOKKEEPING_ADDON,
  BOOKKEEPING_ADDON_SUBSCRIPTION_TYPE,
  BOOKKEEPING_PROVIDERS,
  BOOKKEEPING_SKU,
  isBookkeepingProvider,
} from "../bookkeeping-addon";

describe("BOOKKEEPING_ADDON", () => {
  it("prices at $11/mo AUD, GST-inclusive", () => {
    expect(BOOKKEEPING_ADDON.sku).toBe("BOOKKEEPING");
    expect(BOOKKEEPING_ADDON.amount).toBe(11.0);
    expect(BOOKKEEPING_ADDON.currency).toBe("AUD");
    expect(BOOKKEEPING_ADDON.interval).toBe("month");
  });

  it("exposes the sku and subscription-type markers used by checkout + webhook", () => {
    expect(BOOKKEEPING_SKU).toBe("BOOKKEEPING");
    expect(BOOKKEEPING_ADDON_SUBSCRIPTION_TYPE).toBe("bookkeeping_addon");
  });
});

describe("isBookkeepingProvider", () => {
  it("gates Xero, QuickBooks and MYOB", () => {
    expect(BOOKKEEPING_PROVIDERS).toEqual(["XERO", "QUICKBOOKS", "MYOB"]);
    expect(isBookkeepingProvider("XERO")).toBe(true);
    expect(isBookkeepingProvider("QUICKBOOKS")).toBe(true);
    expect(isBookkeepingProvider("MYOB")).toBe(true);
  });

  it("does not gate the SERVICE_CRM add-on's providers", () => {
    expect(isBookkeepingProvider("SERVICEM8")).toBe(false);
    expect(isBookkeepingProvider("ASCORA")).toBe(false);
  });
});
