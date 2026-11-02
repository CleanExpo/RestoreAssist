/**
 * RA-6920 B6 — proves the checkout route bills the quantity-based
 * TECHNICIAN_SEATS add-on per seat while leaving every flat add-on at
 * quantity 1.
 *
 * Unlike the sibling `registry-recurring-addon.test.ts` (which mocks the
 * registry with a fixture to prove genericity), this test uses the REAL
 * registry so it exercises the actual TECHNICIAN_SEATS descriptor
 * (`perSeat: true`) end to end. Stripe, next-auth, rate-limiter, idempotency,
 * Prisma and the workspace provider are mocked exactly as in the sibling tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/idempotency", () => ({
  getIdempotencyKey: vi.fn(() => ({ ok: true, key: "click-key-1" })),
  withIdempotency: vi.fn(
    async (
      req: NextRequest,
      _scope: string,
      handler: (raw: string) => Promise<Response>,
    ) => handler(await req.text()),
  ),
}));

const stripeMock = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  prices: { create: vi.fn() },
  checkout: {
    sessions: { create: vi.fn(), list: vi.fn(), expire: vi.fn() },
  },
  subscriptions: { retrieve: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    workspace: { findFirst: vi.fn() },
    featureEntitlement: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: vi.fn(),
}));
vi.mock("@/lib/workspace/provision", () => ({
  ensureWorkspaceForUser: vi.fn(async () => ({
    workspaceId: "ws_9",
    workspaceName: "Fixture Restoration",
    alreadyExisted: true,
  })),
}));
vi.mock("@/lib/billing/fulfill-recurring-addon", () => ({
  syncRecurringAddonsFromStripe: vi.fn(async () => ({
    examined: 0,
    granted: 0,
  })),
}));
vi.mock("@/lib/billing/require-billing-owner", () => ({
  refuseNonOwner: vi.fn(async () => null),
}));
vi.mock("@/lib/analytics/track", () => ({ track: vi.fn(async () => {}) }));
vi.mock("@/lib/billing/technician-seats", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/technician-seats")>()),
  seatsNeededToBuy: vi.fn(),
}));
vi.mock("@/lib/observability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/observability")>()),
  reportError: vi.fn(),
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import { ensureWorkspaceForUser } from "@/lib/workspace/provision";
import { syncRecurringAddonsFromStripe } from "@/lib/billing/fulfill-recurring-addon";
import {
  seatsNeededToBuy,
  technicianSeatUsage,
} from "@/lib/billing/technician-seats";
import { track } from "@/lib/analytics/track";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/addons/checkout", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/addons/checkout — TECHNICIAN_SEATS per-seat quantity (RA-6920 B6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      role: "ADMIN",
      subscriptionStatus: "ACTIVE",
      stripeCustomerId: "cus_1",
      subscriptionId: "sub_base_1",
    } as never);
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({
      id: "ws_9",
    } as never);
    stripeMock.checkout.sessions.list.mockResolvedValue({ data: [] });
    stripeMock.checkout.sessions.expire.mockResolvedValue({});
    vi.mocked(getWorkspaceForUser).mockResolvedValue({
      id: "ws_9",
      name: "Fixture Restoration",
    });
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: "cs_seats_1",
      url: "https://checkout.stripe.com/seats",
    });
    // No seat pack yet: the first purchase goes through Checkout.
    vi.mocked(prisma.featureEntitlement.findUnique).mockResolvedValue(null);
  });

  it("passes the buyer-supplied seat count through as the line-item quantity", async () => {
    const res = await POST(
      makeRequest({ addonKey: "TECHNICIAN_SEATS", quantity: 5 }),
    );
    expect(res.status).toBe(200);

    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(arg.mode).toBe("subscription");
    const lineItem = arg.line_items[0];
    expect(lineItem.quantity).toBe(5);
    // Per-seat price is unchanged — Stripe multiplies by quantity.
    expect(lineItem.price_data.unit_amount).toBe(1100); // $11.00/seat
    expect(lineItem.price_data.product_data.metadata.sku).toBe(
      "TECHNICIAN_SEATS",
    );
    expect(arg.subscription_data.metadata).toMatchObject({
      type: "technician_seats_addon",
      sku: "TECHNICIAN_SEATS",
      workspaceId: "ws_9",
    });
  });

  it("defaults to 1 seat when no quantity is supplied", async () => {
    await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));
    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(arg.line_items[0].quantity).toBe(1);
  });

  it.each([0, -3, 2.5, 101])(
    "rejects an out-of-range seat quantity (%s) with 400 and no Stripe call",
    async (bad) => {
      const res = await POST(
        makeRequest({ addonKey: "TECHNICIAN_SEATS", quantity: bad }),
      );
      expect(res.status).toBe(400);
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    },
  );

  it("ignores quantity for a flat add-on — FLOORPLAN_UNDERLAY stays at 1", async () => {
    await POST(
      makeRequest({ addonKey: "FLOORPLAN_UNDERLAY", quantity: 5 }),
    );
    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(arg.line_items[0].quantity).toBe(1);
    expect(arg.line_items[0].price_data.product_data.metadata.sku).toBe(
      "FLOORPLAN_UNDERLAY",
    );
  });

  it("J-09: with seats already active, adds to the existing subscription instead of a second checkout", async () => {
    vi.mocked(prisma.featureEntitlement.findUnique).mockResolvedValue({
      active: true,
      stripeSubscriptionId: "sub_seats_1",
    } as never);
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: "sub_seats_1",
      status: "active",
      items: { data: [{ id: "si_1", quantity: 2 }] },
    });
    stripeMock.subscriptions.update.mockResolvedValue({ id: "sub_seats_1" });

    const res = await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: true, seats: 3 });
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      "sub_seats_1",
      { items: [{ id: "si_1", quantity: 3 }], proration_behavior: "create_prorations" },
      { idempotencyKey: "addon-seats:u1:click-key-1" },
    );
    expect(prisma.featureEntitlement.update).toHaveBeenCalledWith({
      where: { workspaceId_sku: { workspaceId: "ws_9", sku: "TECHNICIAN_SEATS" } },
      data: { seats: 3 },
    });
  });

  it("J-09: a cancelled seat pack starts a fresh checkout", async () => {
    vi.mocked(prisma.featureEntitlement.findUnique).mockResolvedValue({
      active: false,
      stripeSubscriptionId: "sub_old",
    } as never);
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: "sub_old",
      status: "canceled",
      items: { data: [{ id: "si_old", quantity: 1 }] },
    });

    const res = await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));

    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it("J-09: a seat row still marked active over a cancelled Stripe subscription starts a fresh checkout", async () => {
    vi.mocked(prisma.featureEntitlement.findUnique).mockResolvedValue({
      active: true,
      stripeSubscriptionId: "sub_seats_canceled",
    } as never);
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: "sub_seats_canceled",
      status: "canceled",
      items: { data: [{ id: "si_1", quantity: 2 }] },
    });

    const res = await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));

    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it.each(["past_due", "unpaid", "paused", "incomplete"])(
    "J-09: a %s seat subscription that can still bill is neither replaced nor extended",
    async (status) => {
      vi.mocked(prisma.featureEntitlement.findUnique).mockResolvedValue({
        // past_due flips the row inactive while Stripe keeps billing.
        active: false,
        stripeSubscriptionId: "sub_seats_owing",
      } as never);
      stripeMock.subscriptions.retrieve.mockResolvedValue({
        id: "sub_seats_owing",
        status,
        items: { data: [{ id: "si_1", quantity: 2 }] },
      });

      const res = await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));

      expect(res.status).toBe(402);
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
      expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
    },
  );

  it.each(["TRIAL", "EXPIRED", "CANCELED", "PAST_DUE", null])(
    "a %s owner stays refused: 403 upgradeRequired, no Stripe or entitlement call",
    async (subscriptionStatus) => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        role: "ADMIN",
        subscriptionStatus,
        stripeCustomerId: "cus_1",
      } as never);
      const res = await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));
      expect(res.status).toBe(403);
      expect((await res.json()).upgradeRequired).toBe(true);
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
      expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
      expect(prisma.featureEntitlement.update).not.toHaveBeenCalled();
      expect(ensureWorkspaceForUser).not.toHaveBeenCalled();
    },
  );

  it("a no-organisation technician is refused seat purchase from the database role", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      role: "USER",
      subscriptionStatus: "ACTIVE",
      stripeCustomerId: "cus_1",
    } as never);
    const res = await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));
    expect(res.status).toBe(403);
    expect(ensureWorkspaceForUser).not.toHaveBeenCalled();
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  describe("buying a seat during a trial", () => {
    const trial = (trialEndsAt: Date) => ({
      role: "ADMIN",
      subscriptionStatus: "TRIAL",
      trialEndsAt,
      stripeCustomerId: "cus_1",
      subscriptionId: null,
    });

    it("sells a technician seat on a current trial", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        trial(new Date(Date.now() + 86_400_000)) as never,
      );
      const res = await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));
      expect(res.status).toBe(200);
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
    });

    it("takes the plan first once the trial has run out, even if not yet swept", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        trial(new Date(Date.now() - 86_400_000)) as never,
      );
      const res = await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));
      expect(res.status).toBe(403);
      expect((await res.json()).upgradeRequired).toBe(true);
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it("still refuses every other add-on on a current trial", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        trial(new Date(Date.now() + 86_400_000)) as never,
      );
      const res = await POST(makeRequest({ addonKey: "BOOKKEEPING" }));
      expect(res.status).toBe(403);
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    });
  });

  it("stamps the workspace the seat count reads and never uses a membership", async () => {
    vi.mocked(getWorkspaceForUser).mockResolvedValue({
      id: "ws_other_business",
      name: "Someone else",
    });
    await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));
    expect(ensureWorkspaceForUser).toHaveBeenCalledWith("u1");
    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(arg.subscription_data.metadata.workspaceId).toBe("ws_9");
    expect(arg.metadata.workspaceId).toBe("ws_9");

    // The seat count reads through the same query the checkout just used.
    const checkoutQuery = vi.mocked(prisma.workspace.findFirst).mock.calls[0][0];
    const db = {
      organization: { findUnique: vi.fn(async () => ({ ownerId: "u1" })) },
      workspace: { findFirst: vi.fn(async () => ({ id: "ws_9" })) },
      featureEntitlement: { findUnique: vi.fn(async () => null) },
      user: {
        count: vi.fn(async () => 0),
        findUnique: vi.fn(async () => null),
      },
      userInvite: { count: vi.fn(async () => 0) },
    };
    await technicianSeatUsage(db as never, "org1");
    expect(db.workspace.findFirst.mock.calls[0][0]).toEqual(checkoutQuery);
  });

  it("a paid subscription the row missed takes the in-place path, not a second Checkout", async () => {
    vi.mocked(syncRecurringAddonsFromStripe).mockImplementationOnce(async () => {
      vi.mocked(prisma.featureEntitlement.findUnique).mockResolvedValue({
        active: true,
        stripeSubscriptionId: "sub_seats_1",
      } as never);
      return { examined: 1, granted: 1 };
    });
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: "sub_seats_1",
      status: "active",
      items: { data: [{ id: "si_1", quantity: 1 }] },
    });
    stripeMock.subscriptions.update.mockResolvedValue({ id: "sub_seats_1" });

    const res = await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));

    expect(await res.json()).toEqual({ updated: true, seats: 2 });
    expect(syncRecurringAddonsFromStripe).toHaveBeenCalledWith("cus_1");
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("a failed Stripe sync stops the purchase, so nothing can double-bill blind", async () => {
    vi.mocked(syncRecurringAddonsFromStripe).mockRejectedValueOnce(
      new Error("stripe down"),
    );
    const res = await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("expires only this customer's open seat sessions before minting a new one", async () => {
    stripeMock.checkout.sessions.list.mockResolvedValueOnce({
      data: [
        { id: "cs_seat_old", metadata: { sku: "TECHNICIAN_SEATS" } },
        { id: "cs_other", metadata: { sku: "BOOKKEEPING" } },
        { id: "cs_plan", metadata: {} },
      ],
    });
    await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));
    expect(stripeMock.checkout.sessions.list).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_1", status: "open" }),
    );
    expect(stripeMock.checkout.sessions.expire.mock.calls).toEqual([
      ["cs_seat_old"],
    ]);
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ addingTechnician: true }, true],
    [{}, false],
    [{ addingTechnician: "yes" }, false],
  ])("buying with %j tells the seat count addingTechnician is %s", async (extra, expected) => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      role: "ADMIN",
      subscriptionStatus: "ACTIVE",
      stripeCustomerId: "cus_1",
      subscriptionId: "sub_base_1",
      organizationId: "org_1",
    } as never);
    vi.mocked(seatsNeededToBuy).mockResolvedValue(2);
    await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS", ...extra }));
    expect(seatsNeededToBuy).toHaveBeenCalledWith(prisma, "org_1", 1, {
      addingTechnician: expected,
    });
    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(arg.line_items[0].quantity).toBe(2);
  });

  describe("two clicks racing past the first list", () => {
    const seatSession = (id: string, created: number) => ({
      id,
      created,
      url: `https://stripe.test/${id}`,
      metadata: { sku: "TECHNICIAN_SEATS" },
    });

    it("an older rival is expired and this link is handed out", async () => {
      stripeMock.checkout.sessions.create.mockResolvedValue(seatSession("cs_b", 200));
      stripeMock.checkout.sessions.list
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({
          data: [seatSession("cs_a", 100), seatSession("cs_b", 200)],
        });
      const res = await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));
      expect((await res.json()).url).toBe("https://stripe.test/cs_b");
      expect(stripeMock.checkout.sessions.expire.mock.calls).toEqual([["cs_a"]]);
    });

    it("a newer rival wins: this one is expired and it never hands out the rival's link, which may be for another seat count", async () => {
      stripeMock.checkout.sessions.create.mockResolvedValue(seatSession("cs_a", 100));
      stripeMock.checkout.sessions.list
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({
          data: [seatSession("cs_a", 100), seatSession("cs_b", 200)],
        });
      const res = await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));
      expect(res.status).toBe(409);
      expect(JSON.stringify(await res.json())).not.toContain("https://stripe.test/");
      expect(stripeMock.checkout.sessions.expire.mock.calls).toEqual([["cs_a"]]);
    });
  });

  it("a Stripe raise followed by a local write failure returns success with the seat count", async () => {
    vi.mocked(prisma.featureEntitlement.findUnique).mockResolvedValue({
      active: true,
      stripeSubscriptionId: "sub_seats_1",
    } as never);
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: "sub_seats_1",
      status: "active",
      items: { data: [{ id: "si_1", quantity: 2 }] },
    });
    stripeMock.subscriptions.update.mockResolvedValue({ id: "sub_seats_1" });
    vi.mocked(prisma.featureEntitlement.update).mockRejectedValueOnce(
      new Error("db blip"),
    );
    const res = await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: true, seats: 3 });
  });

  it("an in-place raise records seat_granted", async () => {
    vi.mocked(prisma.featureEntitlement.findUnique).mockResolvedValue({
      active: true,
      stripeSubscriptionId: "sub_seats_1",
    } as never);
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: "sub_seats_1",
      status: "active",
      items: { data: [{ id: "si_1", quantity: 2 }] },
    });
    stripeMock.subscriptions.update.mockResolvedValue({ id: "sub_seats_1" });
    await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));
    expect(track).toHaveBeenCalledWith("u1", "seat_granted", expect.anything());
  });

  it("returnTo team-invite maps to the fixed paths and records the start", async () => {
    await POST(
      makeRequest({ addonKey: "TECHNICIAN_SEATS", returnTo: "team-invite" }),
    );
    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(arg.success_url).toContain(
      "/dashboard/success?addon=TECHNICIAN_SEATS&next=team-invite&session_id={CHECKOUT_SESSION_ID}",
    );
    expect(arg.cancel_url).toContain(
      "/dashboard/team?invite=1&checkout=cancelled",
    );
    expect(track).toHaveBeenCalledWith(
      "u1",
      "seat_checkout_started",
      expect.anything(),
    );
  });

  it("an unset returnTo keeps today's URLs", async () => {
    await POST(makeRequest({ addonKey: "TECHNICIAN_SEATS" }));
    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(arg.success_url).not.toContain("next=");
    expect(arg.cancel_url).toContain("/billing/upgrade?cancelled=1");
  });

  it.each(["https://evil.test", "//evil.test", "/dashboard", ""])(
    "returnTo %j is refused with 400 and no Stripe call",
    async (returnTo) => {
      const res = await POST(
        makeRequest({ addonKey: "TECHNICIAN_SEATS", returnTo }),
      );
      expect(res.status).toBe(400);
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    },
  );
});
