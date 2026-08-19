/**
 * Recurring add-on fulfillment — browser self-heal + checkout.session.completed.
 *
 * Proves BOOKKEEPING (and any registry add-on) gets a FeatureEntitlement from a
 * completed Checkout Session without relying solely on customer.subscription.*
 * webhooks (critical on localhost without `stripe listen`).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    featureEntitlement: { upsert: vi.fn() },
    user: { update: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    subscriptionEvent: { create: vi.fn() },
    stripeWebhookEvent: { create: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: { retrieve: vi.fn(), list: vi.fn() },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map([["stripe-signature", "sig"]])),
}));

vi.mock("@/lib/billing/subscription-event", () => ({
  recordSubscriptionEvent: vi.fn(async () => ({ kind: "recorded" })),
}));

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

import {
  applyRecurringAddonSubscription,
  fulfillRecurringAddonFromSession,
} from "@/lib/billing/fulfill-recurring-addon";
import { handleCheckoutCompleted } from "@/app/api/webhooks/stripe/route";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { BOOKKEEPING_ADDON_SUBSCRIPTION_TYPE } from "@/lib/billing/bookkeeping-addon";

const mockUpsert = (
  prisma as unknown as {
    featureEntitlement: { upsert: ReturnType<typeof vi.fn> };
  }
).featureEntitlement.upsert;

const mockRetrieve = (
  stripe as unknown as {
    subscriptions: { retrieve: ReturnType<typeof vi.fn> };
  }
).subscriptions.retrieve;

const mockUpdateMany = (
  prisma as unknown as {
    user: { updateMany: ReturnType<typeof vi.fn> };
  }
).user.updateMany;

function bookkeepingCheckoutSession() {
  return {
    id: "cs_bk_1",
    mode: "subscription",
    payment_status: "paid",
    status: "complete",
    customer: "cus_1",
    subscription: "sub_bk_1",
    metadata: {
      userId: "u_1",
      addonKey: "BOOKKEEPING",
      sku: "BOOKKEEPING",
      workspaceId: "ws_1",
      type: "addon_subscription",
    },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsert.mockResolvedValue({});
  mockUpdateMany.mockResolvedValue({ count: 1 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("applyRecurringAddonSubscription", () => {
  it("grants ACTIVE BOOKKEEPING entitlement from subscription metadata", async () => {
    const handled = await applyRecurringAddonSubscription({
      id: "sub_bk_1",
      status: "active",
      metadata: {
        type: BOOKKEEPING_ADDON_SUBSCRIPTION_TYPE,
        sku: "BOOKKEEPING",
        workspaceId: "ws_1",
        userId: "u_1",
      },
      items: { data: [{ price: { id: "price_bk" }, quantity: 1 }] },
    } as never);

    expect(handled).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_sku: { workspaceId: "ws_1", sku: "BOOKKEEPING" },
        },
        create: expect.objectContaining({
          workspaceId: "ws_1",
          sku: "BOOKKEEPING",
          active: true,
          stripeSubscriptionId: "sub_bk_1",
        }),
      }),
    );
  });
});

describe("fulfillRecurringAddonFromSession", () => {
  it("retrieves the Stripe subscription and upserts FeatureEntitlement", async () => {
    mockRetrieve.mockResolvedValue({
      id: "sub_bk_1",
      status: "active",
      metadata: {
        type: BOOKKEEPING_ADDON_SUBSCRIPTION_TYPE,
        sku: "BOOKKEEPING",
        workspaceId: "ws_1",
        userId: "u_1",
      },
      items: { data: [{ price: { id: "price_bk" }, quantity: 1 }] },
    });

    const result = await fulfillRecurringAddonFromSession(
      bookkeepingCheckoutSession(),
    );

    expect(result.applied).toBe(true);
    expect(result.sku).toBe("BOOKKEEPING");
    expect(mockRetrieve).toHaveBeenCalledWith("sub_bk_1");
    expect(mockUpsert).toHaveBeenCalled();
  });

  it("falls back to session metadata when subscription metadata is thin", async () => {
    mockRetrieve.mockResolvedValue({
      id: "sub_bk_1",
      status: "active",
      metadata: {},
      items: { data: [{ price: { id: "price_bk" }, quantity: 1 }] },
    });

    const result = await fulfillRecurringAddonFromSession(
      bookkeepingCheckoutSession(),
    );

    expect(result.applied).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_sku: { workspaceId: "ws_1", sku: "BOOKKEEPING" },
        },
      }),
    );
  });
});

describe("handleCheckoutCompleted — addon_subscription", () => {
  it("grants entitlement and does NOT flip base-plan User.subscriptionId", async () => {
    mockRetrieve.mockResolvedValue({
      id: "sub_bk_1",
      status: "active",
      metadata: {
        type: BOOKKEEPING_ADDON_SUBSCRIPTION_TYPE,
        sku: "BOOKKEEPING",
        workspaceId: "ws_1",
        userId: "u_1",
      },
      items: { data: [{ price: { id: "price_bk" }, quantity: 1 }] },
    });

    await handleCheckoutCompleted({
      id: "evt_bk",
      type: "checkout.session.completed",
      data: { object: bookkeepingCheckoutSession() },
    } as never);

    expect(mockUpsert).toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe("syncRecurringAddonsFromStripe", () => {
  it("applies entitlements for registry-marked customer subscriptions", async () => {
    const { syncRecurringAddonsFromStripe } = await import(
      "@/lib/billing/fulfill-recurring-addon"
    );
    (
      stripe as unknown as {
        subscriptions: { list: ReturnType<typeof vi.fn> };
      }
    ).subscriptions.list = vi.fn().mockResolvedValue({
      data: [
        {
          id: "sub_bk_live",
          status: "active",
          metadata: {
            type: BOOKKEEPING_ADDON_SUBSCRIPTION_TYPE,
            sku: "BOOKKEEPING",
            workspaceId: "ws_1",
          },
          items: { data: [{ price: { id: "price_bk" }, quantity: 1 }] },
        },
        {
          id: "sub_base",
          status: "active",
          metadata: { type: "base_plan" },
          items: { data: [{ price: { id: "price_base" }, quantity: 1 }] },
        },
      ],
    });

    const result = await syncRecurringAddonsFromStripe("cus_1");
    expect(result).toEqual({ examined: 1, granted: 1 });
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });
});
