/**
 * RA-6981 — a refund racing a concurrent create's increment must net to zero.
 *
 * The old refund read monthlyReportsUsed then wrote `max(0, used - 1)` as an
 * ABSOLUTE value. Under concurrency a create that incremented the counter
 * between the refund's read and its write was clobbered: the refund stamped
 * `used - 1` over the incremented `used + 1`, losing the increment (one free
 * report slot) AND over-refunding.
 *
 * The fix makes the refund a guarded atomic decrement
 * (`updateMany({ where: { monthlyReportsUsed: { gte: 1 } },
 * data: { monthlyReportsUsed: { decrement: 1 } } })`), so an increment (+1) and
 * a refund (-1) commute to a net of 0 regardless of interleaving.
 *
 * This test models the DB's atomic compare-and-set with a stateful prisma mock:
 * each updateMany runs its read+write synchronously, so a concurrent increment
 * and decrement can never observe the same stale value. Mirrors
 * report-limits.monthly-cap-toctou.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── In-memory user state + atomic updateMany mock (hoisted so the vi.mock
//    factory below can reference them at module-import time) ───────────────────
const { state, updateManyMock } = vi.hoisted(() => {
  const state = {
    subscriptionStatus: "ACTIVE" as string,
    subscriptionPlan: "Monthly Plan" as string | null, // → base limit 50
    addonReports: 0,
    creditsRemaining: 0,
    totalCreditsUsed: 0,
    monthlyReportsUsed: 0,
    monthlyResetDate: new Date("2999-01-01") as Date | null, // future ⇒ no rollover
  };

  // Atomic (synchronous body — no await) compare-and-set, modelling the DB.
  const updateManyMock = vi.fn(async ({ where, data }: any) => {
    // Rollover reset branch (deduct): data = { monthlyReportsUsed: 1, resetDate }.
    if (data.monthlyResetDate !== undefined && data.monthlyReportsUsed === 1) {
      const due =
        state.monthlyResetDate == null || state.monthlyResetDate < new Date();
      if (due) {
        state.monthlyReportsUsed = 1;
        state.monthlyResetDate = data.monthlyResetDate;
        return { count: 1 };
      }
      return { count: 0 };
    }
    // Guarded increment branch (deduct): where.monthlyReportsUsed = { lt: cap }.
    if (data.monthlyReportsUsed && data.monthlyReportsUsed.increment === 1) {
      const cap = where.monthlyReportsUsed?.lt;
      if (state.monthlyReportsUsed < cap) {
        state.monthlyReportsUsed += 1;
        return { count: 1 };
      }
      return { count: 0 };
    }
    // Guarded decrement branch (refund): where.monthlyReportsUsed = { gte: 1 }.
    if (data.monthlyReportsUsed && data.monthlyReportsUsed.decrement === 1) {
      const floor = where.monthlyReportsUsed?.gte;
      if (state.monthlyReportsUsed >= floor) {
        state.monthlyReportsUsed -= 1;
        return { count: 1 };
      }
      return { count: 0 };
    }
    return { count: 0 };
  });

  return { state, updateManyMock };
});

vi.mock("@/lib/organization-credits", () => ({
  // No org — adminId resolves to the creator's own id.
  getOrganizationOwner: vi.fn().mockResolvedValue(null),
  getEffectiveSubscription: vi.fn(),
}));

vi.mock("@/lib/trial-handling", () => ({
  checkAndUpdateTrialStatus: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({
        role: "ADMIN",
        managedById: null,
        subscriptionStatus: state.subscriptionStatus,
        subscriptionPlan: state.subscriptionPlan,
        addonReports: state.addonReports,
        creditsRemaining: state.creditsRemaining,
        totalCreditsUsed: state.totalCreditsUsed,
        monthlyReportsUsed: state.monthlyReportsUsed,
        monthlyResetDate: state.monthlyResetDate,
      })),
      updateMany: updateManyMock,
      update: vi.fn(async () => ({})),
    },
    addonPurchase: {
      findMany: vi.fn(async () => [] as Array<{ reportLimit: number }>),
    },
  },
}));

import {
  deductCreditsAndTrackUsage,
  refundCreditsAndTrackUsage,
} from "@/lib/report-limits";

function resetState(overrides: Partial<typeof state> = {}) {
  state.subscriptionStatus = "ACTIVE";
  state.subscriptionPlan = "Monthly Plan";
  state.addonReports = 0;
  state.creditsRemaining = 0;
  state.totalCreditsUsed = 0;
  state.monthlyReportsUsed = 0;
  state.monthlyResetDate = new Date("2999-01-01");
  Object.assign(state, overrides);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
});

describe("refundCreditsAndTrackUsage — ACTIVE refund/increment race (RA-6981)", () => {
  it("a refund racing a create's increment nets to +1-1 = used, never used-1", async () => {
    resetState({ monthlyReportsUsed: 5 });

    // A concurrent create (deduct → increment) and a refund (decrement) commute.
    await Promise.all([
      deductCreditsAndTrackUsage("admin-1"),
      refundCreditsAndTrackUsage("admin-1"),
    ]);

    // Net zero: +1 then -1 (in either order) lands back on the starting value.
    // The clobbering absolute write would have produced 4 (used - 1).
    expect(state.monthlyReportsUsed).toBe(5);
  });

  it("the refund leg is a guarded atomic decrement (updateMany gte 1 / decrement)", async () => {
    resetState({ monthlyReportsUsed: 3 });

    await refundCreditsAndTrackUsage("admin-1");

    expect(state.monthlyReportsUsed).toBe(2);
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: "admin-1", monthlyReportsUsed: { gte: 1 } },
      data: { monthlyReportsUsed: { decrement: 1 } },
    });
  });

  it("the gte:1 guard blocks a decrement below zero (double-refund is a no-op)", async () => {
    resetState({ monthlyReportsUsed: 0 });

    await refundCreditsAndTrackUsage("admin-1");

    // Guard did not match ⇒ no write ⇒ counter never goes negative.
    expect(state.monthlyReportsUsed).toBe(0);
  });
});
