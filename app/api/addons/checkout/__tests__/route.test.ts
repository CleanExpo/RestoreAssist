/**
 * RA-6967/6968 — addons checkout hardening.
 *
 *   inline price — no per-checkout stripe.prices.create; the add-on is priced
 *                  inline via line_items[].price_data (GST-inclusive).
 *   trusted base — success/cancel URLs come from getAppUrl(), never the
 *                  attacker-influencable Origin/Host request headers.
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

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new NextRequest("http://localhost/api/addons/checkout", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("POST /api/addons/checkout (RA-6967/6968)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      subscriptionStatus: "ACTIVE",
      stripeCustomerId: "cus_1",
      subscriptionId: "sub_1",
    } as never);
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: "cs_addon_1",
      url: "https://checkout.stripe.com/x",
    });
  });

  it("prices the add-on inline and never creates a Stripe Price", async () => {
    const res = await POST(makeRequest({ addonKey: "pack8" }));
    expect(res.status).toBe(200);

    expect(stripeMock.prices.create).not.toHaveBeenCalled();
    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    const lineItem = arg.line_items[0];
    expect(lineItem.price).toBeUndefined();
    expect(lineItem.price_data.unit_amount).toBe(2000); // $20.00 pack8
    expect(lineItem.price_data.tax_behavior).toBe("inclusive");
    expect(lineItem.price_data.currency).toBe("aud");
    // GST compliance preserved on the session.
    expect(arg.automatic_tax).toEqual({ enabled: true });
    expect(arg.tax_id_collection).toEqual({ enabled: true });
  });

  it("builds success/cancel URLs from the trusted base, not the Origin header", async () => {
    const res = await POST(
      makeRequest(
        { addonKey: "pack8" },
        { origin: "https://evil.example", host: "evil.example" },
      ),
    );
    expect(res.status).toBe(200);

    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(arg.success_url).toContain("https://restoreassist.app");
    expect(arg.cancel_url).toContain("https://restoreassist.app");
    expect(arg.success_url).not.toContain("evil.example");
    expect(arg.cancel_url).not.toContain("evil.example");
  });
});

describe("POST /api/addons/checkout — FLOORPLAN_UNDERLAY recurring add-on (RA-6922)", () => {
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
      id: "cs_floorplan_1",
      url: "https://checkout.stripe.com/floorplan",
    });
  });

  it("builds a subscription-mode session priced inline at $11/mo GST-inclusive", async () => {
    const res = await POST(makeRequest({ addonKey: "FLOORPLAN_UNDERLAY" }));
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

    // GST compliance preserved on the subscription session.
    expect(arg.automatic_tax).toEqual({ enabled: true });
    expect(arg.tax_id_collection).toEqual({ enabled: true });
  });

  it("stamps the subscription with the workspace id + SKU for the webhook", async () => {
    await POST(makeRequest({ addonKey: "FLOORPLAN_UNDERLAY" }));

    const arg = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(arg.subscription_data.metadata).toMatchObject({
      type: "floorplan_underlay_addon",
      sku: "FLOORPLAN_UNDERLAY",
      workspaceId: "ws_1",
      userId: "u1",
    });
    expect(arg.metadata).toMatchObject({
      sku: "FLOORPLAN_UNDERLAY",
      workspaceId: "ws_1",
      type: "addon_subscription",
    });
  });

  it("returns 404 when the user has no workspace to attach the entitlement to", async () => {
    vi.mocked(getWorkspaceForUser).mockResolvedValue(null);

    const res = await POST(makeRequest({ addonKey: "FLOORPLAN_UNDERLAY" }));

    expect(res.status).toBe(404);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("still requires an active base subscription", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      subscriptionStatus: "CANCELED",
      stripeCustomerId: "cus_1",
      subscriptionId: null,
    } as never);

    const res = await POST(makeRequest({ addonKey: "FLOORPLAN_UNDERLAY" }));

    expect(res.status).toBe(403);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
