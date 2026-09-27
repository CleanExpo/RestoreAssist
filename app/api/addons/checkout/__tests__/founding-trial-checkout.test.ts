/**
 * RA-7721 — a Founding Trial business holds every add-on free. Checkout must
 * refuse to sell one, so nothing included is ever billed. Mocks mirror
 * technician-seats-checkout.test.ts and use the REAL registry.
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
  checkout: { sessions: { create: vi.fn() } },
  subscriptions: { retrieve: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    featureEntitlement: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: vi.fn(),
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/addons/checkout", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/addons/checkout — Founding Trial add-ons are not sold (RA-7721)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      subscriptionStatus: "ACTIVE",
      stripeCustomerId: "cus_1",
      subscriptionId: "sub_base_1",
    } as never);
    vi.mocked(getWorkspaceForUser).mockResolvedValue({
      id: "ws_9",
      name: "Fixture Restoration",
    });
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: "cs_1",
      url: "https://checkout.stripe.com/x",
    });
  });

  it.each(["TECHNICIAN_SEATS", "BOOKKEEPING", "VOICE"])(
    "refuses %s with 409 and creates no Stripe checkout or subscription change",
    async (addonKey) => {
      vi.mocked(prisma.featureEntitlement.findUnique).mockResolvedValue({
        active: true,
        stripeSubscriptionId: null,
        stripePriceId: "complimentary:founding-trial",
      } as never);
      const res = await POST(makeRequest({ addonKey, quantity: 1 }));
      expect(res.status).toBe(409);
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
      expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
      expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    },
  );

  it("still sells an add-on the business does not hold free", async () => {
    vi.mocked(prisma.featureEntitlement.findUnique).mockResolvedValue(null);
    const res = await POST(makeRequest({ addonKey: "BOOKKEEPING" }));
    expect(res.status).toBe(200);
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });
});
