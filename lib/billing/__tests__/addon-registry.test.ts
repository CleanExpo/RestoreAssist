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
import { ADDON_SKUS } from "@/lib/entitlements/types";

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

  it("still resolves the pre-existing FLOORPLAN_UNDERLAY entry at $9.95", () => {
    const descriptor = getRecurringAddon("FLOORPLAN_UNDERLAY");

    expect(descriptor?.sku).toBe("FLOORPLAN_UNDERLAY");
    expect(descriptor?.amount).toBe(9.95);
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

describe("RECURRING_ADDONS — TECHNICIAN_SEATS (RA-6920 B6)", () => {
  it("resolves by add-on key with the correct per-seat price + currency", () => {
    const descriptor = getRecurringAddon("TECHNICIAN_SEATS");

    expect(descriptor).toMatchObject({
      sku: "TECHNICIAN_SEATS",
      amount: 11.0,
      currency: "AUD",
      interval: "month",
      subscriptionType: "technician_seats_addon",
    });
  });

  it("is the only add-on flagged perSeat (quantity-based billing)", () => {
    expect(getRecurringAddon("TECHNICIAN_SEATS")?.perSeat).toBe(true);
    // Every flat add-on must NOT carry the per-seat marker.
    for (const key of [
      "FLOORPLAN_UNDERLAY",
      "BOOKKEEPING",
      "SERVICE_CRM",
      "PAYMENTS",
      "CLIENT_COMMS",
      "VOICE",
    ]) {
      expect(getRecurringAddon(key)?.perSeat).toBeFalsy();
    }
  });

  it("resolves in reverse by the subscription-metadata marker", () => {
    const descriptor = getRecurringAddonBySubscriptionType(
      "technician_seats_addon",
    );

    expect(descriptor?.sku).toBe("TECHNICIAN_SEATS");
    expect(descriptor?.perSeat).toBe(true);
  });
});

describe("RECURRING_ADDONS — CLIENT_EDUCATION", () => {
  it("resolves by add-on key with the correct price + currency", () => {
    const descriptor = getRecurringAddon("CLIENT_EDUCATION");

    expect(descriptor).toMatchObject({
      sku: "CLIENT_EDUCATION",
      amount: 11.0,
      currency: "AUD",
      interval: "month",
      subscriptionType: "client_education_addon",
    });
  });

  it("resolves in reverse by the subscription-metadata marker", () => {
    const descriptor = getRecurringAddonBySubscriptionType(
      "client_education_addon",
    );

    expect(descriptor?.sku).toBe("CLIENT_EDUCATION");
  });

  it("is flat, not per-seat — adding a technician must not change the price", () => {
    expect(getRecurringAddon("CLIENT_EDUCATION")?.perSeat).toBeUndefined();
  });
});

describe("RECURRING_ADDONS — AI_COPILOT", () => {
  it("resolves by add-on key with the correct price + currency", () => {
    const descriptor = getRecurringAddon("AI_COPILOT");

    expect(descriptor).toMatchObject({
      sku: "AI_COPILOT",
      amount: 11.0,
      currency: "AUD",
      interval: "month",
      subscriptionType: "ai_copilot_addon",
    });
  });

  it("resolves in reverse by the subscription-metadata marker", () => {
    const descriptor = getRecurringAddonBySubscriptionType("ai_copilot_addon");

    expect(descriptor?.sku).toBe("AI_COPILOT");
  });

  it("is flat, not per-seat — every technician on the workspace is covered", () => {
    expect(getRecurringAddon("AI_COPILOT")?.perSeat).toBeUndefined();
  });
});

/**
 * Registry-wide invariants. The per-SKU blocks above each prove ONE entry
 * resolves; neither of these two failures would show up in any of them.
 */
describe("RECURRING_ADDONS — registry invariants", () => {
  // A SKU can exist in the Prisma enum, be gated by requireAddon(), and have NO
  // registry entry. Nothing breaks at build time: getRecurringAddon() returns
  // undefined and the checkout route treats that as "fall through to the
  // one-time path". The result is an add-on that gates a surface but cannot be
  // bought — a dead end reachable only by a customer trying to pay.
  it("registers every AddonSku, so no SKU can gate a surface it cannot sell", () => {
    const unregistered = ADDON_SKUS.filter((sku) => !getRecurringAddon(sku));

    expect(unregistered).toEqual([]);
  });

  // addon-registry.ts states the marker "MUST be globally unique across the
  // registry so the reverse lookup is unambiguous" — and nothing enforced it.
  // A duplicate makes getRecurringAddonBySubscriptionType() resolve whichever
  // entry Object.entries reaches first, so a Stripe webhook for one add-on
  // would activate a DIFFERENT one: the customer pays for A and is entitled
  // to B. Silent, and only visible on the invoice.
  it("keeps every subscription-metadata marker unique", () => {
    const markers = ADDON_SKUS.map(
      (sku) => getRecurringAddon(sku)?.subscriptionType,
    ).filter((m): m is string => Boolean(m));

    expect(new Set(markers).size).toBe(markers.length);
  });

  // TECHNICIAN_SEATS is the ONLY quantity-based add-on. Confirmed deliberate
  // 2026-09-01: it stays per-seat while every other bolt-on is flat to the
  // company. Asserted from both directions so neither drifts into the other.
  it("keeps TECHNICIAN_SEATS the only per-seat add-on", () => {
    const perSeat = ADDON_SKUS.filter(
      (sku) => getRecurringAddon(sku)?.perSeat === true,
    );

    expect(perSeat).toEqual(["TECHNICIAN_SEATS"]);
  });
});
