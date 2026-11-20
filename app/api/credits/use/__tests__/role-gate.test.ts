/**
 * C2 — the technician (Role USER) must not spend the business's credits.
 *
 * POST /api/credits/use decrements the ORGANISATION OWNER's balance
 * (getOrganizationOwner), so a USER could drain the owner's paid credits.
 * The role is re-read from the database and only ADMIN or MANAGER may spend;
 * USER gets 403 before anything is read or decremented.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getServerSession,
  applyRateLimit,
  getEffectiveSubscription,
  getOrganizationOwner,
  userUpdateMany,
  userUpdate,
  userFindUnique,
} = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  applyRateLimit: vi.fn(),
  getEffectiveSubscription: vi.fn(),
  getOrganizationOwner: vi.fn(),
  userUpdateMany: vi.fn(),
  userUpdate: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit }));
vi.mock("@/lib/organization-credits", () => ({
  getEffectiveSubscription,
  getOrganizationOwner,
  getMembershipStart: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      updateMany: userUpdateMany,
      update: userUpdate,
      findUnique: userFindUnique,
    },
  },
}));

import { POST } from "../route";

type Role = "USER" | "MANAGER" | "ADMIN";

const request = () =>
  new NextRequest("http://localhost/api/credits/use", {
    method: "POST",
    body: JSON.stringify({ credits: 1 }),
    headers: { "Content-Type": "application/json" },
  });

/** The role read answers with `role`; the post-decrement read-back with the balance. */
function dbRole(role: Role | null) {
  userFindUnique.mockImplementation(async (args: { select?: Record<string, unknown> }) => {
    if (args?.select && "role" in args.select) {
      return role === null ? null : { id: "tech-1", role };
    }
    return { creditsRemaining: 9, totalCreditsUsed: 1, subscriptionStatus: "TRIAL" };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  applyRateLimit.mockResolvedValue(null);
  getOrganizationOwner.mockResolvedValue("owner-1");
  getEffectiveSubscription.mockResolvedValue({
    id: "owner-1",
    subscriptionStatus: "TRIAL",
    creditsRemaining: 10,
  });
  userUpdateMany.mockResolvedValue({ count: 1 });
});

describe("C2: POST /api/credits/use refuses Role USER", () => {
  it("USER gets 403 and the owner's creditsRemaining is never touched", async () => {
    getServerSession.mockResolvedValue({ user: { id: "tech-1", role: "USER" } });
    dbRole("USER");

    const res = await POST(request());

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(getEffectiveSubscription).not.toHaveBeenCalled();
  });

  it("a stale MANAGER claim is refused when the database says USER", async () => {
    getServerSession.mockResolvedValue({ user: { id: "tech-1", role: "MANAGER" } });
    dbRole("USER");

    const res = await POST(request());

    expect(res.status).toBe(403);
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("a missing user row is refused", async () => {
    getServerSession.mockResolvedValue({ user: { id: "tech-1", role: "ADMIN" } });
    dbRole(null);

    const res = await POST(request());

    expect(res.status).toBe(403);
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  for (const role of ["ADMIN", "MANAGER"] as const) {
    it(`${role} still spends from the owner's balance`, async () => {
      getServerSession.mockResolvedValue({ user: { id: "tech-1", role } });
      dbRole(role);

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(userUpdateMany).toHaveBeenCalledTimes(1);
      expect(userUpdateMany.mock.calls[0][0].where).toEqual({
        id: "owner-1",
        creditsRemaining: { gte: 1 },
      });
    });
  }
});
