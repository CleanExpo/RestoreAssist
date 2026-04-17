/**
 * Tests for evaluateVariation — RA-1131 auto-approval rules engine.
 */

import { describe, it, expect } from "vitest";
import { evaluateVariation } from "../variation-auto-approve";

// Helpers
const au = { country: "AU" as const };
const nz = { country: "NZ" as const };

describe("evaluateVariation — AU thresholds", () => {
  it("auto-approves when cost <= $2,500 AUD and percent <= 10%", () => {
    const result = evaluateVariation(
      { costDeltaCents: 250_000, costDeltaPercent: 10 },
      au,
      null,
    );
    expect(result.decision).toBe("auto-approved");
    expect(result.thresholdsApplied.country).toBe("AU");
    expect(result.thresholdsApplied.gstRate).toBe(0.1);
  });

  it("needs-adjuster when cost is $5,000 AUD (above auto-approve, below adjuster limit)", () => {
    const result = evaluateVariation(
      { costDeltaCents: 500_000, costDeltaPercent: 15 },
      au,
      null,
    );
    expect(result.decision).toBe("needs-adjuster");
  });

  it("needs-insurer when cost exceeds $10,000 AUD", () => {
    const result = evaluateVariation(
      { costDeltaCents: 1_000_001, costDeltaPercent: 5 },
      au,
      null,
    );
    expect(result.decision).toBe("needs-insurer");
  });

  it("needs-insurer when percent exceeds 25% even if cost is low", () => {
    const result = evaluateVariation(
      { costDeltaCents: 50_000, costDeltaPercent: 26 },
      au,
      null,
    );
    expect(result.decision).toBe("needs-insurer");
  });

  it("needs-adjuster when percent is exactly at 25% boundary", () => {
    const result = evaluateVariation(
      { costDeltaCents: 500_000, costDeltaPercent: 25 },
      au,
      null,
    );
    expect(result.decision).toBe("needs-adjuster");
  });

  it("auto-approves when percent is null (unknown) and cost is within AU auto-approve limit", () => {
    const result = evaluateVariation(
      { costDeltaCents: 100_000, costDeltaPercent: null },
      au,
      null,
    );
    expect(result.decision).toBe("auto-approved");
  });
});

describe("evaluateVariation — NZ thresholds", () => {
  it("auto-approves when cost <= $2,800 NZD and percent <= 10%", () => {
    const result = evaluateVariation(
      { costDeltaCents: 280_000, costDeltaPercent: 8 },
      nz,
      null,
    );
    expect(result.decision).toBe("auto-approved");
    expect(result.thresholdsApplied.country).toBe("NZ");
    expect(result.thresholdsApplied.gstRate).toBe(0.15);
  });

  it("needs-adjuster for $5,000 NZD (above NZ auto-approve, below NZ adjuster limit)", () => {
    const result = evaluateVariation(
      { costDeltaCents: 500_000, costDeltaPercent: 12 },
      nz,
      null,
    );
    expect(result.decision).toBe("needs-adjuster");
  });

  it("needs-insurer when cost exceeds $11,000 NZD", () => {
    const result = evaluateVariation(
      { costDeltaCents: 1_100_001, costDeltaPercent: 5 },
      nz,
      null,
    );
    expect(result.decision).toBe("needs-insurer");
  });
});

describe("evaluateVariation — hard overrides", () => {
  it("needs-insurer for Cat 3 water regardless of cost", () => {
    const result = evaluateVariation(
      { costDeltaCents: 1_000, costDeltaPercent: 1, waterCategory: "CAT 3" },
      au,
      null,
    );
    expect(result.decision).toBe("needs-insurer");
    expect(result.reason).toContain("Category 3");
  });

  it('needs-insurer for waterCategory="3"', () => {
    const result = evaluateVariation(
      { costDeltaCents: 500, costDeltaPercent: 0.5, waterCategory: "3" },
      au,
      null,
    );
    expect(result.decision).toBe("needs-insurer");
  });

  it("needs-insurer for structural variation regardless of cost", () => {
    const result = evaluateVariation(
      { costDeltaCents: 5_000, costDeltaPercent: 2, isStructural: true },
      au,
      null,
    );
    expect(result.decision).toBe("needs-insurer");
    expect(result.reason).toContain("Structural");
  });

  it("structural override takes precedence over Cat 3 check", () => {
    const result = evaluateVariation(
      {
        costDeltaCents: 1_000,
        costDeltaPercent: 1,
        waterCategory: "CAT3",
        isStructural: true,
      },
      nz,
      null,
    );
    expect(result.decision).toBe("needs-insurer");
    expect(result.reason).toContain("Structural");
  });
});

describe("evaluateVariation — country fallback", () => {
  it("defaults to AU thresholds when country is undefined", () => {
    const result = evaluateVariation(
      { costDeltaCents: 250_000, costDeltaPercent: 10 },
      {},
      null,
    );
    expect(result.decision).toBe("auto-approved");
    expect(result.thresholdsApplied.country).toBe("AU");
  });

  it("defaults to AU when country is null", () => {
    const result = evaluateVariation(
      { costDeltaCents: 250_000, costDeltaPercent: 10 },
      { country: null },
      null,
    );
    expect(result.thresholdsApplied.country).toBe("AU");
  });
});

describe("evaluateVariation — negative deltas (scope reductions)", () => {
  it("treats absolute value for negative cost delta", () => {
    // -$500 reduction — should still auto-approve
    const result = evaluateVariation(
      { costDeltaCents: -50_000, costDeltaPercent: -5 },
      au,
      null,
    );
    expect(result.decision).toBe("auto-approved");
  });
});
