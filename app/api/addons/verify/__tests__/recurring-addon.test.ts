/**
 * /api/addons/verify — recurring add-on (BOOKKEEPING) self-heal path.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
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
  checkout: { sessions: { retrieve: vi.fn() } },
  subscriptions: { retrieve: vi.fn() },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    featureEntitlement: { upsert: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { BOOKKEEPING_ADDON_SUBSCRIPTION_TYPE } from "@/lib/billing/bookkeeping-addon";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/addons/verify", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/addons/verify — recurring BOOKKEEPING", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u_1", email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.featureEntitlement.upsert).mockResolvedValue({} as never);
  });

  it("activates FeatureEntitlement from a paid addon_subscription checkout", async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_bk",
      mode: "subscription",
      payment_status: "paid",
      status: "complete",
      subscription: "sub_bk",
      metadata: {
        userId: "u_1",
        type: "addon_subscription",
        sku: "BOOKKEEPING",
        workspaceId: "ws_1",
        addonKey: "BOOKKEEPING",
      },
    });
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: "sub_bk",
      status: "active",
      metadata: {
        type: BOOKKEEPING_ADDON_SUBSCRIPTION_TYPE,
        sku: "BOOKKEEPING",
        workspaceId: "ws_1",
        userId: "u_1",
      },
      items: { data: [{ price: { id: "price_bk" }, quantity: 1 }] },
    });

    const res = await POST(makeRequest({ sessionId: "cs_bk" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      kind: "recurring",
      sku: "BOOKKEEPING",
    });
    expect(prisma.featureEntitlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_sku: { workspaceId: "ws_1", sku: "BOOKKEEPING" },
        },
        create: expect.objectContaining({ active: true, sku: "BOOKKEEPING" }),
      }),
    );
  });

  it("rejects sessions that are not add-on purchases", async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_base",
      mode: "subscription",
      payment_status: "paid",
      metadata: { userId: "u_1", type: "base_plan" },
    });

    const res = await POST(makeRequest({ sessionId: "cs_base" }));
    expect(res.status).toBe(400);
    expect(prisma.featureEntitlement.upsert).not.toHaveBeenCalled();
  });
});
