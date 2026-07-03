/**
 * F3 (RA-6929/6930/6931) — grandfathered report-limit resolution.
 *
 * The billing-catalog collapse retired the Yearly SKU from PRICING_CONFIG.
 * Existing ACTIVE subscribers are grandfathered (C4) and still carry their
 * legacy `subscriptionPlan` strings. The base-limit resolver MUST keep
 * mapping those strings to their historical limits and NEVER silently drop a
 * grandfathered user below the base 50.
 */

import { describe, it, expect } from "vitest";
import {
  resolveBaseReportLimit,
  PLAN_REPORT_LIMITS,
  DEFAULT_REPORT_LIMIT,
} from "@/lib/report-limits";

describe("resolveBaseReportLimit — grandfathered plans (F3)", () => {
  it("keeps 'Yearly Plan' at 70", () => {
    expect(resolveBaseReportLimit("Yearly Plan")).toBe(70);
  });

  it("keeps 'Lifetime' at 999", () => {
    expect(resolveBaseReportLimit("Lifetime")).toBe(999);
  });

  it("resolves 'Monthly Plan' to 50", () => {
    expect(resolveBaseReportLimit("Monthly Plan")).toBe(50);
  });

  it("falls back to the base 50 for unknown or null plans — never a silent lower value", () => {
    expect(resolveBaseReportLimit(null)).toBe(DEFAULT_REPORT_LIMIT);
    expect(resolveBaseReportLimit(undefined)).toBe(DEFAULT_REPORT_LIMIT);
    expect(resolveBaseReportLimit("Some Retired Tier")).toBe(
      DEFAULT_REPORT_LIMIT,
    );
    expect(DEFAULT_REPORT_LIMIT).toBe(50);
  });

  it("the stable map is decoupled from the catalog and preserves legacy limits", () => {
    expect(PLAN_REPORT_LIMITS).toMatchObject({
      Lifetime: 999,
      "Yearly Plan": 70,
      "Monthly Plan": 50,
    });
  });
});
