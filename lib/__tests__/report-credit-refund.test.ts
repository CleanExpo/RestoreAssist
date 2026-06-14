/**
 * RA-1377 — Compensating refund when a report charge produces no report.
 *
 * `deductCreditsAndTrackUsage` charges a TRIAL credit / monthly-usage slot
 * BEFORE the slow external AI call and before the report row is persisted, and
 * is deliberately NOT wrapped in a DB transaction. If anything between the
 * deduct and a successful `report.create` throws, the user is billed but gets
 * no report — repeated transient failures silently burn paid quota.
 *
 * This suite asserts that `refundCreditsAndTrackUsage` is the exact inverse of
 * `deductCreditsAndTrackUsage`:
 *   - TRIAL: re-credits the admin's creditsRemaining and rolls back
 *     totalCreditsUsed (deduct restored to original).
 *   - ACTIVE: decrements the admin's monthlyReportsUsed back down.
 *   - Manager / creator usage-tracking increments are rolled back too.
 *   - Counters are clamped at 0 (no negative balances on a stray double-refund).
 *   - It is best-effort: a failing prisma update is logged, surfaced via the
 *     returned flag, and never thrown.
 *
 * The route-level "charged-but-not-persisted only" guard (no double-refund on
 * the happy path) is asserted as a source contract at the bottom.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { prismaMock, getOrganizationOwner } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    addonPurchase: { findMany: vi.fn() },
  },
  getOrganizationOwner: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/organization-credits", () => ({
  getEffectiveSubscription: vi.fn(),
  getOrganizationOwner,
}));
vi.mock("@/lib/trial-handling", () => ({
  checkAndUpdateTrialStatus: vi.fn(),
}));

import {
  deductCreditsAndTrackUsage,
  refundCreditsAndTrackUsage,
} from "@/lib/report-limits";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.update.mockResolvedValue({});
  prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
});

describe("refundCreditsAndTrackUsage — TRIAL admin (self-create)", () => {
  it("re-credits creditsRemaining and rolls back totalCreditsUsed", async () => {
    getOrganizationOwner.mockResolvedValue("admin-1");
    // creator row (role/managedById) then admin row (balances)
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: "ADMIN", managedById: null })
      .mockResolvedValueOnce({
        subscriptionStatus: "TRIAL",
        creditsRemaining: 4,
        totalCreditsUsed: 11,
        monthlyReportsUsed: 0,
      });

    const res = await refundCreditsAndTrackUsage("admin-1");

    expect(res.refunded).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: {
        creditsRemaining: { increment: 1 },
        // totalCreditsUsed restored from 11 -> 10 (clamped at 0)
        totalCreditsUsed: 10,
      },
    });
  });

  it("deduct-then-refund restores a TRIAL admin to the original balance", async () => {
    getOrganizationOwner.mockResolvedValue("admin-1");

    // ----- deduct leg -----
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        role: "ADMIN",
        managedById: null,
        totalCreditsUsed: 7,
      })
      .mockResolvedValueOnce({
        subscriptionStatus: "TRIAL",
        creditsRemaining: 5,
        totalCreditsUsed: 7,
        monthlyReportsUsed: 0,
        monthlyResetDate: null,
      });
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

    await deductCreditsAndTrackUsage("admin-1");

    // Atomic deduct: creditsRemaining 5 -> 4, totalCreditsUsed 7 -> 8.
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "admin-1", creditsRemaining: { gte: 1 } },
      data: {
        creditsRemaining: { decrement: 1 },
        totalCreditsUsed: { increment: 1 },
      },
    });

    // ----- refund leg (post-deduct state: credits 4, used 8) -----
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: "ADMIN", managedById: null })
      .mockResolvedValueOnce({
        subscriptionStatus: "TRIAL",
        creditsRemaining: 4,
        totalCreditsUsed: 8,
        monthlyReportsUsed: 0,
      });

    const res = await refundCreditsAndTrackUsage("admin-1");

    expect(res.refunded).toBe(true);
    // creditsRemaining incremented back to 5, totalCreditsUsed restored to 7.
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: {
        creditsRemaining: { increment: 1 },
        totalCreditsUsed: 7,
      },
    });
  });

  it("clamps totalCreditsUsed at 0 (no negative on double-refund)", async () => {
    getOrganizationOwner.mockResolvedValue("admin-1");
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: "ADMIN", managedById: null })
      .mockResolvedValueOnce({
        subscriptionStatus: "TRIAL",
        creditsRemaining: 30,
        totalCreditsUsed: 0,
        monthlyReportsUsed: 0,
      });

    await refundCreditsAndTrackUsage("admin-1");

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { creditsRemaining: { increment: 1 }, totalCreditsUsed: 0 },
    });
  });
});

describe("refundCreditsAndTrackUsage — ACTIVE admin", () => {
  it("decrements monthlyReportsUsed back down, clamped at 0", async () => {
    getOrganizationOwner.mockResolvedValue("admin-1");
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: "ADMIN", managedById: null })
      .mockResolvedValueOnce({
        subscriptionStatus: "ACTIVE",
        creditsRemaining: 0,
        totalCreditsUsed: 0,
        monthlyReportsUsed: 3,
      });

    const res = await refundCreditsAndTrackUsage("admin-1");

    expect(res.refunded).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { monthlyReportsUsed: 2 },
    });
    // Never touches creditsRemaining for an ACTIVE admin.
    for (const call of prismaMock.user.update.mock.calls) {
      const arg = call[0] as { data?: Record<string, unknown> };
      expect(arg?.data ?? {}).not.toHaveProperty("creditsRemaining");
    }
  });

  it("clamps a freshly-reset monthlyReportsUsed (1) without going negative", async () => {
    getOrganizationOwner.mockResolvedValue("admin-1");
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: "ADMIN", managedById: null })
      .mockResolvedValueOnce({
        subscriptionStatus: "ACTIVE",
        creditsRemaining: 0,
        totalCreditsUsed: 0,
        monthlyReportsUsed: 1,
      });

    await refundCreditsAndTrackUsage("admin-1");

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { monthlyReportsUsed: 0 },
    });
  });
});

describe("refundCreditsAndTrackUsage — team hierarchy (technician under manager)", () => {
  it("rolls back admin, manager, and creator usage exactly once each", async () => {
    // creator (technician) != admin, has a manager
    getOrganizationOwner.mockResolvedValue("admin-1");
    prismaMock.user.findUnique
      // creator row (refund resolution)
      .mockResolvedValueOnce({ role: "USER", managedById: "mgr-1" })
      // admin row
      .mockResolvedValueOnce({
        subscriptionStatus: "ACTIVE",
        creditsRemaining: 0,
        totalCreditsUsed: 50,
        monthlyReportsUsed: 5,
      })
      // manager row
      .mockResolvedValueOnce({ totalCreditsUsed: 9 })
      // creator row (usage)
      .mockResolvedValueOnce({ totalCreditsUsed: 4 });

    const res = await refundCreditsAndTrackUsage("tech-1");

    expect(res.refunded).toBe(true);
    // admin monthly usage rolled back
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { monthlyReportsUsed: 4 },
    });
    // manager usage rolled back 9 -> 8
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "mgr-1" },
      data: { totalCreditsUsed: 8 },
    });
    // creator usage rolled back 4 -> 3
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "tech-1" },
      data: { totalCreditsUsed: 3 },
    });
  });
});

describe("refundCreditsAndTrackUsage — best-effort failure handling", () => {
  it("returns refunded:false and does NOT throw when a prisma update fails", async () => {
    getOrganizationOwner.mockResolvedValue("admin-1");
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: "ADMIN", managedById: null })
      .mockResolvedValueOnce({
        subscriptionStatus: "TRIAL",
        creditsRemaining: 4,
        totalCreditsUsed: 11,
        monthlyReportsUsed: 0,
      });
    prismaMock.user.update.mockRejectedValueOnce(new Error("DB down"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await refundCreditsAndTrackUsage("admin-1");

    expect(res.refunded).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns refunded:false when the admin row can't be loaded (no crash)", async () => {
    getOrganizationOwner.mockResolvedValue("admin-1");
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: "ADMIN", managedById: null })
      .mockResolvedValueOnce(null); // admin not found

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await refundCreditsAndTrackUsage("admin-1");

    expect(res.refunded).toBe(false);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// ---- Source-contract assertions: route wiring (drift guards) ----------------

const repoRoot = join(__dirname, "..", "..");
const routeSrc = readFileSync(
  join(repoRoot, "app/api/reports/route.ts"),
  "utf8",
);

describe("reports POST route wires the refund onto every post-deduct failure path", () => {
  it("imports refundCreditsAndTrackUsage and captures it for the catch", () => {
    expect(routeSrc).toMatch(/refundCreditsAndTrackUsage/);
    expect(routeSrc).toMatch(/refundCharge\s*=\s*refundCreditsAndTrackUsage/);
  });

  it("only refunds when charged AND the report was NOT persisted (no double-refund)", () => {
    // The happy path sets reportPersisted = true; the catch guards on it.
    expect(routeSrc).toMatch(/charged\s*=\s*true/);
    expect(routeSrc).toMatch(/reportPersisted\s*=\s*true/);
    expect(routeSrc).toMatch(/if\s*\(\s*charged\s*&&\s*!reportPersisted/);
  });

  it("refunds inside the create-stage catch, before re-raising via fromException", () => {
    const catchIdx = routeSrc.indexOf("} catch (error) {");
    const refundIdx = routeSrc.indexOf("refundCharge(userId)", catchIdx);
    const fromExcIdx = routeSrc.indexOf('stage: "create"', catchIdx);
    expect(catchIdx).toBeGreaterThan(-1);
    expect(refundIdx).toBeGreaterThan(catchIdx);
    expect(fromExcIdx).toBeGreaterThan(refundIdx);
  });
});
