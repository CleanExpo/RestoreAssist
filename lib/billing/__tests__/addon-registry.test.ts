/**
 * RA-6920 B3 — proves BOOKKEEPING was registered in RECURRING_ADDONS with
 * ZERO edits to the checkout/webhook route files: both routes only ever call
 * getRecurringAddon()/getRecurringAddonBySubscriptionType(), so a passing
 * lookup here is the same lookup those routes will do for a real checkout /
 * webhook event.
 */

import { describe, expect, it } from "vitest";
import {
  getRecurringAddon,
  getRecurringAddonBySubscriptionType,
} from "../addon-registry";

describe("RECURRING_ADDONS — BOOKKEEPING", () => {
  it("resolves by add-on key with the correct price + currency", () => {
    const descriptor = getRecurringAddon("BOOKKEEPING");

    expect(descriptor).toMatchObject({
      sku: "BOOKKEEPING",
      amount: 11.0,
      currency: "AUD",
      interval: "month",
      subscriptionType: "bookkeeping_addon",
    });
  });

  it("resolves in reverse by the subscription-metadata marker", () => {
    const descriptor = getRecurringAddonBySubscriptionType("bookkeeping_addon");

    expect(descriptor?.sku).toBe("BOOKKEEPING");
  });

  it("still resolves the pre-existing FLOORPLAN_UNDERLAY entry unaffected", () => {
    const descriptor = getRecurringAddon("FLOORPLAN_UNDERLAY");

    expect(descriptor?.sku).toBe("FLOORPLAN_UNDERLAY");
  });
});

describe("RECURRING_ADDONS — CLIENT_COMMS (RA-6954)", () => {
  it("resolves by add-on key with the correct price + currency", () => {
    const descriptor = getRecurringAddon("CLIENT_COMMS");

    expect(descriptor).toMatchObject({
      sku: "CLIENT_COMMS",
      amount: 11.0,
      currency: "AUD",
      interval: "month",
      subscriptionType: "client_comms_addon",
    });
  });

  it("resolves in reverse by the subscription-metadata marker", () => {
    const descriptor = getRecurringAddonBySubscriptionType("client_comms_addon");

    expect(descriptor?.sku).toBe("CLIENT_COMMS");
  });
});

describe("RECURRING_ADDONS — VOICE (RA-6920 B2)", () => {
  it("resolves by add-on key with the correct price + currency", () => {
    const descriptor = getRecurringAddon("VOICE");

    expect(descriptor).toMatchObject({
      sku: "VOICE",
      amount: 11.0,
      currency: "AUD",
      interval: "month",
      subscriptionType: "voice_addon",
    });
  });

  it("resolves in reverse by the subscription-metadata marker", () => {
    const descriptor = getRecurringAddonBySubscriptionType("voice_addon");

    expect(descriptor?.sku).toBe("VOICE");
  });
});
