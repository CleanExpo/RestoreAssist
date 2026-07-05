/**
 * RA-6920 B0 — proves the checkout route is data-driven by the recurring add-on
 * registry, NOT by a per-SKU branch.
 *
 * The `@/lib/billing/addon-registry` module is mocked with a FICTIONAL add-on
 * ("FIXTURE_ADDON") that does not exist anywhere in the route source. The route
 * builds a correct subscription checkout purely from that descriptor — the same
 * outcome a real B1–B4 add-on gets from a one-line registry entry, with ZERO
 * edits to route.ts.
 *
 * Stripe, next-auth, rate-limiter, idempotency, Prisma and the workspace
 * provider are mocked exactly as in the sibling floorplan tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
  const map: Record<string, typeof FIXTURE_ADDON> = {
    FIXTURE_ADDON,
  };
  return {
    RECURRING_ADDONS: map,
    getRecurringAddon: (addonKey: string) => map[addonKey],
    getRecurringAddonBySubscriptionType: (type: string) =>
      Object.values(map).find((d) => d.subscriptionType === type),
  };
});

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

describe("POST /api/addons/checkout — registry-driven recurring add-on (RA-6920 B0)", () => {
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
      id: "cs_fixture_1",
      url: "https://checkout.stripe.com/fixture",
    });
  });

  it("builds a subscription-mode session priced inline from the fixture descriptor", async () => {
    const res = await POST(makeRequest({ addonKey: "FIXTURE_ADDON" }));
    expect(res.status).toBe(200);

    expect(stripeMock.prices.create).not.toHaveBeenCalled();
    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(arg.mode).toBe("subscription");

    const lineItem = arg.line_items[0];
    expect(lineItem.price).toBeUndefined();
    expect(lineItem.price_data.unit_amount).toBe(700); // $7.00 fixture
    expect(lineItem.price_data.currency).toBe("aud");
    expect(lineItem.price_data.tax_behavior).toBe("inclusive");
    expect(lineItem.price_data.recurring).toEqual({ interval: "month" });
    expect(lineItem.price_data.product_data.name).toBe("Fixture Add-on");
    expect(lineItem.price_data.product_data.metadata.sku).toBe("FIXTURE_ADDON");

    // GST compliance preserved on the subscription session.
    expect(arg.automatic_tax).toEqual({ enabled: true });
    expect(arg.tax_id_collection).toEqual({ enabled: true });
  });

  it("stamps the subscription with the fixture's metadata marker for the webhook", async () => {
    await POST(makeRequest({ addonKey: "FIXTURE_ADDON" }));

    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(arg.subscription_data.metadata).toMatchObject({
      type: "fixture_addon_sub",
      sku: "FIXTURE_ADDON",
      workspaceId: "ws_9",
      userId: "u1",
    });
    expect(arg.metadata).toMatchObject({
      sku: "FIXTURE_ADDON",
      workspaceId: "ws_9",
      type: "addon_subscription",
    });
  });

  it("returns 404 when the buyer has no workspace to attach the entitlement to", async () => {
    vi.mocked(getWorkspaceForUser).mockResolvedValue(null);

    const res = await POST(makeRequest({ addonKey: "FIXTURE_ADDON" }));

    expect(res.status).toBe(404);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
