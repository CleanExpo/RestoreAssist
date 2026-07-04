/**
 * RA-1377 / RA-6981 — Compensating refund when a report charge produces no
 * report.
 *
 * `deductCreditsAndTrackUsage` charges a TRIAL credit / monthly-usage slot
 * BEFORE the slow external AI call and before the report row is persisted, and
 * is deliberately NOT wrapped in a DB transaction. If anything between the
 * deduct and a successful `report.create` throws, the user is billed but gets
 * no report — repeated transient failures silently burn paid quota.
 *
 * This suite asserts that `refundCreditsAndTrackUsage` is the exact inverse of
 * `deductCreditsAndTrackUsage`, and (RA-6981) that EVERY leg is a guarded
 * atomic decrement — `updateMany({ where: { id, <counter>: { gte: 1 } },
 * data: { <counter>: { decrement: 1 } } })` — never a read-then-write of an
 * absolute value (rule 6):
 *   - TRIAL: re-credits the admin's creditsRemaining (atomic increment) and
 *     decrements totalCreditsUsed, both under a `totalCreditsUsed >= 1` guard.
 *   - ACTIVE: decrements the admin's monthlyReportsUsed under a `>= 1` guard.
 *   - Manager / creator usage-tracking increments are rolled back the same way.
 *   - The `gte: 1` WHERE guard (not a JS clamp) is what prevents a negative
 *     counter on a stray double-refund.
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
  it("re-credits creditsRemaining and atomically decrements totalCreditsUsed", async () => {
    getOrganizationOwner.mockResolvedValue("admin-1");
    // creator row (role/managedById) then admin row (subscriptionStatus)
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: "ADMIN", managedById: null })
      .mockResolvedValueOnce({ subscriptionStatus: "TRIAL" });

    const res = await refundCreditsAndTrackUsage("admin-1");

    expect(res.refunded).toBe(true);
    // Guarded atomic decrement — never a read-then-write absolute value.
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "admin-1", totalCreditsUsed: { gte: 1 } },
      data: {
        creditsRemaining: { increment: 1 },
        totalCreditsUsed: { decrement: 1 },
      },
    });
    // The absolute-write API must never be used for the refund.
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("deduct-then-refund is a net-zero pair of atomic operations", async () => {
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

    await deductCreditsAndTrackUsage("admin-1");

    // Atomic deduct: creditsRemaining -1, totalCreditsUsed +1 (guarded gte 1).
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "admin-1", creditsRemaining: { gte: 1 } },
      data: {
        creditsRemaining: { decrement: 1 },
        totalCreditsUsed: { increment: 1 },
      },
    });

    // ----- refund leg -----
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: "ADMIN", managedById: null })
      .mockResolvedValueOnce({ subscriptionStatus: "TRIAL" });

    const res = await refundCreditsAndTrackUsage("admin-1");

    expect(res.refunded).toBe(true);
    // Exact inverse: creditsRemaining +1, totalCreditsUsed -1 (guarded gte 1).
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "admin-1", totalCreditsUsed: { gte: 1 } },
      data: {
        creditsRemaining: { increment: 1 },
        totalCreditsUsed: { decrement: 1 },
      },
    });
  });

  it("the gte:1 guard (not a JS clamp) prevents a negative totalCreditsUsed", async () => {
    getOrganizationOwner.mockResolvedValue("admin-1");
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: "ADMIN", managedById: null })
      .mockResolvedValueOnce({ subscriptionStatus: "TRIAL" });

    await refundCreditsAndTrackUsage("admin-1");

    // No prior read of totalCreditsUsed; the DB-side guard blocks the write when
    // the counter is already at the 0 floor (a stray double-refund is a no-op).
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "admin-1", totalCreditsUsed: { gte: 1 } },
      data: {
        creditsRemaining: { increment: 1 },
        totalCreditsUsed: { decrement: 1 },
      },
    });
  });
});

describe("refundCreditsAndTrackUsage — ACTIVE admin", () => {
  it("atomically decrements monthlyReportsUsed under a gte:1 guard", async () => {
    getOrganizationOwner.mockResolvedValue("admin-1");
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: "ADMIN", managedById: null })
      .mockResolvedValueOnce({ subscriptionStatus: "ACTIVE" });

    const res = await refundCreditsAndTrackUsage("admin-1");

    expect(res.refunded).toBe(true);
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "admin-1", monthlyReportsUsed: { gte: 1 } },
      data: { monthlyReportsUsed: { decrement: 1 } },
    });
    // Never touches creditsRemaining for an ACTIVE admin.
    for (const call of prismaMock.user.updateMany.mock.calls) {
      const arg = call[0] as { data?: Record<string, unknown> };
      expect(arg?.data ?? {}).not.toHaveProperty("creditsRemaining");
    }
  });
});

describe("refundCreditsAndTrackUsage — team hierarchy (technician under manager)", () => {
  it("rolls back admin, manager, and creator usage with a guarded decrement each", async () => {
    // creator (technician) != admin, has a manager
    getOrganizationOwner.mockResolvedValue("admin-1");
    prismaMock.user.findUnique
      // creator row (refund resolution: role/managedById)
      .mockResolvedValueOnce({ role: "USER", managedById: "mgr-1" })
      // admin row (subscriptionStatus)
      .mockResolvedValueOnce({ subscriptionStatus: "ACTIVE" });

    const res = await refundCreditsAndTrackUsage("tech-1");

    expect(res.refunded).toBe(true);
    // admin monthly usage rolled back (guarded)
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "admin-1", monthlyReportsUsed: { gte: 1 } },
      data: { monthlyReportsUsed: { decrement: 1 } },
    });
    // manager usage rolled back (guarded)
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "mgr-1", totalCreditsUsed: { gte: 1 } },
      data: { totalCreditsUsed: { decrement: 1 } },
    });
    // creator usage rolled back (guarded)
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "tech-1", totalCreditsUsed: { gte: 1 } },
      data: { totalCreditsUsed: { decrement: 1 } },
    });
    // Three legs, three atomic writes — no absolute-value updates.
    expect(prismaMock.user.updateMany).toHaveBeenCalledTimes(3);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe("refundCreditsAndTrackUsage — best-effort failure handling", () => {
  it("returns refunded:false and does NOT throw when a prisma write fails", async () => {
    getOrganizationOwner.mockResolvedValue("admin-1");
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: "ADMIN", managedById: null })
      .mockResolvedValueOnce({ subscriptionStatus: "TRIAL" });
    prismaMock.user.updateMany.mockRejectedValueOnce(new Error("DB down"));

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
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
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
