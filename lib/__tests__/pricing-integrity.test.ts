/**
 * RA-1585 — pricing drift guard.
 *
 * The public pricing page renders from `PRICING_CONFIG`, so drift can
 * only creep in via config edits that violate one of the contracts
 * the landing copy promises (AUD currency, GST-inclusive amounts, at
 * least one paid tier, non-zero amounts). This test is the single
 * source of truth for those invariants.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRICING_CONFIG } from "@/lib/pricing";

const repoRoot = join(__dirname, "..", "..");
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

describe("RA-1585 pricing-config integrity", () => {
  it("free tier is a 15-day trial whose copy matches the credit grant", () => {
    const { free } = PRICING_CONFIG;
    // Decided model: a 15-day free trial that grants 50 report credits.
    // These three values are the SSOT the register route + marketing copy read.
    expect(free.trialDays).toBe(15);
    expect(free.trialReportCredits).toBe(50);
    // `reportLimit` is the deprecated alias the display cards still read; it
    // must equal the real credit grant so the card never shows a stale number.
    expect(free.reportLimit).toBe(free.trialReportCredits);
    // No "Free Forever" / unlimited claim — this is time-limited.
    expect(free.name).not.toMatch(/forever/i);
    expect(free.description).not.toMatch(/forever|unlimited/i);
    for (const bullet of free.features) {
      expect(bullet).not.toMatch(/forever|unlimited/i);
    }
    // The feature list must state the real trial length and credit count.
    expect(
      free.features.some((f) =>
        f.toLowerCase().includes(`${free.trialDays}-day free trial`),
      ),
      "free tier should advertise the trial length",
    ).toBe(true);
    expect(
      free.features.some((f) =>
        f
          .toLowerCase()
          .includes(`${free.trialReportCredits} inspection report`),
      ),
      "free tier should advertise the real report-credit count",
    ).toBe(true);
  });

  it("declares at least one paid tier", () => {
    expect(Object.keys(PRICING_CONFIG.pricing).length).toBeGreaterThan(0);
  });

  // RA-6929/6930/6931 — single-catalog collapse (C1/C3). The catalog is the
  // ONE $99 Monthly Plan; the Yearly $1188 SKU is retired from both the
  // display catalog and the Stripe price map so no page can offer it.
  it("catalog is a single $99 Monthly Plan (yearly retired)", () => {
    expect(Object.keys(PRICING_CONFIG.pricing)).toEqual(["monthly"]);
    expect(PRICING_CONFIG.pricing).not.toHaveProperty("yearly");
    expect(PRICING_CONFIG.pricing.monthly.amount).toBe(99.0);
  });

  it("the Stripe price map exposes only the monthly price (no yearly)", () => {
    expect(Object.keys(PRICING_CONFIG.prices)).toEqual(["monthly"]);
    expect(PRICING_CONFIG.prices).not.toHaveProperty("yearly");
  });

  it("every paid tier is priced in AUD", () => {
    for (const [key, plan] of Object.entries(PRICING_CONFIG.pricing)) {
      expect(plan.currency, `tier ${key} currency`).toBe("AUD");
    }
  });

  it("no paid tier may have a zero or negative amount (the landing page promises a paid service)", () => {
    for (const [key, plan] of Object.entries(PRICING_CONFIG.pricing)) {
      expect(plan.amount, `tier ${key} amount`).toBeGreaterThan(0);
    }
  });

  it("every tier declares a positive reportLimit", () => {
    for (const [key, plan] of Object.entries(PRICING_CONFIG.pricing)) {
      expect(
        (plan as { reportLimit: number }).reportLimit,
        `tier ${key} reportLimit`,
      ).toBeGreaterThan(0);
    }
  });

  it("every addon is priced in AUD and has a positive amount + report credit", () => {
    for (const [key, addon] of Object.entries(PRICING_CONFIG.addons)) {
      const a = addon as {
        currency: string;
        amount: number;
        reportLimit: number;
      };
      expect(a.currency, `addon ${key} currency`).toBe("AUD");
      expect(a.amount, `addon ${key} amount`).toBeGreaterThan(0);
      expect(a.reportLimit, `addon ${key} reportLimit`).toBeGreaterThan(0);
    }
  });

  it("every tier exposes a features array with at least three bullets (sellability minimum)", () => {
    for (const [key, plan] of Object.entries(PRICING_CONFIG.pricing)) {
      const features = (plan as { features: unknown[] }).features;
      expect(Array.isArray(features), `tier ${key} features array`).toBe(true);
      expect(
        features.length,
        `tier ${key} feature count`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("free-trial honesty — grant matches advertised copy", () => {
  it("register route grants a ~15-day trialEndsAt sourced from PRICING_CONFIG", () => {
    const src = readSrc("app/api/auth/register/route.ts");

    // The route must derive its trial window from the SSOT, never hardcode it.
    expect(src).toContain("const TRIAL_DAYS = PRICING_CONFIG.free.trialDays;");
    expect(src).toContain(
      "const TRIAL_REPORT_CREDITS = PRICING_CONFIG.free.trialReportCredits;",
    );
    // trialEndsAt is computed from the SSOT-derived duration, not a literal 30 days.
    expect(src).toContain("new Date(Date.now() + TRIAL_DURATION_MS)");
    expect(src).not.toMatch(/Date\.now\(\)\s*\+\s*30\s*\*\s*24/);
    expect(src).not.toMatch(/creditsRemaining:\s*30\b/);

    // Mirror the route's grant formula and assert it lands ~15 days out.
    const trialDurationMs = PRICING_CONFIG.free.trialDays * 24 * 60 * 60 * 1000;
    const trialEndsAt = new Date(Date.now() + trialDurationMs);
    const daysOut =
      (trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysOut).toBeGreaterThan(14.9);
    expect(daysOut).toBeLessThan(15.1);
  });

  it("signup page copy is sourced from PRICING_CONFIG (no hardcoded credit/day numbers)", () => {
    const src = readSrc("app/signup/page.tsx");
    expect(src).toContain("PRICING_CONFIG.free.trialDays");
    expect(src).toContain("PRICING_CONFIG.free.trialReportCredits");
    // The old hardcoded "30 free report credits" line must be gone.
    expect(src).not.toMatch(/30 free report credits/i);
    expect(src).not.toMatch(/Free Tier Available/i);
  });

  it("public pricing page reads the trial from PRICING_CONFIG and drops 'Free Forever'", () => {
    const src = readSrc("app/pricing/page.tsx");
    expect(src).toContain("freeCfg.trialDays");
    expect(src).toContain("freeCfg.trialReportCredits");
    expect(src).not.toMatch(/Free Forever/i);
  });
});
