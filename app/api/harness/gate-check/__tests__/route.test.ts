/**
 * RA-7893 — POST /api/harness/gate-check uses the shared, owner-aware
 * subscription gate instead of the caller's own status.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  users: {} as Record<string, Record<string, unknown>>,
}));
const session = vi.hoisted(() => vi.fn());
const runGateCheck = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/harness/gate-check", () => ({ runGateCheck }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        db.users[where.id] ?? null,
    },
  },
}));

import { POST } from "../route";

const base = {
  creditsRemaining: null,
  subscriptionPlan: null,
  monthlyReportsUsed: 0,
  monthlyResetDate: null,
  trialEndsAt: null,
  addonReports: 0,
  lifetimeAccess: false,
};

beforeEach(() => {
  runGateCheck.mockReset();
  session.mockReset().mockResolvedValue({ user: { id: "tech-a" } });
  db.users = {
    "owner-a": {
      ...base,
      id: "owner-a",
      role: "ADMIN",
      organizationId: "org-a",
      organization: { ownerId: "owner-a" },
      subscriptionStatus: "TRIAL",
      trialEndsAt: new Date("2099-01-01"),
    },
    "tech-a": {
      ...base,
      id: "tech-a",
      role: "USER",
      organizationId: "org-a",
      organization: { ownerId: "owner-a" },
      subscriptionStatus: null,
    },
    removed: {
      ...base,
      id: "removed",
      role: "USER",
      organizationId: null,
      organization: null,
      subscriptionStatus: null,
    },
  };
});

// Invalid JSON is rejected (400) only after the subscription gate passes.
const post = () =>
  POST(
    new NextRequest("http://localhost/api/harness/gate-check", {
      method: "POST",
      body: "not json",
    }),
  );

describe("POST /api/harness/gate-check — subscription gate (RA-7893)", () => {
  it("lets a technician of a trialing business past the gate", async () => {
    expect((await post()).status).not.toBe(402);
  });

  it("refuses with 402 when the business owner has cancelled", async () => {
    db.users["owner-a"].subscriptionStatus = "CANCELED";
    expect((await post()).status).toBe(402);
  });

  it("refuses with 402 for a user removed from the organisation", async () => {
    session.mockResolvedValue({ user: { id: "removed" } });
    expect((await post()).status).toBe(402);
  });
});
