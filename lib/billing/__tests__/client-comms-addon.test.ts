/**
 * RA-6954 — CLIENT_COMMS add-on SSOT values.
 */

import { describe, expect, it } from "vitest";
import {
  CLIENT_COMMS_ADDON,
  CLIENT_COMMS_ADDON_SUBSCRIPTION_TYPE,
  CLIENT_COMMS_SKU,
} from "../client-comms-addon";

describe("CLIENT_COMMS_ADDON", () => {
  it("prices at $11/mo AUD, GST-inclusive", () => {
    expect(CLIENT_COMMS_ADDON.sku).toBe("CLIENT_COMMS");
    expect(CLIENT_COMMS_ADDON.amount).toBe(11.0);
    expect(CLIENT_COMMS_ADDON.currency).toBe("AUD");
    expect(CLIENT_COMMS_ADDON.interval).toBe("month");
  });

  it("exposes the sku and subscription-type markers used by checkout + webhook", () => {
    expect(CLIENT_COMMS_SKU).toBe("CLIENT_COMMS");
    expect(CLIENT_COMMS_ADDON_SUBSCRIPTION_TYPE).toBe("client_comms_addon");
  });
});
