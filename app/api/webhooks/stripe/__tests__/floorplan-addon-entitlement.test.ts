/**
 * RA-6922 — handleRecurringAddonSubscription() unit tests.
 *
 * Runs without a database — prisma is mocked. Verifies the FeatureEntitlement
 * toggles active on/off across the subscription lifecycle, is idempotent
 * (upsert), records the Stripe subscription + price ids, and never claims a
 * non-floor-plan subscription (so the base-plan handlers still run for those).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

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
  { priceId = "price_floorplan_1" }: { priceId?: string | null } = {},
): Stripe.Subscription {
  return {
    id: "sub_floorplan_1",
    status,
    metadata: metadata ?? {},
    items: {
      data: [{ price: priceId ? { id: priceId } : undefined }],
    },
  } as unknown as Stripe.Subscription;
}

const FLOORPLAN_META = {
  type: "floorplan_underlay_addon",
  sku: "FLOORPLAN_UNDERLAY",
  workspaceId: "ws_1",
  userId: "u_1",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("handleRecurringAddonSubscription", () => {
  it("grants the entitlement (active=true) on an active subscription", async () => {
    const handled = await handleRecurringAddonSubscription(
      makeSubscription("active", FLOORPLAN_META),
    );

    expect(handled).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: {
        workspaceId_sku: { workspaceId: "ws_1", sku: "FLOORPLAN_UNDERLAY" },
      },
      create: {
        workspaceId: "ws_1",
        sku: "FLOORPLAN_UNDERLAY",
        active: true,
        stripeSubscriptionId: "sub_floorplan_1",
        stripePriceId: "price_floorplan_1",
      },
      update: {
        active: true,
        stripeSubscriptionId: "sub_floorplan_1",
        stripePriceId: "price_floorplan_1",
      },
    });
  });

  it("grants the entitlement (active=true) while trialing", async () => {
    await handleRecurringAddonSubscription(
      makeSubscription("trialing", FLOORPLAN_META),
    );
    expect(mockUpsert.mock.calls[0][0].update.active).toBe(true);
  });

  it("revokes the entitlement (active=false) when canceled", async () => {
    const handled = await handleRecurringAddonSubscription(
      makeSubscription("canceled", FLOORPLAN_META),
    );
    expect(handled).toBe(true);
    expect(mockUpsert.mock.calls[0][0].update.active).toBe(false);
  });

  it("revokes the entitlement (active=false) when unpaid", async () => {
    await handleRecurringAddonSubscription(
      makeSubscription("unpaid", FLOORPLAN_META),
    );
    expect(mockUpsert.mock.calls[0][0].update.active).toBe(false);
  });

  it("returns false and does not upsert for a non-floor-plan subscription", async () => {
    const handled = await handleRecurringAddonSubscription(
      makeSubscription("active", undefined),
    );
    expect(handled).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("claims the event but does not upsert when workspaceId metadata is missing", async () => {
    const handled = await handleRecurringAddonSubscription(
      makeSubscription("active", { type: "floorplan_underlay_addon" }),
    );
    // Returns true so the caller does NOT run base-plan handlers with an add-on
    // subscription id, but cannot grant without a workspace.
    expect(handled).toBe(true);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("stores a null price id when the subscription item has no price", async () => {
    await handleRecurringAddonSubscription(
      makeSubscription("active", FLOORPLAN_META, { priceId: null }),
    );
    expect(mockUpsert.mock.calls[0][0].create.stripePriceId).toBeNull();
  });
});
