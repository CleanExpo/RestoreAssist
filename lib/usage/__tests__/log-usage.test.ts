import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "../log-usage";

/**
 * Pricing characterisation for MODEL_PRICING (private — asserted via the public
 * estimateCostUsd). RA-1087 precursor: the Live Teacher runs claude-opus-4-7
 * (lib/live-teacher/claude-cloud.ts), tallied at $5/$25 per MTok. Without an
 * explicit table entry a logAiUsage call would fall through to the ANTHROPIC
 * default ($3/$15 haiku baseline) and misprice the run.
 */
describe("estimateCostUsd — Anthropic model pricing", () => {
  it("prices claude-opus-4-7 at $5/$25 per million tokens", () => {
    // 1M input + 1M output → 5.0 + 25.0 = 30.0
    expect(
      estimateCostUsd("ANTHROPIC", "claude-opus-4-7", 1_000_000, 1_000_000),
    ).toBe(30.0);
  });

  it("does NOT fall through to the haiku default ($3/$15) for opus-4-7", () => {
    const defaulted = estimateCostUsd(
      "ANTHROPIC",
      "some-unknown-model",
      1_000_000,
      1_000_000,
    );
    const opus47 = estimateCostUsd(
      "ANTHROPIC",
      "claude-opus-4-7",
      1_000_000,
      1_000_000,
    );
    expect(defaulted).toBe(18.0); // 3.0 + 15.0 default baseline
    expect(opus47).not.toBe(defaulted);
  });

  it("prices opus-4-7 identically to opus-4-8 (both $5/$25)", () => {
    const opus47 = estimateCostUsd(
      "ANTHROPIC",
      "claude-opus-4-7",
      500_000,
      200_000,
    );
    const opus48 = estimateCostUsd(
      "ANTHROPIC",
      "claude-opus-4-8",
      500_000,
      200_000,
    );
    expect(opus47).toBe(opus48);
  });
});
