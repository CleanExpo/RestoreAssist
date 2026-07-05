/**
 * RA-6920 B6 — proves the Stripe webhook persists the purchased seat count on
 * the FeatureEntitlement for the quantity-based TECHNICIAN_SEATS add-on, and
 * leaves `seats` untouched for a flat add-on.
 *
 * Uses the REAL add-on registry so it exercises the actual TECHNICIAN_SEATS
 * descriptor (`perSeat: true`, subscriptionType `technician_seats_addon`).
 * Only Stripe + Prisma are mocked.
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
  subscriptionType: string,
  quantity: number | undefined,
  status: Stripe.Subscription.Status = "active",
): Stripe.Subscription {
  return {
    id: "sub_seats_1",
    status,
    metadata: {
      type: subscriptionType,
      sku: "IGNORED_BY_HANDLER",
      workspaceId: "ws_9",
      userId: "u_9",
    },
    items: {
      data: [{ price: { id: "price_seats_1" }, quantity }],
    },
  } as unknown as Stripe.Subscription;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("handleRecurringAddonSubscription — TECHNICIAN_SEATS seat count (RA-6920 B6)", () => {
  it("persists the purchased seat count on the entitlement", async () => {
    const handled = await handleRecurringAddonSubscription(
      makeSubscription("technician_seats_addon", 5),
    );

    expect(handled).toBe(true);
    const arg = mockUpsert.mock.calls[0][0];
    expect(arg.where.workspaceId_sku).toEqual({
      workspaceId: "ws_9",
      sku: "TECHNICIAN_SEATS",
    });
    expect(arg.create.seats).toBe(5);
    expect(arg.update.seats).toBe(5);
    expect(arg.create.active).toBe(true);
  });

  it("defaults seats to 1 when the subscription item omits a quantity", async () => {
    await handleRecurringAddonSubscription(
      makeSubscription("technician_seats_addon", undefined),
    );
    const arg = mockUpsert.mock.calls[0][0];
    expect(arg.update.seats).toBe(1);
  });

  it("leaves seats undefined for a flat add-on (FLOORPLAN_UNDERLAY)", async () => {
    await handleRecurringAddonSubscription(
      makeSubscription("floorplan_underlay_addon", 5),
    );
    const arg = mockUpsert.mock.calls[0][0];
    // A flat add-on never writes a seat count even if Stripe reports a quantity.
    expect(arg.create.seats).toBeUndefined();
    expect(arg.update.seats).toBeUndefined();
  });
});
