import { describe, expect, it } from "vitest";
import { evaluateSlo, getSloTargets, percentile } from "../slo-targets";

describe("slo-targets", () => {
  it("computes p95", () => {
    expect(percentile([10, 20, 30, 40, 100], 95)).toBe(100);
  });

  it("passes when within budget", () => {
    const targets = { ...getSloTargets(), p95LatencyMs: 500, errorRateMax: 0.1 };
    const result = evaluateSlo(
      { latenciesMs: [100, 120, 150, 180, 200], errors: 0, total: 5 },
      targets,
    );
    expect(result.pass).toBe(true);
    expect(result.p95Ms).toBe(200);
  });

  it("fails on high p95", () => {
    const targets = { ...getSloTargets(), p95LatencyMs: 100, errorRateMax: 0.1 };
    const result = evaluateSlo(
      { latenciesMs: [50, 80, 200, 300, 400], errors: 0, total: 5 },
      targets,
    );
    expect(result.pass).toBe(false);
  });
});