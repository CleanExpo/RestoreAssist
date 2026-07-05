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
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
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

describe("POST /api/addons/checkout — TECHNICIAN_SEATS per-seat quantity (RA-6920 B6)", () => {
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
      id: "cs_seats_1",
      url: "https://checkout.stripe.com/seats",
    });
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
});
