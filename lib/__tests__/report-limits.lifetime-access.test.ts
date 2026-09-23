/**
 * RA-7747 — lifetime customers stored with subscriptionStatus CANCELED or null
 * could not create reports ("Monthly report limit reached").
 *
 * A lifetime buyer is identified by the `lifetimeAccess` column, not by the
 * status enum: the normal stored shape is lifetimeAccess=true with a CANCELED
 * or null status (see lib/billing/subscription-gate.ts). getEffectiveSubscription
 * maps that row to ACTIVE / "Lifetime", so canCreateReport took the ACTIVE
 * branch — then getUserReportLimits re-read the RAW row, ignored lifetimeAccess
 * and returned a 0 allowance.
 *
 * Only Prisma is mocked. getEffectiveSubscription and getOrganizationOwner run
 * for real against stored row shapes, so the team-member path (limits read from
 * the workspace owner's row) is exercised exactly as production resolves it.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const { rows, prismaMock, checkAndUpdateTrialStatus } = vi.hoisted(() => {
  const rows: Record<string, Record<string, unknown>> = {};
  return {
    rows,
    prismaMock: {
      user: {
        findUnique: vi.fn(async (args: { where: { id: string } }) =>
          rows[args.where.id] ? { ...rows[args.where.id] } : null,
        ),
        update: vi.fn(async () => ({})),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      addonPurchase: { findMany: vi.fn(async () => []) },
    },
    checkAndUpdateTrialStatus: vi.fn(async () => false),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/trial-handling", () => ({ checkAndUpdateTrialStatus }));

import {
  canCreateReport,
  canCreateBulkReports,
  getUserReportLimits,
  PLAN_REPORT_LIMITS,
} from "@/lib/report-limits";

const FUTURE_RESET = new Date("2999-01-01");
const PAST_TRIAL_END = new Date("2026-01-01");
const FUTURE_TRIAL_END = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

/** A stored User row as Prisma returns it (only the columns these paths read). */
function ownerRow(overrides: Row): Row {
  return {
    role: "ADMIN",
    organizationId: null,
    organization: null,
    subscriptionStatus: "ACTIVE",
    subscriptionPlan: null,
    lifetimeAccess: false,
    creditsRemaining: 0,
    addonReports: 0,
    monthlyReportsUsed: 0,
    monthlyResetDate: FUTURE_RESET,
    trialEndsAt: null,
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

/** A team member (technician) whose workspace is owned by `ownerId`. */
function memberRow(ownerId: string): Row {
  return ownerRow({
    role: "USER",
    organizationId: "org-1",
    organization: { ownerId },
    subscriptionStatus: "TRIAL",
    lifetimeAccess: false,
  });
}

function seed(id: string, row: Row) {
  rows[id] = { id, ...row };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(rows)) delete rows[k];
});

describe("RA-7747 — lifetime rows stored CANCELED / null can create reports", () => {
  it("getUserReportLimits gives lifetimeAccess + CANCELED the Lifetime allowance", async () => {
    seed(
      "life-canceled",
      ownerRow({
        subscriptionStatus: "CANCELED",
        subscriptionPlan: null,
        lifetimeAccess: true,
        trialEndsAt: PAST_TRIAL_END,
      }),
    );

    const limits = await getUserReportLimits("life-canceled");
    expect(limits.baseLimit).toBe(PLAN_REPORT_LIMITS.Lifetime);
    expect(limits.availableReports).toBe(PLAN_REPORT_LIMITS.Lifetime);
  });

  it("getUserReportLimits gives lifetimeAccess + null status the Lifetime allowance", async () => {
    seed(
      "life-null",
      ownerRow({
        subscriptionStatus: null,
        subscriptionPlan: "Lifetime",
        lifetimeAccess: true,
      }),
    );

    const limits = await getUserReportLimits("life-null");
    expect(limits.baseLimit).toBe(PLAN_REPORT_LIMITS.Lifetime);
    expect(limits.availableReports).toBe(PLAN_REPORT_LIMITS.Lifetime);
  });

  it("getUserReportLimits gives lifetimeAccess bought mid-trial (still TRIAL) the Lifetime allowance", async () => {
    seed(
      "life-trial",
      ownerRow({
        subscriptionStatus: "TRIAL",
        subscriptionPlan: null,
        lifetimeAccess: true,
        trialEndsAt: FUTURE_TRIAL_END,
      }),
    );

    const limits = await getUserReportLimits("life-trial");
    expect(limits.baseLimit).toBe(PLAN_REPORT_LIMITS.Lifetime);
  });

  it("canCreateReport ALLOWS the lifetime owner stored CANCELED", async () => {
    seed(
      "life-canceled",
      ownerRow({
        subscriptionStatus: "CANCELED",
        lifetimeAccess: true,
        trialEndsAt: PAST_TRIAL_END,
      }),
    );

    const res = await canCreateReport("life-canceled");
    expect(res).toEqual({ allowed: true });
  });

  it("canCreateReport ALLOWS the lifetime owner stored with null status", async () => {
    seed(
      "life-null",
      ownerRow({ subscriptionStatus: null, lifetimeAccess: true }),
    );

    const res = await canCreateReport("life-null");
    expect(res).toEqual({ allowed: true });
  });

  it("canCreateReport ALLOWS a team member whose workspace owner is lifetime + CANCELED", async () => {
    seed(
      "owner-life",
      ownerRow({ subscriptionStatus: "CANCELED", lifetimeAccess: true }),
    );
    seed("tech-1", memberRow("owner-life"));

    const res = await canCreateReport("tech-1");
    expect(res).toEqual({ allowed: true });
  });

  it("canCreateBulkReports ALLOWS a lifetime + CANCELED owner a batch inside the allowance", async () => {
    seed(
      "life-canceled",
      ownerRow({ subscriptionStatus: "CANCELED", lifetimeAccess: true }),
    );

    const res = await canCreateBulkReports("life-canceled", 5);
    expect(res).toEqual({ allowed: true });
  });

  it("the lifetime allowance is still a monthly cap (usage counts against it)", async () => {
    seed(
      "life-canceled",
      ownerRow({
        subscriptionStatus: "CANCELED",
        lifetimeAccess: true,
        monthlyReportsUsed: PLAN_REPORT_LIMITS.Lifetime,
      }),
    );

    const res = await canCreateReport("life-canceled");
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/monthly report limit reached/i);
  });
});

