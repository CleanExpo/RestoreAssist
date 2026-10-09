/**
 * RA-7893 — the pricing-config write lock reads the business owner's plan.
 *
 * The lock checked only the caller's own status === "TRIAL". An invited
 * technician has status null, so they skipped the lock even when the business
 * was on a trial or had cancelled (fail open). The effective plan now decides,
 * and anything other than an active paid plan stays locked.
 *
 * RA-paid-client tranche 1 — the role check (`verifyAdminFromDb`) runs
 * before the subscription lock: a non-admin (e.g. an invited technician)
 * never reaches the plan lock, so the technician-of-ACTIVE test below
 * now expects 403 (role) rather than 400 (validation, post-lock).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  users: {} as Record<string, Record<string, unknown>>,
}));
const session = vi.hoisted(() => vi.fn());
const writes = vi.hoisted(() => ({
  company: vi.fn(),
  organization: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/services/integrations/ai-readiness", () => ({
  hasConfiguredAi: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        db.users[where.id] ?? null,
    },
    organization: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "org-a" ? { ownerId: "owner-a" } : null,
    },
    companyPricingConfig: { upsert: writes.company },
    organizationPricingConfig: { upsert: writes.organization },
  },
}));

import { PUT } from "../route";

function seed(ownerStatus: string | null) {
  const base = {
    creditsRemaining: null,
    subscriptionPlan: null,
    monthlyReportsUsed: 0,
    monthlyResetDate: null,
    trialEndsAt: null,
    addonReports: 0,
    lifetimeAccess: false,
  };
  db.users = {
    "owner-a": {
      ...base,
      id: "owner-a",
      role: "ADMIN",
      organizationId: "org-a",
      organization: { ownerId: "owner-a" },
      subscriptionStatus: ownerStatus,
    },
    "tech-a": {
      ...base,
      id: "tech-a",
      role: "USER",
      organizationId: "org-a",
      organization: { ownerId: "owner-a" },
      subscriptionStatus: null,
    },
  };
}

// An empty body fails validation (400) only AFTER both the role check and
// the plan lock have passed.
const put = () =>
  PUT(
    new NextRequest("http://localhost/api/pricing-config", {
      method: "PUT",
      body: "{}",
    }),
  );

beforeEach(() => {
  session.mockReset().mockResolvedValue({ user: { id: "tech-a", role: "USER" } });
  writes.company.mockReset();
  writes.organization.mockReset();
});

const asOwner = () =>
  session.mockResolvedValue({ user: { id: "owner-a", role: "ADMIN" } });

// The role lock is a bare 403 { error: "Forbidden" }; only the plan lock
// carries this message, so it proves which lock answered.
const expectPlanLocked = async () => {
  const res = await put();
  expect(res.status).toBe(403);
  expect((await res.json()).error?.message).toMatch(/locked for free users/);
  expect(writes.company).not.toHaveBeenCalled();
  expect(writes.organization).not.toHaveBeenCalled();
};

// The owner passes the DB role check, so these reach the paid-plan lock
// itself. Without the lock an empty body would fall through to 400.
describe("PUT /api/pricing-config — paid-plan lock for an ADMIN owner", () => {
  it("locks an owner on a TRIAL", async () => {
    seed("TRIAL");
    asOwner();
    await expectPlanLocked();
  });

  it("locks an owner whose plan is CANCELED", async () => {
    seed("CANCELED");
    asOwner();
    await expectPlanLocked();
  });

  it("locks an owner with no plan at all", async () => {
    seed(null);
    asOwner();
    await expectPlanLocked();
  });
});

describe("PUT /api/pricing-config — plan lock (RA-7893)", () => {
  it("locks a technician whose business is on a TRIAL", async () => {
    seed("TRIAL");
    // Non-admin role is rejected before the plan lock runs — status is
    // still 403, just from a different lock than the original test.
    expect((await put()).status).toBe(403);
  });

  it("locks a technician whose business has cancelled", async () => {
    seed("CANCELED");
    expect((await put()).status).toBe(403);
  });

  it("rejects a technician even when their business is ACTIVE (RA-paid-client tranche 1)", async () => {
    // The role check now runs before the plan lock. A non-admin
    // (invited technician) is rejected regardless of subscription
    // state, so the prior 400 outcome no longer applies.
    seed("ACTIVE");
    expect((await put()).status).toBe(403);
  });

  it("lets an ACTIVE owner past both locks (validation 400 on empty body)", async () => {
    seed("ACTIVE");
    session.mockResolvedValue({ user: { id: "owner-a", role: "ADMIN" } });
    expect((await put()).status).toBe(400);
  });
});
