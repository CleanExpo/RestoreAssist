/**
 * RA-6968 — ACTIVE-subscriber monthly report cap is enforced ATOMICALLY.
 *
 * The paid monthly cap used to be a check-then-increment split across
 * canCreateReport() (read) and deductCreditsAndTrackUsage() (write). Under
 * concurrency two creates could both read availableReports > 0 and both
 * increment, pushing a paid account past its monthly limit (TOCTOU).
 *
 * The fix moves the enforcement into deductCreditsAndTrackUsage as a single
 * guarded `updateMany({ where: { monthlyReportsUsed: { lt: limit } },
 * data: { monthlyReportsUsed: { increment: 1 } } })`. count === 0 ⇒ limit
 * reached ⇒ throw INSUFFICIENT_CREDITS (the shared 402 sentinel).
 *
 * These tests model the DB's atomic compare-and-set with a stateful prisma
 * mock: each updateMany call runs its read+write synchronously, so no two
 * concurrent increments can both observe the same under-limit value.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── In-memory user state the prisma mock reads/writes ───────────────────────────
const state = {
  subscriptionStatus: "ACTIVE" as string,
  subscriptionPlan: "Monthly Plan" as string | null, // → base limit 50
  addonReports: 0,
  creditsRemaining: 0,
  totalCreditsUsed: 0,
  monthlyReportsUsed: 0,
  monthlyResetDate: new Date("2999-01-01") as Date | null, // future ⇒ no rollover
};

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
      // Atomic (synchronous body — no await) compare-and-set, modelling the DB.
      updateMany: vi.fn(async ({ where, data }: any) => {
        // Rollover reset branch: data = { monthlyReportsUsed: 1, monthlyResetDate }.
        if (data.monthlyResetDate !== undefined && data.monthlyReportsUsed === 1) {
          const due =
            state.monthlyResetDate == null ||
            state.monthlyResetDate < new Date();
          if (due) {
            state.monthlyReportsUsed = 1;
            state.monthlyResetDate = data.monthlyResetDate;
            return { count: 1 };
          }
          return { count: 0 };
        }
        // Guarded increment branch: where.monthlyReportsUsed = { lt: cap }.
        if (
          data.monthlyReportsUsed &&
          data.monthlyReportsUsed.increment === 1
        ) {
          const cap = where.monthlyReportsUsed?.lt;
          if (state.monthlyReportsUsed < cap) {
            state.monthlyReportsUsed += 1;
            return { count: 1 };
          }
          return { count: 0 };
        }
        return { count: 0 };
      }),
      update: vi.fn(async () => ({})),
    },
    addonPurchase: {
      findMany: vi.fn(async () => [] as Array<{ reportLimit: number }>),
    },
  },
}));

import { deductCreditsAndTrackUsage } from "@/lib/report-limits";

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

describe("deductCreditsAndTrackUsage — ACTIVE monthly cap (RA-6968)", () => {
  it("a legitimate under-limit create succeeds and increments once", async () => {
    resetState({ monthlyReportsUsed: 10 }); // limit 50

    await expect(deductCreditsAndTrackUsage("admin-1")).resolves.toBeUndefined();

    expect(state.monthlyReportsUsed).toBe(11);
  });

  it("concurrent creates cannot exceed the paid limit", async () => {
    // Base limit 50, no add-ons. Start 2 below the cap: only 2 of 6 concurrent
    // creates may succeed; the rest must be blocked.
    resetState({ monthlyReportsUsed: 48 });

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => deductCreditsAndTrackUsage("admin-1")),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter(
      (r) =>
        r.status === "rejected" &&
        (r.reason as Error).message === "INSUFFICIENT_CREDITS",
    ).length;

    // Never past the cap, and every over-limit attempt is a clean 402 signal.
    expect(state.monthlyReportsUsed).toBe(50);
    expect(fulfilled).toBe(2);
    expect(rejected).toBe(4);
  });

  it("blocks at the cap with INSUFFICIENT_CREDITS (mapped to 402 by callers)", async () => {
    resetState({ monthlyReportsUsed: 50 }); // already at limit 50

    await expect(deductCreditsAndTrackUsage("admin-1")).rejects.toThrow(
      "INSUFFICIENT_CREDITS",
    );
    expect(state.monthlyReportsUsed).toBe(50); // unchanged — nothing to refund
  });

  it("add-on packs raise the cap (base 50 + 20 add-on)", async () => {
    resetState({ monthlyReportsUsed: 50, addonReports: 20 }); // limit 70

    await expect(deductCreditsAndTrackUsage("admin-1")).resolves.toBeUndefined();
    expect(state.monthlyReportsUsed).toBe(51);
  });

  it("rollover resets usage to 1 for the new period regardless of prior count", async () => {
    // Period has elapsed and the prior count was maxed out.
    resetState({
      monthlyReportsUsed: 50,
      monthlyResetDate: new Date("2000-01-01"),
    });

    await expect(deductCreditsAndTrackUsage("admin-1")).resolves.toBeUndefined();

    // Fresh period: this create is counted as the first, not blocked.
    expect(state.monthlyReportsUsed).toBe(1);
    expect(state.monthlyResetDate!.getTime()).toBeGreaterThan(Date.now());
  });
});
