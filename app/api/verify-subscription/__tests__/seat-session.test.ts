import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (
      req: NextRequest,
      _s: string,
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
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const paidSession = (metadata: Record<string, string>) => ({
  id: "cs_1",
  mode: "subscription",
  status: "complete",
  payment_status: "paid",
  customer: "cus_1",
  subscription: "sub_1",
  metadata,
});

function post() {
  return POST(
    new NextRequest("http://localhost/api/verify-subscription", {
      method: "POST",
      body: JSON.stringify({ sessionId: "cs_1" }),
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("POST /api/verify-subscription with a seat session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "o@example.com" },
    } as never);
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: "sub_1",
      status: "active",
      created: 1,
      metadata: { userId: "u1" },
      items: {
        data: [
          {
            price: { recurring: { interval: "month" } },
            current_period_end: 2,
            current_period_start: 1,
          },
        ],
      },
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      subscriptionId: null,
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      subscriptionStatus: "ACTIVE",
      subscriptionPlan: "Monthly Plan",
      creditsRemaining: 0,
    } as never);
  });

  it("a seat session can never activate the $99 plan", async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValue(
      paidSession({ userId: "u1", type: "addon_subscription" }),
    );
    const res = await post();
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("a plan session still activates: the positive control", async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValue(
      paidSession({ userId: "u1" }),
    );
    const res = await post();
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });
});
