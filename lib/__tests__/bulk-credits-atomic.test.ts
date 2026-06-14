/**
 * Tests for the atomic, guarded bulk-duplicate credit deduct
 * (lib/bulk-operations.ts → deductBulkCredits / refundBulkCredits).
 *
 * Regression target (TOCTOU): the bulk-duplicate flow used to read the balance
 * (canCreateBulkReports), create the reports, then run an UNCONDITIONAL
 * `decrement`. Two concurrent bulk jobs could both pass the read-check and both
 * decrement, driving `creditsRemaining` NEGATIVE / over-issuing reports. The
 * fix mirrors the single-report path: a single `updateMany` guarded by
 * `creditsRemaining >= count`, so a deduct that would overdraw fails instead of
 * going negative.
 *
 * These tests model the real Postgres `updateMany ... WHERE creditsRemaining
 * >= n` semantics with an in-memory balance, so concurrent deducts behave the
 * way the database actually would.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory user store that emulates atomic guarded updateMany semantics.
const store = new Map<string, { creditsRemaining: number; totalCreditsUsed: number }>();

const updateMany = vi.fn(
  async (args: {
    where: { id: string; creditsRemaining?: { gte: number } };
    data: {
      creditsRemaining?: { decrement?: number; increment?: number };
      totalCreditsUsed?: { increment?: number; decrement?: number };
    };
  }) => {
    const row = store.get(args.where.id);
    if (!row) return { count: 0 };
    // Emulate the WHERE guard: only matches if balance covers the gte threshold.
    const gte = args.where.creditsRemaining?.gte;
    if (gte !== undefined && row.creditsRemaining < gte) {
      return { count: 0 };
    }
    if (args.data.creditsRemaining?.decrement)
      row.creditsRemaining -= args.data.creditsRemaining.decrement;
    if (args.data.creditsRemaining?.increment)
      row.creditsRemaining += args.data.creditsRemaining.increment;
    if (args.data.totalCreditsUsed?.increment)
      row.totalCreditsUsed += args.data.totalCreditsUsed.increment;
    if (args.data.totalCreditsUsed?.decrement)
      row.totalCreditsUsed -= args.data.totalCreditsUsed.decrement;
    return { count: 1 };
  },
);

const findUnique = vi.fn(async (args: { where: { id: string } }) => {
  const row = store.get(args.where.id);
  return row ? { creditsRemaining: row.creditsRemaining } : null;
});

const update = vi.fn(
  async (args: {
    where: { id: string };
    data: {
      creditsRemaining?: { increment?: number; decrement?: number };
      totalCreditsUsed?: { increment?: number; decrement?: number };
    };
  }) => {
    const row = store.get(args.where.id);
    if (!row) throw new Error("not found");
    if (args.data.creditsRemaining?.increment)
      row.creditsRemaining += args.data.creditsRemaining.increment;
    if (args.data.creditsRemaining?.decrement)
      row.creditsRemaining -= args.data.creditsRemaining.decrement;
    if (args.data.totalCreditsUsed?.increment)
      row.totalCreditsUsed += args.data.totalCreditsUsed.increment;
    if (args.data.totalCreditsUsed?.decrement)
      row.totalCreditsUsed -= args.data.totalCreditsUsed.decrement;
    return { creditsRemaining: row.creditsRemaining };
  },
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      updateMany: (...a: unknown[]) => updateMany(...(a as [never])),
      findUnique: (...a: unknown[]) => findUnique(...(a as [never])),
      update: (...a: unknown[]) => update(...(a as [never])),
    },
  },
}));

// Owner == self (no org-owner indirection) keeps the test focused on the deduct.
vi.mock("@/lib/organization-credits", () => ({
  getOrganizationOwner: async () => null,
  getEffectiveSubscription: async () => null,
}));

import { deductBulkCredits, refundBulkCredits } from "@/lib/bulk-operations";

const USER = "admin-1";

beforeEach(() => {
  store.clear();
  updateMany.mockClear();
  findUnique.mockClear();
  update.mockClear();
});

describe("deductBulkCredits — atomic guarded deduct", () => {
  it("charges exactly the right amount when credits are sufficient", async () => {
    store.set(USER, { creditsRemaining: 10, totalCreditsUsed: 0 });

    const res = await deductBulkCredits(USER, 3, "bulk-duplicate");

    expect(res.success).toBe(true);
    expect(res.creditsRemaining).toBe(7);
    expect(store.get(USER)).toEqual({ creditsRemaining: 7, totalCreditsUsed: 3 });
    // Must use the gte-guarded updateMany, never an unconditional decrement.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER, creditsRemaining: { gte: 3 } },
      }),
    );
  });

  it("succeeds on an exact-credits job and lands at zero (not negative)", async () => {
    store.set(USER, { creditsRemaining: 5, totalCreditsUsed: 0 });

    const res = await deductBulkCredits(USER, 5, "bulk-duplicate");

    expect(res.success).toBe(true);
    expect(res.creditsRemaining).toBe(0);
    expect(store.get(USER)!.creditsRemaining).toBe(0);
  });

  it("rejects a deduct that would overdraw — balance never goes negative", async () => {
    store.set(USER, { creditsRemaining: 2, totalCreditsUsed: 0 });

    const res = await deductBulkCredits(USER, 5, "bulk-duplicate");

    expect(res.success).toBe(false);
    // Balance untouched — no partial / negative deduction.
    expect(store.get(USER)).toEqual({ creditsRemaining: 2, totalCreditsUsed: 0 });
  });

  it("concurrent bulk jobs cannot both succeed below zero (TOCTOU)", async () => {
    // 5 credits, two jobs each wanting 3 → only one may win, balance >= 0.
    store.set(USER, { creditsRemaining: 5, totalCreditsUsed: 0 });

    const [a, b] = await Promise.all([
      deductBulkCredits(USER, 3, "bulk-duplicate"),
      deductBulkCredits(USER, 3, "bulk-duplicate"),
    ]);

    const successes = [a, b].filter((r) => r.success).length;
    expect(successes).toBe(1);
    expect(store.get(USER)!.creditsRemaining).toBe(2);
    expect(store.get(USER)!.creditsRemaining).toBeGreaterThanOrEqual(0);
  });

  it("double-deduct of the full balance cannot drive below zero", async () => {
    store.set(USER, { creditsRemaining: 4, totalCreditsUsed: 0 });

    const first = await deductBulkCredits(USER, 4, "bulk-duplicate");
    const second = await deductBulkCredits(USER, 4, "bulk-duplicate");

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(store.get(USER)!.creditsRemaining).toBe(0);
  });
});

describe("refundBulkCredits — compensation on failed create", () => {
  it("returns reserved credits and reverses totalCreditsUsed", async () => {
    store.set(USER, { creditsRemaining: 10, totalCreditsUsed: 0 });

    const res = await deductBulkCredits(USER, 4, "bulk-duplicate");
    expect(res.success).toBe(true);
    expect(store.get(USER)).toEqual({ creditsRemaining: 6, totalCreditsUsed: 4 });

    // Create transaction failed → compensate.
    await refundBulkCredits(USER, 4);

    expect(store.get(USER)).toEqual({ creditsRemaining: 10, totalCreditsUsed: 0 });
  });

  it("is a no-op for non-positive counts", async () => {
    store.set(USER, { creditsRemaining: 10, totalCreditsUsed: 0 });
    await refundBulkCredits(USER, 0);
    expect(update).not.toHaveBeenCalled();
    expect(store.get(USER)).toEqual({ creditsRemaining: 10, totalCreditsUsed: 0 });
  });
});
