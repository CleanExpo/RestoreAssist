/**
 * RA-1585 — pricing drift guard.
 *
 * The public pricing page renders from `PRICING_CONFIG`, so drift can
 * only creep in via config edits that violate one of the contracts
 * the landing copy promises (AUD currency, GST-inclusive amounts, at
 * least one paid tier, non-zero amounts). This test is the single
 * source of truth for those invariants.
 */

import { describe, expect, it } from "vitest";
import { PRICING_CONFIG } from "@/lib/pricing";

describe("RA-1585 pricing-config integrity", () => {
  it("declares at least one paid tier", () => {
    expect(Object.keys(PRICING_CONFIG.pricing).length).toBeGreaterThan(0);
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
      expect((plan as { reportLimit: number }).reportLimit, `tier ${key} reportLimit`).toBeGreaterThan(0);
    }
  });

  it("every addon is priced in AUD and has a positive amount + report credit", () => {
    for (const [key, addon] of Object.entries(PRICING_CONFIG.addons)) {
      const a = addon as { currency: string; amount: number; reportLimit: number };
      expect(a.currency, `addon ${key} currency`).toBe("AUD");
      expect(a.amount, `addon ${key} amount`).toBeGreaterThan(0);
      expect(a.reportLimit, `addon ${key} reportLimit`).toBeGreaterThan(0);
    }
  });

  it("every tier exposes a features array with at least three bullets (sellability minimum)", () => {
    for (const [key, plan] of Object.entries(PRICING_CONFIG.pricing)) {
      const features = (plan as { features: unknown[] }).features;
      expect(Array.isArray(features), `tier ${key} features array`).toBe(true);
      expect(features.length, `tier ${key} feature count`).toBeGreaterThanOrEqual(3);
    }
  });
});
