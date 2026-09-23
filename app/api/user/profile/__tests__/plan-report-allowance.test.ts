/**
 * RA-7714 review round 3 — GET /api/user/profile states the plan's monthly
 * report allowance (`planReportAllowance`) for every buyer type, from the
 * REAL stored user row.
 *
 * The Subscription and payment-success pages print this number. It used to
 * be `reportLimits.baseLimit`, which is 0 for a lifetime customer whose
 * stored row is the normal lifetime shape (lifetimeAccess true with status
 * CANCELED or null — see lib/billing/__tests__/subscription-gate.test.ts),
 * because getUserReportLimits reads subscriptionStatus and not
 * lifetimeAccess. That printed "0 inspection reports per month".
 *
 * Only the session, prisma and the trial helpers are mocked; the real
 * lib/report-limits.ts and lib/pricing.ts run.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getApiSession = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const addonFindMany = vi.fn();

vi.mock("@/lib/auth/get-api-session", () => ({
  getApiSession: (...a: unknown[]) => getApiSession(...a),
}));
vi.mock("@/lib/stripe", () => ({ stripe: {} }));
vi.mock("@/lib/trial-handling", () => ({
  getTrialStatus: vi.fn().mockResolvedValue(null),
  checkAndUpdateTrialStatus: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
    addonPurchase: {
      findMany: (...a: unknown[]) => addonFindMany(...a),
    },
  },
}));

const { GET } = await import("../route");

const FUTURE = new Date("2099-01-01T00:00:00Z");

function row(overrides: Record<string, unknown>) {
  return {
    id: "u_1",
    name: "Owner",
    email: "owner@example.com",
    image: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    subscriptionStatus: null,
    subscriptionPlan: null,
    subscriptionId: null,
    stripeCustomerId: "cus_1",
    trialEndsAt: null,
    subscriptionEndsAt: null,
    creditsRemaining: 0,
    totalCreditsUsed: 0,
    lastBillingDate: null,
    nextBillingDate: null,
    businessName: null,
    businessAddress: null,
    businessLogo: null,
    businessABN: null,
    businessPhone: null,
    businessEmail: null,
    addonReports: 0,
    monthlyReportsUsed: 0,
    monthlyResetDate: FUTURE,
    organizationId: null,
    lifetimeAccess: false,
    twoFactorEnabled: false,
    role: "ADMIN",
    organization: null,
    ...overrides,
  };
}

/** Every findUnique for `id` returns the stored row for that id. */
function store(rows: Record<string, ReturnType<typeof row>>) {
  userFindUnique.mockImplementation(
    async (args: { where: { id: string } }) => rows[args.where.id] ?? null,
  );
}

async function profileFor(id: string) {
  getApiSession.mockResolvedValue({ user: { id } });
  const res = await GET(new NextRequest("http://localhost/api/user/profile"));
  expect(res.status).toBe(200);
  return (await res.json()).profile;
}

beforeEach(() => {
  getApiSession.mockReset();
  userFindUnique.mockReset();
  userUpdate.mockReset();
  addonFindMany.mockReset();
  addonFindMany.mockResolvedValue([]);
  userUpdate.mockResolvedValue({});
});

describe("GET /api/user/profile — planReportAllowance per buyer type", () => {
  it.each([
    ["CANCELED", "Monthly Plan"],
    [null, null],
  ])(
    "a lifetime customer stored as status %s / plan %s gets Lifetime and 999, never 0",
    async (status, plan) => {
      store({
        u_1: row({
          lifetimeAccess: true,
          subscriptionStatus: status,
          subscriptionPlan: plan,
        }),
      });
      const profile = await profileFor("u_1");
      expect(profile.subscriptionStatus).toBe("ACTIVE");
      expect(profile.subscriptionPlan).toBe("Lifetime");
      expect(profile.planReportAllowance).toBe(999);
    },
  );

  it("a lifetime customer written by checkout fulfillment (ACTIVE / Lifetime) gets 999", async () => {
    store({
      u_1: row({
        lifetimeAccess: true,
        subscriptionStatus: "ACTIVE",
        subscriptionPlan: "Lifetime",
      }),
    });
    expect((await profileFor("u_1")).planReportAllowance).toBe(999);
  });

  it.each([
    ["Monthly Plan", 50],
    ["Yearly Plan", 70],
  ])("an ACTIVE %s subscriber gets %i", async (plan, allowance) => {
    store({
      u_1: row({ subscriptionStatus: "ACTIVE", subscriptionPlan: plan }),
    });
    const profile = await profileFor("u_1");
    expect(profile.subscriptionPlan).toBe(plan);
    expect(profile.planReportAllowance).toBe(allowance);
    // For a non-lifetime subscriber it is the enforced base limit exactly.
    expect(profile.reportLimits.baseLimit).toBe(allowance);
  });

  it("a trial user gets no plan allowance", async () => {
    store({
      u_1: row({
        subscriptionStatus: "TRIAL",
        trialEndsAt: FUTURE,
        creditsRemaining: 50,
      }),
    });
    expect((await profileFor("u_1")).planReportAllowance).toBeNull();
  });

  it("a cancelled non-lifetime user gets no plan allowance", async () => {
    store({
      u_1: row({ subscriptionStatus: "CANCELED", subscriptionPlan: "Monthly Plan" }),
    });
    expect((await profileFor("u_1")).planReportAllowance).toBeNull();
  });

  it("a team member gets the owner's plan: lifetime owner stored as CANCELED gives 999", async () => {
    store({
      tech_1: row({
        id: "tech_1",
        role: "USER",
        organizationId: "org_1",
        organization: { ownerId: "owner_1" },
        subscriptionStatus: null,
      }),
      owner_1: row({
        id: "owner_1",
        lifetimeAccess: true,
        subscriptionStatus: "CANCELED",
      }),
    });
    const profile = await profileFor("tech_1");
    expect(profile.subscriptionPlan).toBe("Lifetime");
    expect(profile.planReportAllowance).toBe(999);
  });

  it("a team member of a Yearly Plan owner gets 70", async () => {
    store({
      tech_1: row({
        id: "tech_1",
        role: "USER",
        organizationId: "org_1",
        organization: { ownerId: "owner_1" },
      }),
      owner_1: row({
        id: "owner_1",
        subscriptionStatus: "ACTIVE",
        subscriptionPlan: "Yearly Plan",
      }),
    });
    expect((await profileFor("tech_1")).planReportAllowance).toBe(70);
  });
});
