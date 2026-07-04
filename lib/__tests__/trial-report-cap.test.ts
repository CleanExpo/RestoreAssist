/**
 * Trial report-cap enforcement (PR #1254 — honest 15-day trial).
 *
 * FOUNDER DECISION: the 15-day free trial is CAPPED at
 * PRICING_CONFIG.free.trialReportCredits (50) reports, so the "50 report
 * credits" marketing copy is true rather than an unlimited free-for-all.
 *
 * This suite asserts the enforcement at three layers:
 *   1. canCreateReport()  — a TRIAL user with 0 credits is BLOCKED even
 *      while still inside the trial window; with credits remaining they
 *      are allowed; ACTIVE/paid users are unaffected by the trial cap.
 *   2. deductCreditsAndTrackUsage() — a report consumed by a TRIAL user
 *      atomically deducts one credit (updateMany WHERE creditsRemaining>=1),
 *      and ACTIVE users are NOT credit-deducted.
 *   3. Source contracts — the credits/use route deducts (no
 *      `creditsRemaining: null` unlimited bypass) for in-period trials, and
 *      every signup path grants a ~15-day trial sourced from PRICING_CONFIG.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PRICING_CONFIG } from "@/lib/pricing";

// ---- Mocks for the unit-level canCreateReport / deduct tests ----------------
// vi.mock factories are hoisted above all top-level declarations, so the mock
// fns must be created inside vi.hoisted() to be referenceable from the factory.

const {
  prismaMock,
  getEffectiveSubscription,
  getOrganizationOwner,
  checkAndUpdateTrialStatus,
} = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    addonPurchase: { findMany: vi.fn() },
  },
  getEffectiveSubscription: vi.fn(),
  getOrganizationOwner: vi.fn(),
  checkAndUpdateTrialStatus: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/organization-credits", () => ({
  getEffectiveSubscription,
  getOrganizationOwner,
}));
vi.mock("@/lib/trial-handling", () => ({
  checkAndUpdateTrialStatus,
}));

import {
  canCreateReport,
  deductCreditsAndTrackUsage,
} from "@/lib/report-limits";

const FUTURE = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  // default: trial not expired
  checkAndUpdateTrialStatus.mockResolvedValue(false);
  getOrganizationOwner.mockResolvedValue("admin-1");
});

describe("canCreateReport — trial 50-report cap", () => {
  it("BLOCKS an in-period TRIAL user whose credits are exhausted (0)", async () => {
    getEffectiveSubscription.mockResolvedValue({
      id: "admin-1",
      subscriptionStatus: "TRIAL",
      creditsRemaining: 0,
      trialEndsAt: FUTURE,
    });

    const res = await canCreateReport("user-1");
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/trial report limit reached/i);
  });

  it("ALLOWS an in-period TRIAL user with credits remaining", async () => {
    getEffectiveSubscription.mockResolvedValue({
      id: "admin-1",
      subscriptionStatus: "TRIAL",
      creditsRemaining: 5,
      trialEndsAt: FUTURE,
    });

    const res = await canCreateReport("user-1");
    expect(res.allowed).toBe(true);
  });

  it("BLOCKS a TRIAL user once the trial window has expired (independent of credits)", async () => {
    getEffectiveSubscription.mockResolvedValue({
      id: "admin-1",
      subscriptionStatus: "TRIAL",
      creditsRemaining: 30,
      trialEndsAt: new Date(Date.now() - 1000),
    });

    const res = await canCreateReport("user-1");
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/15-day free trial has expired/i);
  });

  it("does NOT apply the trial cap to ACTIVE subscribers (uses monthly limits)", async () => {
    getEffectiveSubscription.mockResolvedValue({
      id: "admin-1",
      subscriptionStatus: "ACTIVE",
      creditsRemaining: 0, // irrelevant for ACTIVE
      trialEndsAt: null,
    });
    getOrganizationOwner.mockResolvedValue("admin-1");
    // ACTIVE path → getUserReportLimits → prisma.user.findUnique
    prismaMock.user.findUnique.mockResolvedValue({
      subscriptionStatus: "ACTIVE",
      subscriptionPlan: "Monthly Plan",
      addonReports: 0,
      monthlyReportsUsed: 0,
      monthlyResetDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });
    prismaMock.addonPurchase.findMany.mockResolvedValue([]);

    const res = await canCreateReport("user-1");
    expect(res.allowed).toBe(true);
    // The trial "limit reached" copy must never be shown to an ACTIVE user.
    expect(res.reason ?? "").not.toMatch(/trial report limit/i);
  });
});

describe("deductCreditsAndTrackUsage — credit spend per report", () => {
  it("DEDUCTS one credit atomically for a TRIAL user (updateMany gte:1)", async () => {
    getOrganizationOwner.mockResolvedValue("admin-1");
    // creator row
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        role: "ADMIN",
        managedById: null,
        totalCreditsUsed: 0,
      })
      // admin row
      .mockResolvedValueOnce({
        subscriptionStatus: "TRIAL",
        creditsRemaining: 5,
        totalCreditsUsed: 0,
        monthlyReportsUsed: 0,
        monthlyResetDate: null,
      });
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

    await deductCreditsAndTrackUsage("admin-1");

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "admin-1", creditsRemaining: { gte: 1 } },
      data: {
        creditsRemaining: { decrement: 1 },
        totalCreditsUsed: { increment: 1 },
      },
    });
  });

  it("THROWS INSUFFICIENT_CREDITS for a TRIAL user with no credits (updateMany count 0)", async () => {
    getOrganizationOwner.mockResolvedValue("admin-1");
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        role: "ADMIN",
        managedById: null,
        totalCreditsUsed: 0,
      })
      .mockResolvedValueOnce({
        subscriptionStatus: "TRIAL",
        creditsRemaining: 0,
        totalCreditsUsed: 0,
        monthlyReportsUsed: 0,
        monthlyResetDate: null,
      });
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(deductCreditsAndTrackUsage("admin-1")).rejects.toThrow(
      /INSUFFICIENT_CREDITS/,
    );
  });

  it("does NOT credit-deduct an ACTIVE user (no creditsRemaining decrement)", async () => {
    getOrganizationOwner.mockResolvedValue("admin-1");
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        role: "ADMIN",
        managedById: null,
        totalCreditsUsed: 0,
      })
      .mockResolvedValueOnce({
        subscriptionStatus: "ACTIVE",
        creditsRemaining: 0,
        totalCreditsUsed: 0,
        monthlyReportsUsed: 0,
        monthlyResetDate: null,
      });
    // ACTIVE path: monthlyResetDate is null, so the race-safe rollover
    // updateMany matches (OR monthlyResetDate: null) and initialises the
    // period — count 1, no guarded increment, no INSUFFICIENT_CREDITS.
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.addonPurchase.findMany.mockResolvedValue([]);

    await deductCreditsAndTrackUsage("admin-1");

    // No updateMany should ever target creditsRemaining for an ACTIVE user.
    for (const call of prismaMock.user.updateMany.mock.calls) {
      const arg = call[0] as { data?: Record<string, unknown> };
      expect(arg?.data ?? {}).not.toHaveProperty("creditsRemaining");
    }
  });
});

// ---- Source-contract assertions (drift guards) ------------------------------

const repoRoot = join(__dirname, "..", "..");
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

describe("credits/use route enforces the trial cap (no unlimited bypass)", () => {
  const src = readSrc("app/api/credits/use/route.ts");

  it("no longer returns creditsRemaining:null with zero deduction for in-period trials", () => {
    // The old bypass shape returned an unlimited null balance. It must be gone.
    expect(src).not.toMatch(/isTrialWithinPeriod/);
    expect(src).not.toMatch(
      /creditsRemaining:\s*null,\s*\n\s*totalCreditsUsed/,
    );
  });

  it("deducts trial credits via an atomic updateMany guarded on creditsRemaining", () => {
    expect(src).toMatch(/updateMany/);
    expect(src).toMatch(/creditsRemaining:\s*{\s*gte:/);
    expect(src).toMatch(/result\.count === 0/);
  });
});

describe("every signup path grants a ~15-day / 50-credit trial from PRICING_CONFIG", () => {
  const paths = [
    "app/api/auth/register/route.ts",
    "app/api/auth/google-signin/route.ts",
    "app/api/auth/native-token-exchange/route.ts",
    "app/api/user/profile/route.ts",
  ];

  it("PRICING_CONFIG is the 15-day / 50-credit SSOT", () => {
    expect(PRICING_CONFIG.free.trialDays).toBe(15);
    expect(PRICING_CONFIG.free.trialReportCredits).toBe(50);
  });

  for (const rel of paths) {
    it(`${rel} sources its trial grant from PRICING_CONFIG (no hardcoded 30-day window)`, () => {
      const src = readSrc(rel);
      expect(src).toContain("PRICING_CONFIG");
      expect(src).toMatch(/TRIAL_(REPORT_CREDITS|DURATION_MS)/);
      // No path may hardcode a 30-day trial window any more.
      expect(src).not.toMatch(/Date\.now\(\)\s*\+\s*30\s*\*\s*24\s*\*\s*60/);
    });
  }

  it("the derived trial duration lands ~15 days out", () => {
    const ms = PRICING_CONFIG.free.trialDays * 24 * 60 * 60 * 1000;
    const daysOut = ms / (24 * 60 * 60 * 1000);
    expect(daysOut).toBeGreaterThan(14.9);
    expect(daysOut).toBeLessThan(15.1);
  });
});
