/**
 * RA-7053 — Live Teacher ANALYSIS-layer gate aggregations (pure).
 *
 * Cost rollup, citation-error rate, and completeness delta. Each function takes
 * plain data (already fetched by the route) and returns a serialisable summary,
 * so the aggregations are unit-testable without a DB.
 */

import {
  classifyClauseRef,
  type CitationVerdict,
  type CorpusIndex,
} from "./citation-validity";

// ── Part 1: per-inspection cost rollup ──────────────────────────────────────

/** $5 AUD — an inspection above this is flagged as over-threshold. */
export const COST_THRESHOLD_CENTS = 500;

export interface CostRollupRow {
  inspectionId: string;
  sumCents: number; // summed totalCostAudCents across the inspection's sessions
  sessionCount: number;
}

export interface CostRollup {
  inspectionsMeasured: number;
  meanCostCents: number;
  p95CostCents: number;
  overThresholdCount: number;
  overThresholdPct: number; // one decimal place
}

export function computeCostRollup(rows: CostRollupRow[]): CostRollup {
  const n = rows.length;
  if (n === 0) {
    return {
      inspectionsMeasured: 0,
      meanCostCents: 0,
      p95CostCents: 0,
      overThresholdCount: 0,
      overThresholdPct: 0,
    };
  }
  const sums = rows.map((r) => r.sumCents);
  const total = sums.reduce((a, b) => a + b, 0);
  const meanCostCents = Math.round(total / n);

  const sorted = [...sums].sort((a, b) => a - b);
  const p95Index = Math.ceil(0.95 * n) - 1;
  const p95CostCents = sorted[p95Index];

  const overThresholdCount = sums.filter((s) => s > COST_THRESHOLD_CENTS).length;
  const overThresholdPct = Math.round((overThresholdCount / n) * 1000) / 10;

  return {
    inspectionsMeasured: n,
    meanCostCents,
    p95CostCents,
    overThresholdCount,
    overThresholdPct,
  };
}

// ── Part 2: citation-error classification metrics ───────────────────────────

export interface CitationMetrics {
  totalRefs: number;
  totalAssistantUtterances: number;
  verdictCounts: Record<CitationVerdict, number>;
  /**
   * Refs that could actually be validated against the corpus (total minus
   * `unknown`). This is the denominator for `citationErrorRate`. When it is 0
   * the corpus carries none of the cited standards' clauses — the gate has
   * insufficient data (see the dashboard "collecting" state).
   */
  validatableRefs: number;
  /**
   * Parseable refs whose standard is absent from the corpus — not validatable,
   * so NOT counted as errors. High when the S500-clause corpus is unconfigured.
   */
  unknownCount: number;
  /** Headline: fabricated-clause refs / VALIDATABLE refs (unknown excluded from both). */
  citationErrorRate: number;
  /** Secondary: % of assistant utterances carrying ≥1 fabricated ref. */
  utterancesWithInvalidRefPct: number;
}

export function computeCitationMetrics(
  utterances: { clauseRefs: string[] }[],
  corpus: CorpusIndex,
): CitationMetrics {
  const verdictCounts: Record<CitationVerdict, number> = {
    valid: 0,
    invalid_no_such_clause: 0,
    unknown: 0,
    edition_mismatch: 0,
    unparseable: 0,
  };
  let totalRefs = 0;
  let utterancesWithInvalid = 0;

  for (const u of utterances) {
    let hasInvalid = false;
    for (const ref of u.clauseRefs) {
      const verdict = classifyClauseRef(ref, corpus);
      verdictCounts[verdict] += 1;
      totalRefs += 1;
      if (verdict === "invalid_no_such_clause") hasInvalid = true;
    }
    if (hasInvalid) utterancesWithInvalid += 1;
  }

  const totalAssistantUtterances = utterances.length;
  const unknownCount = verdictCounts.unknown;
  // `unknown` refs cannot be validated (corpus has none of that standard's
  // clauses), so they count toward NEITHER the numerator nor the denominator.
  const validatableRefs = totalRefs - unknownCount;
  const citationErrorRate =
    validatableRefs > 0
      ? verdictCounts.invalid_no_such_clause / validatableRefs
      : 0;
  const utterancesWithInvalidRefPct =
    totalAssistantUtterances > 0
      ? (utterancesWithInvalid / totalAssistantUtterances) * 100
      : 0;

  return {
    totalRefs,
    totalAssistantUtterances,
    verdictCounts,
    validatableRefs,
    unknownCount,
    citationErrorRate,
    utterancesWithInvalidRefPct,
  };
}

// ── Part 3: completeness delta (assisted vs control) ────────────────────────

export interface CompletenessDelta {
  nAssisted: number;
  nControl: number;
  meanAssisted: number | null;
  meanControl: number | null;
  deltaPoints: number | null;
  /** false when either arm is empty — deltaPoints is null and must not divide. */
  sufficient: boolean;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function computeCompletenessDelta(
  assisted: number[],
  control: number[],
): CompletenessDelta {
  const nAssisted = assisted.length;
  const nControl = control.length;

  if (nAssisted === 0 || nControl === 0) {
    return {
      nAssisted,
      nControl,
      meanAssisted: nAssisted > 0 ? round1(mean(assisted)) : null,
      meanControl: nControl > 0 ? round1(mean(control)) : null,
      deltaPoints: null,
      sufficient: false,
    };
  }

  const mA = mean(assisted);
  const mC = mean(control);
  return {
    nAssisted,
    nControl,
    meanAssisted: round1(mA),
    meanControl: round1(mC),
    deltaPoints: round1(mA - mC),
    sufficient: true,
  };
}

// ── Part 3b: completeness GO-gate verdict (statistical-validity floors) ──────
//
// `sufficient` above is only the divide-by-zero guard (both arms non-empty). A
// GO decision must NOT rest on a statistically meaningless signal: n=1 vs n=1
// with a +0.1pt delta would otherwise pass. The verdict below adds a per-arm
// minimum sample size AND a minimum effect size (delta floor) — mirroring the
// citation gate's honest "collecting" state.

export interface CompletenessGateThresholds {
  /** Minimum reports in EACH arm before the delta is meaningful. */
  minPerArm: number;
  /** Minimum uplift (assisted − control, 0-100 scale) to count as a real effect. */
  minDeltaPoints: number;
}

export type CompletenessGateReason =
  | "insufficient_sample" // still collecting — an arm is below the per-arm floor
  | "delta_below_floor" // enough data, but the uplift is below the effect-size floor
  | null; // pass

export interface CompletenessGateVerdict {
  pass: boolean;
  /** true only while an arm is below the per-arm floor (genuinely still collecting). */
  collecting: boolean;
  reason: CompletenessGateReason;
}

export function evaluateCompletenessGate(
  delta: CompletenessDelta,
  thresholds: CompletenessGateThresholds,
): CompletenessGateVerdict {
  const belowSample =
    !delta.sufficient ||
    delta.nAssisted < thresholds.minPerArm ||
    delta.nControl < thresholds.minPerArm;
  if (belowSample) {
    return { pass: false, collecting: true, reason: "insufficient_sample" };
  }
  // Enough data in both arms — the effect size decides. A trivially-positive or
  // negative delta is an honest FAIL, not "collecting" (data was collected).
  const pass =
    delta.deltaPoints !== null &&
    delta.deltaPoints >= thresholds.minDeltaPoints;
  return {
    pass,
    collecting: false,
    reason: pass ? null : "delta_below_floor",
  };
}
