/**
 * RA-7893 — Quick Fill reads the business owner's plan.
 *
 * Invited MANAGER/USER members were granted unlimited Quick Fill whatever the
 * owner's plan said (fail open). The effective plan now decides: unlimited for
 * an ACTIVE or in-period TRIAL owner; otherwise the owner's remaining Quick
 * Fill credits, charged to the owner.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = {
  id: string;
  role: string;
  organizationId: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  lifetimeAccess: boolean;
  quickFillCreditsRemaining: number | null;
  totalQuickFillUsed: number;
};

const db = vi.hoisted(() => ({ users: {} as Record<string, Row> }));
const updateMany = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (_r: unknown, _u: string, fn: () => unknown) => fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = db.users[where.id];
        if (!u) return null;
        return {
          ...u,
          creditsRemaining: null,
          subscriptionPlan: null,
          monthlyReportsUsed: 0,
          monthlyResetDate: null,
          addonReports: 0,
          organization: u.organizationId ? { ownerId: "owner-a" } : null,
        };
      },
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
  },
}));

import { GET, POST } from "../route";

function row(over: Partial<Row> & { id: string }): Row {
  return {
    role: "USER",
    organizationId: "org-a",
    subscriptionStatus: null,
    trialEndsAt: null,
    lifetimeAccess: false,
    quickFillCreditsRemaining: null,
    totalQuickFillUsed: 0,
    ...over,
  };
}

const req = () =>
  new NextRequest("http://localhost/api/user/quick-fill-credits", {
    method: "POST",
  });

beforeEach(() => {
  updateMany.mockReset().mockResolvedValue({ count: 0 });
  session.mockReset().mockResolvedValue({ user: { id: "tech-a" } });
  db.users = {
    "owner-a": row({
      id: "owner-a",
      role: "ADMIN",
      subscriptionStatus: "ACTIVE",
      quickFillCreditsRemaining: 0,
    }),
    "tech-a": row({ id: "tech-a" }),
    removed: row({ id: "removed", organizationId: null, quickFillCreditsRemaining: 0 }),
  };
});

describe("quick-fill credits — invited members (RA-7893)", () => {
  it("is unlimited for a technician of an ACTIVE owner", async () => {
    const body = await (await GET(req())).json();
    expect(body.hasUnlimited).toBe(true);
  });

  it("is NOT unlimited for a technician of a CANCELED owner with no credits", async () => {
    db.users["owner-a"].subscriptionStatus = "CANCELED";
    const body = await (await GET(req())).json();
    expect(body.hasUnlimited).toBe(false);
    expect(body.canUse).toBe(false);

    const res = await POST(req());
    expect(res.status).toBe(403);
  });

  it("charges the owner's Quick Fill credit, not the technician's", async () => {
    db.users["owner-a"].subscriptionStatus = "CANCELED";
    db.users["owner-a"].quickFillCreditsRemaining = 3;
    updateMany.mockResolvedValue({ count: 1 });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: "owner-a",
      quickFillCreditsRemaining: { gte: 1 },
    });
  });

  it("RA-7893 review P1: is NOT unlimited when the owner's TRIAL has ended or has no end date", async () => {
    db.users["owner-a"].subscriptionStatus = "TRIAL";
    db.users["owner-a"].trialEndsAt = new Date("2000-01-01");
    expect((await (await GET(req())).json()).hasUnlimited).toBe(false);

    db.users["owner-a"].trialEndsAt = null;
    expect((await (await GET(req())).json()).hasUnlimited).toBe(false);

    db.users["owner-a"].trialEndsAt = new Date("2099-01-01");
    expect((await (await GET(req())).json()).hasUnlimited).toBe(true);
  });

  it("gives a removed user nothing unlimited", async () => {
    session.mockResolvedValue({ user: { id: "removed" } });
    const body = await (await GET(req())).json();
    expect(body.hasUnlimited).toBe(false);
    expect(body.canUse).toBe(false);
  });
});
