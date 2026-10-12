import { beforeEach, describe, expect, it, vi } from "vitest";

const globalDb = vi.hoisted(() => ({ find: vi.fn(), updateMany: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: globalDb.find, updateMany: globalDb.updateMany, update: globalDb.update },
} }));
vi.mock("@/lib/organization-credits", () => ({
  getOrganizationOwner: async () => null,
  getEffectiveSubscription: vi.fn(),
}));
vi.mock("@/lib/trial-handling", () => ({ checkAndUpdateTrialStatus: vi.fn() }));

import { deductCreditsAndTrackUsage } from "@/lib/report-limits";

beforeEach(() => vi.clearAllMocks());

function transaction(count: number) {
  const findUnique = vi.fn(async () => ({
    role: "ADMIN", managedById: null, subscriptionStatus: "TRIAL",
    subscriptionPlan: null, addonReports: 0, creditsRemaining: 1,
    totalCreditsUsed: 0, monthlyReportsUsed: 0, monthlyResetDate: null,
  }));
  const updateMany = vi.fn(async () => ({ count }));
  return { user: { findUnique, updateMany, update: vi.fn() }, addonPurchase: { findMany: vi.fn() } };
}

describe("report credit charge inside a caller transaction", () => {
  it("uses the transaction client for the atomic trial charge", async () => {
    const tx = transaction(1);
    await deductCreditsAndTrackUsage("synthetic-owner", tx as never);
    expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "synthetic-owner", creditsRemaining: { gte: 1 } },
      data: { creditsRemaining: { decrement: 1 }, totalCreditsUsed: { increment: 1 } },
    }));
    expect(globalDb.find).not.toHaveBeenCalled();
    expect(globalDb.updateMany).not.toHaveBeenCalled();
  });

  it("keeps the atomic insufficient-credit guard in a transaction", async () => {
    const tx = transaction(0);
    await expect(deductCreditsAndTrackUsage("synthetic-owner", tx as never))
      .rejects.toThrow("INSUFFICIENT_CREDITS");
    expect(globalDb.updateMany).not.toHaveBeenCalled();
  });
});