describe("RA-7747 — pinned behaviour that must NOT change", () => {
  it("genuinely cancelled (lifetimeAccess false) is refused and gets no allowance", async () => {
    seed(
      "cancelled",
      ownerRow({
        subscriptionStatus: "CANCELED",
        subscriptionPlan: "Monthly Plan",
        lifetimeAccess: false,
      }),
    );

    expect(await canCreateReport("cancelled")).toEqual({
      allowed: false,
      reason: "Active subscription required to create reports.",
    });
    const limits = await getUserReportLimits("cancelled");
    expect(limits.baseLimit).toBe(0);
    expect(limits.availableReports).toBe(0);
  });

  it("cancelled with lifetimeAccess null (nullable column) is refused and gets no allowance", async () => {
    seed(
      "cancelled-null",
      ownerRow({ subscriptionStatus: "CANCELED", lifetimeAccess: null }),
    );

    expect((await canCreateReport("cancelled-null")).allowed).toBe(false);
    expect((await getUserReportLimits("cancelled-null")).baseLimit).toBe(0);
  });

  it("no-status account without lifetimeAccess is refused", async () => {
    seed("nostatus", ownerRow({ subscriptionStatus: null }));

    expect((await canCreateReport("nostatus")).allowed).toBe(false);
    expect((await getUserReportLimits("nostatus")).baseLimit).toBe(0);
  });

  it("team member of a genuinely cancelled owner is refused", async () => {
    seed(
      "owner-cancelled",
      ownerRow({ subscriptionStatus: "CANCELED", lifetimeAccess: false }),
    );
    seed("tech-2", memberRow("owner-cancelled"));

    expect((await canCreateReport("tech-2")).allowed).toBe(false);
  });

  it("ACTIVE Monthly Plan keeps its Monthly allowance", async () => {
    seed(
      "monthly",
      ownerRow({ subscriptionPlan: "Monthly Plan", lifetimeAccess: false }),
    );

    const limits = await getUserReportLimits("monthly");
    expect(limits.baseLimit).toBe(PLAN_REPORT_LIMITS["Monthly Plan"]);
    expect(await canCreateReport("monthly")).toEqual({ allowed: true });
  });

  it("ACTIVE Monthly Plan at its cap is still refused", async () => {
    seed(
      "monthly-full",
      ownerRow({
        subscriptionPlan: "Monthly Plan",
        monthlyReportsUsed: PLAN_REPORT_LIMITS["Monthly Plan"],
      }),
    );

    const res = await canCreateReport("monthly-full");
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/monthly report limit reached/i);
  });

  it("ACTIVE Yearly Plan keeps its Yearly allowance", async () => {
    seed(
      "yearly",
      ownerRow({ subscriptionPlan: "Yearly Plan", lifetimeAccess: null }),
    );

    expect((await getUserReportLimits("yearly")).baseLimit).toBe(
      PLAN_REPORT_LIMITS["Yearly Plan"],
    );
  });

  it("ACTIVE + Lifetime plan from checkout keeps the Lifetime allowance", async () => {
    seed(
      "checkout-life",
      ownerRow({ subscriptionPlan: "Lifetime", lifetimeAccess: true }),
    );

    expect((await getUserReportLimits("checkout-life")).baseLimit).toBe(
      PLAN_REPORT_LIMITS.Lifetime,
    );
  });

  it("TRIAL (no lifetimeAccess) gets no monthly allowance and uses trial credits", async () => {
    seed(
      "trial",
      ownerRow({
        subscriptionStatus: "TRIAL",
        creditsRemaining: 5,
        trialEndsAt: FUTURE_TRIAL_END,
      }),
    );

    expect((await getUserReportLimits("trial")).baseLimit).toBe(0);
    expect(await canCreateReport("trial")).toEqual({ allowed: true });
  });

  it("TRIAL with no credits left is still refused", async () => {
    seed(
      "trial-empty",
      ownerRow({
        subscriptionStatus: "TRIAL",
        creditsRemaining: 0,
        trialEndsAt: FUTURE_TRIAL_END,
      }),
    );

    const res = await canCreateReport("trial-empty");
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/trial report limit reached/i);
  });
});
