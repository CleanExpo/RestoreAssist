/**
 * Rule 3 — every findMany is bounded with an explicit take.
 *
 * Both addonPurchase.findMany calls in this module sum a per-user set of
 * completed add-on purchases via reduce. Neither result set is paginated or
 * capped by the caller, so an unbounded query grows with an admin's lifetime of
 * purchases — one of them (deductCreditsAndTrackUsage) on every paid-tier report
 * creation. These tests assert each query carries take: 1000 (unreachable in
 * practice, so the reduce-sum semantics are unchanged).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { addonFindMany } = vi.hoisted(() => ({
  addonFindMany: vi.fn(
    async () => [] as Array<{ reportLimit: number; purchasedAt?: Date }>,
  ),
}));

vi.mock("@/lib/organization-credits", () => ({
  getOrganizationOwner: vi.fn().mockResolvedValue(null),
  getEffectiveSubscription: vi.fn(),
}));

vi.mock("@/lib/trial-handling", () => ({
  checkAndUpdateTrialStatus: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      // ACTIVE admin, future reset date ⇒ no rollover, never at the cap.
      findUnique: vi.fn(async () => ({
        role: "ADMIN",
        managedById: null,
        subscriptionStatus: "ACTIVE",
        subscriptionPlan: "Monthly Plan",
        addonReports: 0,
        creditsRemaining: 0,
        totalCreditsUsed: 0,
        monthlyReportsUsed: 0,
        monthlyResetDate: new Date("2999-01-01"),
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    addonPurchase: { findMany: addonFindMany },
  },
}));

import {
  getUserReportLimits,
  deductCreditsAndTrackUsage,
} from "@/lib/report-limits";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("report-limits — addonPurchase.findMany is take-bounded (rule 3)", () => {
  it("getUserReportLimits bounds its add-on query", async () => {
    await getUserReportLimits("user-1");

    expect(addonFindMany).toHaveBeenCalledTimes(1);
    expect(addonFindMany.mock.calls[0][0]).toMatchObject({ take: 1000 });
  });

  it("deductCreditsAndTrackUsage bounds its hot-path add-on query", async () => {
    await deductCreditsAndTrackUsage("admin-1");

    expect(addonFindMany).toHaveBeenCalledTimes(1);
    expect(addonFindMany.mock.calls[0][0]).toMatchObject({ take: 1000 });
  });
});
