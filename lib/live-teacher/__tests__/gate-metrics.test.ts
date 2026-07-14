/**
 * RA-7053 — gate-metrics pure aggregation unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  computeCostRollup,
  computeCitationMetrics,
  computeCompletenessDelta,
  evaluateCompletenessGate,
  COST_THRESHOLD_CENTS,
} from "../gate-metrics";
import { buildCorpusIndex } from "../citation-validity";

describe("computeCostRollup", () => {
  it("sums multiple sessions per inspection (already summed by groupBy) and applies the 500-cent threshold", () => {
    const rollup = computeCostRollup([
      { inspectionId: "a", sumCents: 300, sessionCount: 2 }, // under
      { inspectionId: "b", sumCents: 700, sessionCount: 3 }, // over
      { inspectionId: "c", sumCents: 500, sessionCount: 1 }, // exactly at → NOT over
      { inspectionId: "d", sumCents: 900, sessionCount: 1 }, // over
    ]);
    expect(rollup.inspectionsMeasured).toBe(4);
    expect(rollup.meanCostCents).toBe(600); // (300+700+500+900)/4
    expect(rollup.overThresholdCount).toBe(2); // only strictly > 500
    expect(rollup.overThresholdPct).toBe(50);
    expect(COST_THRESHOLD_CENTS).toBe(500);
  });

  it("computes p95 via ceil(0.95*n)-1 on the sorted sums", () => {
    // n=10 → index = ceil(9.5)-1 = 9 → the max element
    const rows = Array.from({ length: 10 }, (_, i) => ({
      inspectionId: `i${i}`,
      sumCents: (i + 1) * 100, // 100..1000
      sessionCount: 1,
    }));
    expect(computeCostRollup(rows).p95CostCents).toBe(1000);
  });

  it("returns zeros for an empty cohort (no divide-by-zero)", () => {
    expect(computeCostRollup([])).toEqual({
      inspectionsMeasured: 0,
      meanCostCents: 0,
      p95CostCents: 0,
      overThresholdCount: 0,
      overThresholdPct: 0,
    });
  });
});

describe("computeCitationMetrics", () => {
  const corpus = buildCorpusIndex([
    { standard: "IICRC_S500", edition: "2021", clause: "10.3.2" },
  ]);

  it("surfaces denominators and the fabricated-clause error rate", () => {
    const metrics = computeCitationMetrics(
      [
        { clauseRefs: ["[S500:2021 §10.3.2]", "[S500:2021 §99.99]"] }, // 1 valid, 1 fabricated // standards-cite-ignore (intentional negative-test fixture)
        { clauseRefs: ["[S500:2021 §10.3.2]"] }, // 1 valid
        { clauseRefs: [] }, // no refs
      ],
      corpus,
    );
    expect(metrics.totalAssistantUtterances).toBe(3);
    expect(metrics.totalRefs).toBe(3);
    expect(metrics.verdictCounts.valid).toBe(2);
    expect(metrics.verdictCounts.invalid_no_such_clause).toBe(1);
    expect(metrics.citationErrorRate).toBeCloseTo(1 / 3, 5);
    // 1 of 3 utterances carried a fabricated ref
    expect(metrics.utterancesWithInvalidRefPct).toBeCloseTo(100 / 3, 5);
  });

  it("returns a zero rate (no divide-by-zero) when there are no refs", () => {
    const metrics = computeCitationMetrics([{ clauseRefs: [] }], corpus);
    expect(metrics.totalRefs).toBe(0);
    expect(metrics.validatableRefs).toBe(0);
    expect(metrics.unknownCount).toBe(0);
    expect(metrics.citationErrorRate).toBe(0);
    expect(metrics.utterancesWithInvalidRefPct).toBe(0);
  });

  it("does NOT count `unknown` refs (standard absent from corpus) as errors", () => {
    // Every ref is for NZBS, which the S500-only corpus does not carry.
    const metrics = computeCitationMetrics(
      [{ clauseRefs: ["[NZBS E2 §3.1]", "[NZBS E3 §1.2]"] }],
      corpus,
    );
    expect(metrics.totalRefs).toBe(2);
    expect(metrics.unknownCount).toBe(2);
    expect(metrics.validatableRefs).toBe(0);
    expect(metrics.verdictCounts.unknown).toBe(2);
    expect(metrics.verdictCounts.invalid_no_such_clause).toBe(0);
    // No validatable refs → rate is 0 (collecting), never a false catastrophe.
    expect(metrics.citationErrorRate).toBe(0);
  });

  it("excludes `unknown` refs from the citationErrorRate denominator", () => {
    // valid + fabricated (both S500, in corpus) + one unknown (NZBS, not in corpus).
    const metrics = computeCitationMetrics(
      [
        {
          clauseRefs: [
            "[S500:2021 §10.3.2]", // valid
            "[S500:2021 §99.99]", // fabricated — standard present, clause absent // standards-cite-ignore (intentional negative-test fixture)
            "[NZBS E2 §3.1]", // unknown — standard absent from corpus
          ],
        },
      ],
      corpus,
    );
    expect(metrics.totalRefs).toBe(3);
    expect(metrics.unknownCount).toBe(1);
    expect(metrics.validatableRefs).toBe(2);
    expect(metrics.verdictCounts.invalid_no_such_clause).toBe(1);
    // 1 fabricated / 2 validatable = 0.5 — NOT 1/3 (unknown excluded from denominator).
    expect(metrics.citationErrorRate).toBeCloseTo(0.5, 5);
  });
});

describe("computeCompletenessDelta", () => {
  it("computes the mean delta across both arms", () => {
    const delta = computeCompletenessDelta([80, 90], [60, 70]);
    expect(delta.sufficient).toBe(true);
    expect(delta.meanAssisted).toBe(85);
    expect(delta.meanControl).toBe(65);
    expect(delta.deltaPoints).toBe(20);
    expect(delta.nAssisted).toBe(2);
    expect(delta.nControl).toBe(2);
  });

  it("flags insufficient data for an empty control arm (no divide-by-zero)", () => {
    const delta = computeCompletenessDelta([80, 90], []);
    expect(delta.sufficient).toBe(false);
    expect(delta.deltaPoints).toBeNull();
    expect(delta.meanControl).toBeNull();
    expect(delta.meanAssisted).toBe(85);
    expect(delta.nControl).toBe(0);
  });
});

describe("evaluateCompletenessGate", () => {
  const thresholds = { minPerArm: 5, minDeltaPoints: 15 };

  it("does NOT pass a tiny-n, trivially-positive delta (the bug)", () => {
    // n=1 vs n=1 with +0.1pt would previously pass — statistically meaningless.
    const delta = computeCompletenessDelta([80.1], [80]);
    expect(delta.sufficient).toBe(true);
    expect(delta.deltaPoints).toBe(0.1);
    const v = evaluateCompletenessGate(delta, thresholds);
    expect(v.pass).toBe(false);
    expect(v.collecting).toBe(true);
    expect(v.reason).toBe("insufficient_sample");
  });

  it("is 'collecting' (insufficient sample) when EITHER arm is below the per-arm floor", () => {
    // Assisted has 5 (meets floor), control has 4 (below) — big delta, still short.
    const delta = computeCompletenessDelta(
      [90, 90, 90, 90, 90],
      [50, 50, 50, 50],
    );
    expect(delta.deltaPoints).toBe(40);
    const v = evaluateCompletenessGate(delta, thresholds);
    expect(v.pass).toBe(false);
    expect(v.collecting).toBe(true);
    expect(v.reason).toBe("insufficient_sample");
  });

  it("does NOT pass when the delta is below the effect-size floor, even with enough samples", () => {
    // 5 per arm (meets sample floor) but only a +10pt uplift (< 15pt floor).
    const delta = computeCompletenessDelta(
      [80, 80, 80, 80, 80],
      [70, 70, 70, 70, 70],
    );
    expect(delta.deltaPoints).toBe(10);
    const v = evaluateCompletenessGate(delta, thresholds);
    expect(v.pass).toBe(false);
    // Data WAS collected — this is an honest fail, not "collecting".
    expect(v.collecting).toBe(false);
    expect(v.reason).toBe("delta_below_floor");
  });

  it("passes when both floors are met and the delta clears the effect-size floor", () => {
    const delta = computeCompletenessDelta(
      [90, 90, 90, 90, 90],
      [70, 70, 70, 70, 70],
    );
    expect(delta.deltaPoints).toBe(20);
    const v = evaluateCompletenessGate(delta, thresholds);
    expect(v.pass).toBe(true);
    expect(v.collecting).toBe(false);
    expect(v.reason).toBeNull();
  });

  it("passes exactly at the effect-size floor (>= is inclusive)", () => {
    const delta = computeCompletenessDelta(
      [85, 85, 85, 85, 85],
      [70, 70, 70, 70, 70],
    );
    expect(delta.deltaPoints).toBe(15);
    expect(evaluateCompletenessGate(delta, thresholds).pass).toBe(true);
  });

  it("does NOT pass a negative delta (assisted worse than control)", () => {
    const delta = computeCompletenessDelta(
      [60, 60, 60, 60, 60],
      [80, 80, 80, 80, 80],
    );
    expect(delta.deltaPoints).toBe(-20);
    const v = evaluateCompletenessGate(delta, thresholds);
    expect(v.pass).toBe(false);
    expect(v.reason).toBe("delta_below_floor");
  });
});
