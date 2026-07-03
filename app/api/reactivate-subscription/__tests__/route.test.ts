/**
 * RA-6962 — reactivate-subscription correctness.
 *
 *   401         — no authenticated session.
 *   404         — no resolvable customer / no subscription.
 *   happy path  — reactivates the matched subscription with
 *                 cancel_at_period_end=false and syncs local status to ACTIVE.
 *   wrong-cust  — RA-6939 regression guard: with a stored stripeCustomerId +
 *                 subscriptionId the route acts on the user's OWN subscription
 *                 and never falls back to the shared-email customer lookup.
 *
 * Stripe, next-auth, rate-limiter and Prisma are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));

const stripeMock = vi.hoisted(() => ({
  customers: { list: vi.fn() },
  subscriptions: { list: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

function makeRequest() {
  return new NextRequest("http://localhost/api/reactivate-subscription", {
    method: "POST",
  });
}

describe("POST /api/reactivate-subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      stripeCustomerId: "cus_1",
      subscriptionId: "sub_1",
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
    stripeMock.subscriptions.update.mockResolvedValue({ id: "sub_1" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
  });

  it("returns 404 when no Stripe customer can be resolved", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      stripeCustomerId: null,
      subscriptionId: null,
    } as never);
    stripeMock.customers.list.mockResolvedValue({ data: [] });

    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the customer has no subscription", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      stripeCustomerId: "cus_1",
      subscriptionId: null,
    } as never);
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });

    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
  });

  it("reactivates the matched subscription with cancel_at_period_end=false and syncs ACTIVE", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith("sub_1", {
      cancel_at_period_end: false,
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({ subscriptionStatus: "ACTIVE" }),
      }),
    );
  });

  it("uses the stored customer + subscription id and never the shared-email lookup (RA-6939)", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(stripeMock.customers.list).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.list).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith("sub_1", {
      cancel_at_period_end: false,
    });
  });
});
