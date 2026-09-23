/**
 * RA-7714 — one report allowance, read by every surface that states or
 * enforces it.
 *
 * PRICING_CONFIG.pricing.monthly.reportLimit is the single source. This test
 * moves that one number (to 51) and proves the enforcement path follows it:
 * the Monthly Plan base limit and the fallback for an unknown plan. Before
 * RA-7714 lib/report-limits.ts carried its own literal 50, so the two could
 * drift apart with every other test still green. Grandfathered legacy plans
 * (Yearly 70, Lifetime 999) stay fixed on purpose — see report-limits.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("@/lib/pricing");
  vi.resetModules();
});

async function loadWithAllowance(allowance: number) {
  vi.resetModules();
  vi.doMock("@/lib/pricing", async () => {
    const actual =
      await vi.importActual<typeof import("@/lib/pricing")>("@/lib/pricing");
    return {
      ...actual,
      PRICING_CONFIG: {
        ...actual.PRICING_CONFIG,
        pricing: {
          ...actual.PRICING_CONFIG.pricing,
          monthly: {
            ...actual.PRICING_CONFIG.pricing.monthly,
            reportLimit: allowance,
          },
        },
      },
    };
  });
  return import("@/lib/report-limits");
}

describe("report-credit enforcement reads the plan allowance", () => {
  it("the Monthly Plan base limit follows PRICING_CONFIG", async () => {
    const mod = await loadWithAllowance(51);
    expect(mod.resolveBaseReportLimit("Monthly Plan")).toBe(51);
  });

  it("an unknown or missing plan falls back to the same allowance", async () => {
    const mod = await loadWithAllowance(51);
    expect(mod.DEFAULT_REPORT_LIMIT).toBe(51);
    expect(mod.resolveBaseReportLimit(null)).toBe(51);
  });

  it("grandfathered legacy plans do not move with it", async () => {
    const mod = await loadWithAllowance(51);
    expect(mod.resolveBaseReportLimit("Yearly Plan")).toBe(70);
    expect(mod.resolveBaseReportLimit("Lifetime")).toBe(999);
  });
});

describe("the trial and the plan state one allowance", () => {
  it("trial credits, the display limit and the plan allowance are the same number", async () => {
    const { PRICING_CONFIG } = await import("@/lib/pricing");
    const allowance = PRICING_CONFIG.pricing.monthly.reportLimit;
    expect(allowance).toBe(50);
    expect(PRICING_CONFIG.free.trialReportCredits).toBe(allowance);
    expect(PRICING_CONFIG.free.reportLimit).toBe(allowance);
    expect(PRICING_CONFIG.free.description).toContain(
      `${allowance} inspection report credits`,
    );
    expect(PRICING_CONFIG.pricing.monthly.features[0]).toBe(
      `${allowance} inspection reports per month`,
    );
    expect(PRICING_CONFIG.pricing.monthly.amount).toBe(99);
  });
});
