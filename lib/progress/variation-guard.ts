/**
 * variation-guard.ts — M-6 (RA-1382)
 *
 * Pure predicate that answers: given an original scope amount and a proposed
 * revised amount, does the variation require carrier re-authorisation
 * (transition to VARIATION_REVIEW state)?
 *
 * Board rule (minutes §8, M-6):
 *   - Default threshold: 20% of the original scope amount
 *   - Absolute floor: AUD 2,500 — variations below this are never flagged
 *     regardless of percentage
 *   - Per-claim override via ClaimProgress.carrierVariationThresholdPercent
 *   - BOTH percentage AND absolute floor conditions must be satisfied for
 *     VARIATION_REVIEW to trigger (i.e. small dollar moves that happen to
 *     be high-percentage of a tiny job don't flag; big dollar moves that
 *     happen to be low-percentage of a huge job don't flag either)
 *
 * All amounts are in cents (integer) to avoid floating-point errors on the
 * AUD 2,500 floor. 250,000 cents = AUD 2,500.00.
 *
 * Called by lib/progress/service.ts on the commence_drying → drying_active
 * and subsequent variation_review transitions (M-21 Sprint 1).
 */

/** Absolute floor in cents — AUD 2,500.00 hardcoded per board minutes §8 M-6. */
export const VARIATION_ABSOLUTE_FLOOR_CENTS = 250_000 as const;

/** Default percentage threshold if no per-claim override set. */
export const DEFAULT_VARIATION_THRESHOLD_PERCENT = 20 as const;

export interface VariationInput {
  /** Original approved scope amount in cents. Must be >= 0. */
  originalAmountCents: number;
  /** Proposed revised amount in cents. Must be >= 0. */
  proposedAmountCents: number;
  /**
   * Per-claim override (ClaimProgress.carrierVariationThresholdPercent).
   * Null/undefined falls back to DEFAULT_VARIATION_THRESHOLD_PERCENT.
   * Must be a positive integer if supplied.
   */
  thresholdPercent?: number | null;
}

export interface VariationResult {
  /** True iff the variation must transition to VARIATION_REVIEW. */
  triggers: boolean;
  /**
   * Human-readable rationale. Always populated so the UI has something to
   * display — never a blank "blocked" message (principle 3).
   */
  reason: string;
  /** Percentage delta, positive or negative, rounded to 2 dp. */
  percentDelta: number;
  /** Absolute delta in cents, always positive (`Math.abs`). */
  absoluteDeltaCents: number;
  /** Effective threshold used for this decision. */
  appliedThresholdPercent: number;
}

/**
 * Core guard. Returns a structured decision so the service layer, the UI,
 * and the audit log all read from the same shape.
 */
export function requiresVariationReview(input: VariationInput): VariationResult {
  const { originalAmountCents, proposedAmountCents } = input;
  const appliedThresholdPercent =
    input.thresholdPercent && input.thresholdPercent > 0
      ? input.thresholdPercent
      : DEFAULT_VARIATION_THRESHOLD_PERCENT;

  // Defensive: reject obviously wrong inputs. Service layer should have
  // already validated at the API boundary; this is a second line.
  if (
    !Number.isFinite(originalAmountCents) ||
    !Number.isFinite(proposedAmountCents) ||
    originalAmountCents < 0 ||
    proposedAmountCents < 0
  ) {
    return {
      triggers: false,
      reason: "Invalid amounts — original and proposed must be non-negative cents.",
      percentDelta: 0,
      absoluteDeltaCents: 0,
      appliedThresholdPercent,
    };
  }

  const absoluteDeltaCents = Math.abs(proposedAmountCents - originalAmountCents);

  // Zero-original edge case: any positive proposed amount is conceptually
  // an infinite-percent change. Treat as "triggers if above the absolute
  // floor". Below the floor, still a no-op.
  if (originalAmountCents === 0) {
    if (absoluteDeltaCents < VARIATION_ABSOLUTE_FLOOR_CENTS) {
      return {
        triggers: false,
        reason: `Absolute delta ${formatAud(absoluteDeltaCents)} below the AUD 2,500 floor.`,
        percentDelta: proposedAmountCents > 0 ? Infinity : 0,
        absoluteDeltaCents,
        appliedThresholdPercent,
      };
    }
    return {
      triggers: true,
      reason:
        `Original scope was zero and proposed amount ${formatAud(proposedAmountCents)} ` +
        `exceeds the AUD 2,500 absolute floor — variation review required.`,
      percentDelta: Infinity,
      absoluteDeltaCents,
      appliedThresholdPercent,
    };
  }

  const percentDelta = round2((absoluteDeltaCents / originalAmountCents) * 100);
  const aboveFloor = absoluteDeltaCents >= VARIATION_ABSOLUTE_FLOOR_CENTS;
  const abovePercent = percentDelta >= appliedThresholdPercent;

  if (aboveFloor && abovePercent) {
    return {
      triggers: true,
      reason:
        `Variation ${formatAud(absoluteDeltaCents)} (${percentDelta}%) exceeds both the ` +
        `AUD 2,500 absolute floor and the ${appliedThresholdPercent}% threshold — ` +
        `carrier re-authorisation required.`,
      percentDelta,
      absoluteDeltaCents,
      appliedThresholdPercent,
    };
  }

  if (!aboveFloor) {
    return {
      triggers: false,
      reason:
        `Absolute delta ${formatAud(absoluteDeltaCents)} is below the AUD 2,500 floor ` +
        `(${percentDelta}% of original) — no variation review needed.`,
      percentDelta,
      absoluteDeltaCents,
      appliedThresholdPercent,
    };
  }

  return {
    triggers: false,
    reason:
      `Variation ${percentDelta}% is below the ${appliedThresholdPercent}% threshold ` +
      `(absolute delta ${formatAud(absoluteDeltaCents)}) — no review needed.`,
    percentDelta,
    absoluteDeltaCents,
    appliedThresholdPercent,
  };
}

/** Format cents as AUD with two decimals — purely for human-readable `reason`. */
function formatAud(cents: number): string {
  if (!Number.isFinite(cents)) return `AUD ${cents}`;
  return `AUD ${(cents / 100).toFixed(2)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
