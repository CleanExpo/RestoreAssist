import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/api/webhooks/stripe/route", () => ({
  downgradeUserToCanceled: vi.fn(),
}));
const stripeMock = vi.hoisted(() => ({
  subscriptions: { retrieve: vi.fn(), list: vi.fn() },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: vi.fn(), count: vi.fn() },
    featureEntitlement: { findMany: vi.fn() },
  },
}));

import { reconcileStripe } from "../reconcile-stripe";
import { prisma } from "@/lib/prisma";

const seatSub = (id: string, quantity: number, status = "active") => ({
  id,
  status,
  metadata: { type: "technician_seats_addon" },
  items: { data: [{ quantity }] },
});

describe("reconcileStripe seat checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockImplementation((async (args: {
      where: Record<string, unknown>;
    }) =>
      "stripeCustomerId" in args.where
        ? [{ id: "u1", stripeCustomerId: "cus_1" }]
        : []) as never);
    vi.mocked(prisma.featureEntitlement.findMany).mockResolvedValue([
      { id: "e1", seats: 2, stripeSubscriptionId: "sub_s" },
    ] as never);
    stripeMock.subscriptions.retrieve.mockResolvedValue(seatSub("sub_s", 2));
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [seatSub("sub_s", 2)],
    });
  });

  it("a clean run reports zero mismatches", async () => {
    const result = await reconcileStripe();
    expect(result.metadata).toMatchObject({
      seatMismatches: 0,
      paidSeatsWithNoRow: 0,
      ownersWithNoOrganisation: 0,
    });
  });

  it("a planted quantity mismatch fails the run", async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(seatSub("sub_s", 3));
    await expect(reconcileStripe()).rejects.toThrow(/seat mismatch/i);
  });

  it("a paid seat subscription with no row fails the run", async () => {
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [seatSub("sub_s", 2), seatSub("sub_orphan", 1)],
    });
    await expect(reconcileStripe()).rejects.toThrow(/seat mismatch/i);
  });

  it("owners with no organisation are counted, older than 24 hours, and do not fail the run", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(4);
    const result = await reconcileStripe();
    expect(result.metadata?.ownersWithNoOrganisation).toBe(4);
    const where = vi.mocked(prisma.user.count).mock.calls[0][0]?.where as {
      role: string;
      organizationId: null;
      pendingInviteIdentity: boolean;
      needsOnboarding: boolean;
      createdAt: { lt: Date };
    };
    expect(where).toMatchObject({
      role: "ADMIN",
      organizationId: null,
      pendingInviteIdentity: false,
      needsOnboarding: false,
    });
    expect(Date.now() - where.createdAt.lt.getTime()).toBeGreaterThanOrEqual(
      24 * 60 * 60 * 1000 - 1000,
    );
  });
});
