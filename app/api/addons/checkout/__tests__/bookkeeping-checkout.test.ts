/**
 * RA-6920 B3 — BOOKKEEPING recurring add-on checkout.
 *
 * The checkout route is registry-driven (RA-6920 B0): registering BOOKKEEPING
 * in lib/billing/addon-registry.ts is enough for this test to pass with ZERO
 * edits to app/api/addons/checkout/route.ts. Uses the REAL registry (not
 * mocked) so a pass here proves the actual production wiring, not a fixture.
 *
 * Stripe, next-auth, rate-limiter, idempotency and Prisma are mocked.
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

describe("POST /api/addons/checkout — BOOKKEEPING recurring add-on (RA-6920 B3)", () => {
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
      id: "ws_1",
      name: "Acme Restoration",
    });
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: "cs_bookkeeping_1",
      url: "https://checkout.stripe.com/bookkeeping",
    });
  });

  it("builds a subscription-mode session priced inline at $11/mo GST-inclusive", async () => {
    const res = await POST(makeRequest({ addonKey: "BOOKKEEPING" }));
    expect(res.status).toBe(200);

    expect(stripeMock.prices.create).not.toHaveBeenCalled();
    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(arg.mode).toBe("subscription");

    const lineItem = arg.line_items[0];
    expect(lineItem.price).toBeUndefined();
    expect(lineItem.price_data.unit_amount).toBe(1100); // $11.00
    expect(lineItem.price_data.currency).toBe("aud");
    expect(lineItem.price_data.tax_behavior).toBe("inclusive");
    expect(lineItem.price_data.recurring).toEqual({ interval: "month" });

    expect(arg.automatic_tax).toEqual({ enabled: true });
    expect(arg.tax_id_collection).toEqual({ enabled: true });
  });

  it("stamps the subscription with the workspace id + SKU for the webhook", async () => {
    await POST(makeRequest({ addonKey: "BOOKKEEPING" }));

    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(arg.subscription_data.metadata).toMatchObject({
      type: "bookkeeping_addon",
      sku: "BOOKKEEPING",
      workspaceId: "ws_1",
      userId: "u1",
    });
    expect(arg.metadata).toMatchObject({
      sku: "BOOKKEEPING",
      workspaceId: "ws_1",
      type: "addon_subscription",
    });
  });

  it("returns 404 when the user has no workspace to attach the entitlement to", async () => {
    vi.mocked(getWorkspaceForUser).mockResolvedValue(null);

    const res = await POST(makeRequest({ addonKey: "BOOKKEEPING" }));

    expect(res.status).toBe(404);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
