/**
 * Scope Variation Auto-Approval Rules Engine — RA-1131
 *
 * Pure function: no DB calls, no side-effects.
 * Evaluates a scope variation against three-tier thresholds:
 *   auto-approved  → safe to persist immediately
 *   needs-adjuster → flag for adjuster review queue
 *   needs-insurer  → block; requires manual insurer sign-off
 *
 * Thresholds (GST-exclusive amounts):
 *   AU  auto-approve:   costDelta ≤ $2,500 AND percent ≤ 10%
 *   AU  needs-adjuster: costDelta ≤ $10,000 AND percent ≤ 25%
 *   NZ  auto-approve:   costDelta ≤ $2,800 AND percent ≤ 10%
 *   NZ  needs-adjuster: costDelta ≤ $11,000 AND percent ≤ 25%
 *
 * Hard overrides (always escalate regardless of cost):
 *   - Cat 3 (black water) contamination
 *   - Structural damage flag
 */

export type AutoDecision = "auto-approved" | "needs-adjuster" | "needs-insurer";

export type AutoDecisionResult = {
  decision: AutoDecision;
  reason: string;
  thresholdsApplied: {
    country: "AU" | "NZ";
    autoApproveCentsLimit: number;
    autoApprovePercentLimit: number;
    adjusterCentsLimit: number;
    adjusterPercentLimit: number;
    gstRate: number;
  };
};

/** Subset of ScopeVariation fields required for evaluation. */
export type VariationInput = {
  /** Cost delta in cents, GST-exclusive. Positive = scope increase. */
  costDeltaCents: number;
  /** Percentage change relative to the original scope total (0–100 scale). */
  costDeltaPercent: number | null;
  /** Free-text flag — set to "CAT3" or "3" to trigger hard override. */
  waterCategory?: string | null;
  /** Set to true if variation involves structural work. */
  isStructural?: boolean | null;
};

/** Minimal inspection context needed for threshold selection. */
export type InspectionContext = {
  /** Organisation country — "AU" or "NZ". Defaults to "AU" when undefined. */
  country?: string | null;
};

/** Threshold set for one country. All cost values are GST-exclusive cents. */
type ThresholdSet = {
  country: "AU" | "NZ";
  autoApproveCentsLimit: number; // inclusive upper bound
  autoApprovePercentLimit: number; // inclusive upper bound (0–100 scale)
  adjusterCentsLimit: number;
  adjusterPercentLimit: number;
  gstRate: number; // decimal, e.g. 0.10
};

const THRESHOLDS: Record<"AU" | "NZ", ThresholdSet> = {
  AU: {
    country: "AU",
    autoApproveCentsLimit: 250_000, // $2,500 AUD excl. GST
    autoApprovePercentLimit: 10,
    adjusterCentsLimit: 1_000_000, // $10,000 AUD excl. GST
    adjusterPercentLimit: 25,
    gstRate: 0.1,
  },
  NZ: {
    country: "NZ",
    autoApproveCentsLimit: 280_000, // $2,800 NZD excl. GST
    autoApprovePercentLimit: 10,
    adjusterCentsLimit: 1_100_000, // $11,000 NZD excl. GST
    adjusterPercentLimit: 25,
    gstRate: 0.15,
  },
};

function resolveCountry(inspection: InspectionContext): "AU" | "NZ" {
  return inspection.country === "NZ" ? "NZ" : "AU";
}

function isCat3(waterCategory: string | null | undefined): boolean {
  if (!waterCategory) return false;
  const normalised = waterCategory.trim().toUpperCase();
  // Accept "3", "CAT3", "CAT 3", "CATEGORY 3"
  return (
    normalised === "3" ||
    normalised === "CAT3" ||
    normalised === "CAT 3" ||
    normalised === "CATEGORY 3"
  );
}

/**
 * Evaluate a scope variation and return a three-tier decision.
 *
 * @param variation      The variation being created or updated.
 * @param inspection     Inspection context (used for country resolution).
 * @param _contractPolicyLimit  Reserved — policy-level limit not yet enforced;
 *                               pass `null` to signal "not provided".
 */
export function evaluateVariation(
  variation: VariationInput,
  inspection: InspectionContext,
  _contractPolicyLimit: number | null,
): AutoDecisionResult {
  const country = resolveCountry(inspection);
  const t = THRESHOLDS[country];

  const absDeltaCents = Math.abs(variation.costDeltaCents);
  const absDeltaPercent =
    variation.costDeltaPercent !== null &&
    variation.costDeltaPercent !== undefined
      ? Math.abs(variation.costDeltaPercent)
      : null;

  const thresholdsApplied = {
    country,
    autoApproveCentsLimit: t.autoApproveCentsLimit,
    autoApprovePercentLimit: t.autoApprovePercentLimit,
    adjusterCentsLimit: t.adjusterCentsLimit,
    adjusterPercentLimit: t.adjusterPercentLimit,
    gstRate: t.gstRate,
  };

  // Hard override: structural work
  if (variation.isStructural) {
    return {
      decision: "needs-insurer",
      reason:
        "Structural damage variation requires insurer sign-off (S500:2025 §7.1).",
      thresholdsApplied,
    };
  }

  // Hard override: Cat 3 (black water) contamination
  if (isCat3(variation.waterCategory)) {
    return {
      decision: "needs-insurer",
      reason:
        "Category 3 water contamination variation requires insurer sign-off (S500:2025 §7.3).",
      thresholdsApplied,
    };
  }

  // Percent check — if percent is known and breaches adjuster limit, escalate immediately
  const percentExceedsAdjuster =
    absDeltaPercent !== null && absDeltaPercent > t.adjusterPercentLimit;
  const centsExceedsAdjuster = absDeltaCents > t.adjusterCentsLimit;

  if (percentExceedsAdjuster || centsExceedsAdjuster) {
    return {
      decision: "needs-insurer",
      reason: `Variation exceeds adjuster authority (${country} limit: ${(t.adjusterCentsLimit / 100).toFixed(0)} ${country === "NZ" ? "NZD" : "AUD"} / ${t.adjusterPercentLimit}%); insurer sign-off required.`,
      thresholdsApplied,
    };
  }

  const percentWithinAutoApprove =
    absDeltaPercent === null || absDeltaPercent <= t.autoApprovePercentLimit;
  const centsWithinAutoApprove = absDeltaCents <= t.autoApproveCentsLimit;

  if (centsWithinAutoApprove && percentWithinAutoApprove) {
    return {
      decision: "auto-approved",
      reason: `Variation within auto-approve thresholds (≤ ${(t.autoApproveCentsLimit / 100).toFixed(0)} ${country === "NZ" ? "NZD" : "AUD"} excl. GST and ≤ ${t.autoApprovePercentLimit}% of original scope).`,
      thresholdsApplied,
    };
  }

  // Falls between auto-approve and insurer thresholds → adjuster review
  return {
    decision: "needs-adjuster",
    reason: `Variation requires adjuster review (${country} mid-range: ≤ ${(t.adjusterCentsLimit / 100).toFixed(0)} ${country === "NZ" ? "NZD" : "AUD"} excl. GST and ≤ ${t.adjusterPercentLimit}% of original scope).`,
    thresholdsApplied,
  };
}
