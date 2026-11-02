/**
 * Day 15, then the seat payment arrives. The real webhook handler writes over the
 * marker row and the real lock check reads the result; only Stripe and the database
 * are faked. A real test-mode purchase has not run, so this proves our handling of
 * the event, not that Stripe sends it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  organization: { findUnique: vi.fn(async () => ({ ownerId: "owner" })) },
  workspace: { findFirst: vi.fn(async () => ({ id: "ws" })) },
  user: {
    findUnique: vi.fn(async () => ({
      subscriptionStatus: "TRIAL",
      trialEndsAt: new Date("2026-12-20T00:00:00Z"),
      createdAt: new Date("2026-11-01T00:00:00Z"),
    })),
  },
  featureEntitlement: {
    findUnique: vi.fn(async () => db.row),
    upsert: vi.fn(
      async ({
        create,
        update,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        db.row = db.row ? { ...db.row, ...update } : create;
        return db.row;
      },
    ),
  },
}));
vi.mock("@/lib/stripe", () => ({ stripe: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { handleRecurringAddonSubscription } from "@/app/api/webhooks/stripe/route";
import { prisma } from "@/lib/prisma";
import { TRIAL_SEAT_PRICE_ID, isTrialSeatLocked } from "../technician-seats";

const seatSubscription = (status: Stripe.Subscription.Status) =>
  ({
    id: "sub_seat",
    status,
    metadata: { type: "technician_seats_addon", workspaceId: "ws", userId: "owner" },
    items: { data: [{ price: { id: "price_seat" }, quantity: 1 }] },
  }) as unknown as Stripe.Subscription;

describe("paying after the lock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T00:00:00Z")); // day 15
    db.row = { active: false, seats: 0, stripePriceId: TRIAL_SEAT_PRICE_ID };
  });

  it("is locked on day 15, and the seat payment event unlocks it", async () => {
    expect(await isTrialSeatLocked(prisma as never, "org")).toBe(true);
    expect(await handleRecurringAddonSubscription(seatSubscription("active"))).toBe(true);
    expect(db.row).toMatchObject({ active: true, seats: 1, stripePriceId: "price_seat" });
    expect(await isTrialSeatLocked(prisma as never, "org")).toBe(false);
  });

  it("an unpaid checkout event leaves the technician locked", async () => {
    await handleRecurringAddonSubscription(seatSubscription("incomplete"));
    expect(db.row?.active).not.toBe(true);
    expect(await isTrialSeatLocked(prisma as never, "org")).toBe(true);
  });

  it("a late cancellation of an older subscription leaves the newer paid seat alone", async () => {
    db.row = { active: true, seats: 1, stripePriceId: "price_seat", stripeSubscriptionId: "sub_new" };
    await handleRecurringAddonSubscription(seatSubscription("canceled"));
    expect(db.row).toMatchObject({ active: true, stripeSubscriptionId: "sub_new" });
  });

  it("cancelling the subscription that holds the seat still ends it", async () => {
    db.row = { active: true, seats: 1, stripePriceId: "price_seat", stripeSubscriptionId: "sub_seat" };
    await handleRecurringAddonSubscription(seatSubscription("canceled"));
    expect(db.row?.active).toBe(false);
  });
});
