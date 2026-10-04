/**
 * RA-7893 — the pricing-config write lock reads the business owner's plan.
 *
 * The lock checked only the caller's own status === "TRIAL". An invited
 * technician has status null, so they skipped the lock even when the business
 * was on a trial or had cancelled (fail open). The effective plan now decides,
 * and anything other than an active paid plan stays locked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  users: {} as Record<string, Record<string, unknown>>,
}));
const session = vi.hoisted(() => vi.fn());

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
  },
}));

import { PUT } from "../route";

function seed(ownerStatus: string) {
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

// An empty body fails validation (400) only AFTER the plan lock has passed.
const put = () =>
  PUT(
    new NextRequest("http://localhost/api/pricing-config", {
      method: "PUT",
      body: "{}",
    }),
  );

beforeEach(() => {
  session.mockReset().mockResolvedValue({ user: { id: "tech-a" } });
});

describe("PUT /api/pricing-config — plan lock (RA-7893)", () => {
  it("locks a technician whose business is on a TRIAL", async () => {
    seed("TRIAL");
    expect((await put()).status).toBe(403);
  });

  it("locks a technician whose business has cancelled", async () => {
    seed("CANCELED");
    expect((await put()).status).toBe(403);
  });

  it("lets a technician of an ACTIVE business past the lock", async () => {
    seed("ACTIVE");
    expect((await put()).status).toBe(400);
  });

  it("lets an ACTIVE owner past the lock", async () => {
    seed("ACTIVE");
    session.mockResolvedValue({ user: { id: "owner-a" } });
    expect((await put()).status).toBe(400);
  });
});
