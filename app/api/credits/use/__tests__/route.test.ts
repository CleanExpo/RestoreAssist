/**
 * RA-6966 — POST /api/credits/use behavioural tests.
 *
 * Covers the critical-path invariants:
 *   1. 401 with no session.
 *   2. 402 for a CANCELED/PAST_DUE effective subscription (hard paywall).
 *   3. Happy path atomically decrements the credit balance via
 *      `updateMany({ where: { creditsRemaining: { gte } } })` — never a
 *      read-then-write — and 402s with no mutation when the balance is
 *      insufficient.
 *   4. A Manager/Technician's spend is scoped to the ORG OWNER's balance
 *      (getOrganizationOwner), not their own row.
 *   5. ACTIVE/LIFETIME subscribers track usage without touching
 *      creditsRemaining (unlimited).
 *
 * No Idempotency-Key header is sent in any request, so withIdempotency
 * (real, unmocked) passes straight through to the handler — same pattern
 * as app/api/verify-subscription/__tests__/route.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const getEffectiveSubscription = vi.fn();
const getOrganizationOwner = vi.fn();
const userUpdateMany = vi.fn();
const userUpdate = vi.fn();
const userFindUnique = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/organization-credits", () => ({
  getEffectiveSubscription: (...args: unknown[]) =>
    getEffectiveSubscription(...args),
  getOrganizationOwner: (...args: unknown[]) => getOrganizationOwner(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      updateMany: (...args: unknown[]) => userUpdateMany(...args),
      update: (...args: unknown[]) => userUpdate(...args),
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
  },
}));

import { POST } from "../route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/credits/use", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  applyRateLimit.mockResolvedValue(null); // not rate-limited
  getOrganizationOwner.mockResolvedValue("user-1"); // solo admin by default
});

describe("POST /api/credits/use — auth + paywall", () => {
  it("401 when there is no session", async () => {
    getServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(401);
    expect(getEffectiveSubscription).not.toHaveBeenCalled();
  });

  it.each(["CANCELED", "PAST_DUE"])(
    "402 when the effective subscription status is %s",
    async (status) => {
      getEffectiveSubscription.mockResolvedValue({
        id: "user-1",
        subscriptionStatus: status,
        creditsRemaining: 10,
      });

      const res = await POST(makeRequest({}));
      const json = await res.json();

      expect(res.status).toBe(402);
      expect(json.upgradeRequired).toBe(true);
      expect(userUpdateMany).not.toHaveBeenCalled();
      expect(userUpdate).not.toHaveBeenCalled();
    },
  );

  it("404 when the effective subscription lookup finds no user", async () => {
    getEffectiveSubscription.mockResolvedValue(null);

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(404);
  });
});

describe("POST /api/credits/use — atomic credit deduction (TRIAL)", () => {
  it("decrements the caller's own balance atomically and returns the new total", async () => {
    getEffectiveSubscription.mockResolvedValue({
      id: "user-1",
      subscriptionStatus: "TRIAL",
      creditsRemaining: 5,
    });
    userUpdateMany.mockResolvedValue({ count: 1 });
    userFindUnique.mockResolvedValue({
      creditsRemaining: 4,
      totalCreditsUsed: 1,
      subscriptionStatus: "TRIAL",
    });

    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.creditsRemaining).toBe(4);

    // Atomic compare-and-decrement — never a plain `update` with a
    // pre-read balance check.
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: "user-1", creditsRemaining: { gte: 1 } },
      data: {
        creditsRemaining: { decrement: 1 },
        totalCreditsUsed: { increment: 1 },
      },
    });
  });

  it("402s with no mutation when the balance is insufficient (updateMany count 0)", async () => {
    getEffectiveSubscription.mockResolvedValue({
      id: "user-1",
      subscriptionStatus: "TRIAL",
      creditsRemaining: 0,
    });
    userUpdateMany.mockResolvedValue({ count: 0 });

    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(402);
    expect(json.upgradeRequired).toBe(true);
    expect(json.creditsRemaining).toBe(0);
    // Nothing was re-read because nothing was written.
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("scopes the deduction to the ORG OWNER's balance for a Manager/Technician caller, not their own row", async () => {
    getServerSession.mockResolvedValue({ user: { id: "manager-1" } });
    getOrganizationOwner.mockResolvedValue("owner-9");
    getEffectiveSubscription.mockResolvedValue({
      id: "owner-9",
      subscriptionStatus: "TRIAL",
      creditsRemaining: 5,
    });
    userUpdateMany.mockResolvedValue({ count: 1 });
    userFindUnique.mockResolvedValue({
      creditsRemaining: 4,
      totalCreditsUsed: 1,
      subscriptionStatus: "TRIAL",
    });

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);

    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "owner-9" }) }),
    );
  });

  it("rejects a non-integer/out-of-range credits value without touching the balance", async () => {
    getEffectiveSubscription.mockResolvedValue({
      id: "user-1",
      subscriptionStatus: "TRIAL",
      creditsRemaining: 5,
    });

    const res = await POST(makeRequest({ credits: 0 }));

    expect(res.status).toBe(400);
    expect(userUpdateMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/credits/use — ACTIVE/LIFETIME subscribers (unlimited)", () => {
  it("tracks usage via a plain update and does not touch creditsRemaining", async () => {
    getEffectiveSubscription.mockResolvedValue({
      id: "user-1",
      subscriptionStatus: "ACTIVE",
      creditsRemaining: 999999,
    });
    userUpdate.mockResolvedValue({
      creditsRemaining: 999999,
      totalCreditsUsed: 42,
      subscriptionStatus: "ACTIVE",
    });

    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { totalCreditsUsed: { increment: 1 } },
      }),
    );
  });
});
