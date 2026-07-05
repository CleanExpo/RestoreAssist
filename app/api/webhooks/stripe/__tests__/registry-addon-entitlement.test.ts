/**
 * RA-6920 B0 — proves the Stripe webhook's add-on lifecycle handler is
 * data-driven by the recurring add-on registry, NOT by a floorplan-only check.
 *
 * The `@/lib/billing/addon-registry` module is mocked with a FICTIONAL add-on
 * ("FIXTURE_ADDON") whose `subscriptionType` appears nowhere in route source.
 * `handleRecurringAddonSubscription` recognises it purely from the subscription
 * metadata marker and upserts the FeatureEntitlement for the descriptor's SKU —
 * the same outcome a real B1–B4 add-on gets from a one-line registry entry, with
 * ZERO edits to route.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

const FIXTURE_ADDON = vi.hoisted(() => ({
  sku: "FIXTURE_ADDON",
  name: "Fixture Add-on",
  description: "A test-only recurring add-on.",
  amount: 7,
  currency: "AUD",
  interval: "month" as const,
  subscriptionType: "fixture_addon_sub",
}));

vi.mock("@/lib/billing/addon-registry", () => {
  const map: Record<string, typeof FIXTURE_ADDON> = { FIXTURE_ADDON };
  return {
    RECURRING_ADDONS: map,
    getRecurringAddon: (addonKey: string) => map[addonKey],
    getRecurringAddonBySubscriptionType: (type: string) =>
      Object.values(map).find((d) => d.subscriptionType === type),
  };
});

vi.mock("@/lib/stripe", () => ({ stripe: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { featureEntitlement: { upsert: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { handleRecurringAddonSubscription } from "../route";

const mockUpsert = (
  prisma as unknown as {
    featureEntitlement: { upsert: ReturnType<typeof vi.fn> };
  }
).featureEntitlement.upsert;

function makeSubscription(
  status: Stripe.Subscription.Status,
  metadata: Record<string, string> | undefined,
): Stripe.Subscription {
  return {
    id: "sub_fixture_1",
    status,
    metadata: metadata ?? {},
    items: { data: [{ price: { id: "price_fixture_1" } }] },
  } as unknown as Stripe.Subscription;
}

const FIXTURE_META = {
  type: "fixture_addon_sub",
  sku: "FIXTURE_ADDON",
  workspaceId: "ws_9",
  userId: "u_9",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("handleRecurringAddonSubscription — fixture registry entry (RA-6920 B0)", () => {
  it("grants the entitlement (active=true) for the fixture add-on's SKU", async () => {
    const handled = await handleRecurringAddonSubscription(
      makeSubscription("active", FIXTURE_META),
    );

    expect(handled).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: {
        workspaceId_sku: { workspaceId: "ws_9", sku: "FIXTURE_ADDON" },
      },
      create: {
        workspaceId: "ws_9",
        sku: "FIXTURE_ADDON",
        active: true,
        stripeSubscriptionId: "sub_fixture_1",
        stripePriceId: "price_fixture_1",
      },
      update: {
        active: true,
        stripeSubscriptionId: "sub_fixture_1",
        stripePriceId: "price_fixture_1",
      },
    });
  });

  it("revokes the entitlement (active=false) when the fixture subscription is canceled", async () => {
    const handled = await handleRecurringAddonSubscription(
      makeSubscription("canceled", FIXTURE_META),
    );
    expect(handled).toBe(true);
    expect(mockUpsert.mock.calls[0][0].update.active).toBe(false);
  });

  it("ignores a subscription whose metadata marker is not in the registry", async () => {
    const handled = await handleRecurringAddonSubscription(
      makeSubscription("active", { type: "some_other_subscription" }),
    );
    expect(handled).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
