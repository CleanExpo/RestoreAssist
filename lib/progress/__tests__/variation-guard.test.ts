/**
 * variation-guard.test.ts — M-6 (RA-1382)
 *
 * Locks the variation-review trigger semantics against the board rule:
 *   - Default threshold: 20%
 *   - Absolute floor: AUD 2,500 (250,000 cents)
 *   - Both conditions must fire together for `triggers: true`
 *   - Per-claim threshold override honoured
 *   - Edge cases: zero-original, credit (negative) variations, invalid inputs
 */
import { describe, it, expect } from "vitest";
import {
  requiresVariationReview,
  VARIATION_ABSOLUTE_FLOOR_CENTS,
  DEFAULT_VARIATION_THRESHOLD_PERCENT,
} from "../variation-guard";

describe("requiresVariationReview — board rule M-6", () => {
  // ── Constants sanity ─────────────────────────────────────────────────────
  it("ships the documented constants", () => {
    expect(VARIATION_ABSOLUTE_FLOOR_CENTS).toBe(250_000);
    expect(DEFAULT_VARIATION_THRESHOLD_PERCENT).toBe(20);
  });

  // ── Standard cases ──────────────────────────────────────────────────────
  it("does NOT trigger when both percent AND floor are below threshold", () => {
    // $10,000 scope, $11,000 proposed → 10%, $1,000 delta → both below
    const r = requiresVariationReview({
      originalAmountCents: 1_000_000,
      proposedAmountCents: 1_100_000,
    });
    expect(r.triggers).toBe(false);
    expect(r.percentDelta).toBe(10);
    expect(r.absoluteDeltaCents).toBe(100_000);
    expect(r.reason).toMatch(/below the AUD 2,500 floor/i);
  });

  it("does NOT trigger when percent high but absolute below floor", () => {
    // $500 scope, $1,500 proposed → 200% BUT only $1,000 delta → floor blocks
    const r = requiresVariationReview({
      originalAmountCents: 50_000,
      proposedAmountCents: 150_000,
    });
    expect(r.triggers).toBe(false);
    expect(r.percentDelta).toBe(200);
    expect(r.absoluteDeltaCents).toBe(100_000);
    expect(r.reason).toMatch(/below the AUD 2,500 floor/i);
  });

  it("does NOT trigger when absolute above floor but percent below threshold", () => {
    // $100,000 scope, $103,000 proposed → 3%, $3,000 delta → percent blocks
    const r = requiresVariationReview({
      originalAmountCents: 10_000_000,
      proposedAmountCents: 10_300_000,
    });
    expect(r.triggers).toBe(false);
    expect(r.percentDelta).toBe(3);
    expect(r.absoluteDeltaCents).toBe(300_000);
    expect(r.reason).toMatch(/below the 20% threshold/i);
  });

  it("TRIGGERS when both percent AND absolute exceed thresholds", () => {
    // $10,000 scope, $13,000 proposed → 30%, $3,000 delta → both fire
    const r = requiresVariationReview({
      originalAmountCents: 1_000_000,
      proposedAmountCents: 1_300_000,
    });
    expect(r.triggers).toBe(true);
    expect(r.percentDelta).toBe(30);
    expect(r.absoluteDeltaCents).toBe(300_000);
    expect(r.reason).toMatch(/exceeds both/i);
    expect(r.reason).toMatch(/20%/);
  });

  // ── Boundary cases ──────────────────────────────────────────────────────
  it("treats exactly-20% + exactly-$2,500 as triggering (inclusive boundaries)", () => {
    // $12,500 scope, $15,000 proposed → 20%, $2,500 delta → exact boundaries
    const r = requiresVariationReview({
      originalAmountCents: 1_250_000,
      proposedAmountCents: 1_500_000,
    });
    expect(r.triggers).toBe(true);
    expect(r.percentDelta).toBe(20);
    expect(r.absoluteDeltaCents).toBe(250_000);
  });

  it("does not trigger at 19.99% even with huge absolute delta", () => {
    // Original $100,000, proposed $119,990 → 19.99%, $19,990 delta
    const r = requiresVariationReview({
      originalAmountCents: 10_000_000,
      proposedAmountCents: 11_999_000,
    });
    expect(r.triggers).toBe(false);
    expect(r.percentDelta).toBe(19.99);
  });

  // ── Per-claim override ─────────────────────────────────────────────────
  it("honours per-claim thresholdPercent override (10%)", () => {
    // $10,000 scope, $11,500 proposed → 15%, $1,500 delta (below floor) —
    // even with 10% threshold, floor still blocks.
    const lowOverride = requiresVariationReview({
      originalAmountCents: 1_000_000,
      proposedAmountCents: 1_150_000,
      thresholdPercent: 10,
    });
    expect(lowOverride.triggers).toBe(false);
    expect(lowOverride.reason).toMatch(/below the AUD 2,500 floor/i);

    // $100,000 scope, $115,000 proposed → 15%, $15,000 delta — 10% threshold triggers.
    const triggering = requiresVariationReview({
      originalAmountCents: 10_000_000,
      proposedAmountCents: 11_500_000,
      thresholdPercent: 10,
    });
    expect(triggering.triggers).toBe(true);
    expect(triggering.appliedThresholdPercent).toBe(10);
  });

  it("falls back to default 20% when override is null / 0 / negative", () => {
    for (const bad of [null, 0, -5]) {
      const r = requiresVariationReview({
        originalAmountCents: 10_000_000,
        proposedAmountCents: 12_000_000, // 20%, $20k
        thresholdPercent: bad as number,
      });
      expect(r.appliedThresholdPercent).toBe(20);
      expect(r.triggers).toBe(true);
    }
  });

  // ── Edge cases ─────────────────────────────────────────────────────────
  it("handles zero-original scope: triggers iff proposed exceeds the floor", () => {
    const below = requiresVariationReview({
      originalAmountCents: 0,
      proposedAmountCents: 100_000, // $1,000
    });
    expect(below.triggers).toBe(false);
    expect(below.reason).toMatch(/below the AUD 2,500 floor/i);

    const above = requiresVariationReview({
      originalAmountCents: 0,
      proposedAmountCents: 250_000, // exactly $2,500 — triggers
    });
    expect(above.triggers).toBe(true);
    expect(above.reason).toMatch(/original scope was zero/i);
  });

  it("treats a credit (negative) variation the same as the equivalent positive absolute", () => {
    // $100,000 scope, $70,000 proposed → -30%, $30,000 delta (abs) → triggers
    const r = requiresVariationReview({
      originalAmountCents: 10_000_000,
      proposedAmountCents: 7_000_000,
    });
    expect(r.triggers).toBe(true);
    expect(r.absoluteDeltaCents).toBe(3_000_000);
    expect(r.percentDelta).toBe(30);
  });

  it("rejects NaN / negative / Infinity amounts without crashing", () => {
    for (const bad of [NaN, -1, Infinity]) {
      const r = requiresVariationReview({
        originalAmountCents: bad,
        proposedAmountCents: 100_000,
      });
      expect(r.triggers).toBe(false);
      expect(r.reason).toMatch(/invalid amounts/i);
    }
    for (const bad of [NaN, -1, Infinity]) {
      const r = requiresVariationReview({
        originalAmountCents: 100_000,
        proposedAmountCents: bad,
      });
      expect(r.triggers).toBe(false);
    }
  });

  it("zero-delta (no change) never triggers", () => {
    const r = requiresVariationReview({
      originalAmountCents: 10_000_000,
      proposedAmountCents: 10_000_000,
    });
    expect(r.triggers).toBe(false);
    expect(r.absoluteDeltaCents).toBe(0);
    expect(r.percentDelta).toBe(0);
  });
});
