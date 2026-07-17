import { describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { analyseRegression, promoteToBaseline } from "../runner/baseline.js";
import type { JobResult, RunReport } from "../runner/orchestrator.js";
import type { GradedAssessment } from "../runner/grader.js";
import { SYNTHETIC_COMPANIES } from "../companies/fixtures.js";
import { JOBS } from "../jobs/index.js";

function graded(
  detComposite: number | null,
  judgeComposite: number | null,
): GradedAssessment {
  return {
    inspectionId: "i_1",
    domain: "WATER",
    generationId: "g_1",
    modelUsed: null,
    latencyMs: 1,
    costEstimateUsd: null,
    deterministic:
      detComposite === null
        ? null
        : {
            composite: detComposite,
            structural: 0,
            citations: 0,
            equipment: 0,
            specificity: 0,
            category: 0,
          },
    adjuster: null,
    judge:
      judgeComposite === null
        ? null
        : {
            professionalism: 8,
            specificity: 8,
            consistency: 8,
            actionability: 8,
            composite: judgeComposite,
            rationale: "test",
            modelUsed: "test",
            costUsd: 0,
            latencyMs: 0,
          },
    fullyGraded: detComposite !== null && judgeComposite !== null,
  };
}

function jobResult(
  companyKey: string,
  jobKey: string,
  detComposite: number | null,
  judgeComposite: number | null = null,
): JobResult {
  const company = SYNTHETIC_COMPANIES.find((c) => c.key === companyKey)!;
  const job = JOBS.find((j) => j.key === jobKey)!;
  return {
    company,
    job,
    inspectionId: "i_1",
    generationId: "g_1",
    durationMs: 100,
    graded: graded(detComposite, judgeComposite),
  };
}

function report(results: JobResult[]): RunReport {
  return {
    runId: "test",
    baseUrl: "https://restoreassist-sandbox.vercel.app",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    totalMs: 0,
    results,
    success: true,
  };
}

describe("baseline regression detector", () => {
  it("returns baselineFound=false when the file is missing", async () => {
    const r = report([jobResult("beyond-clean", "water-cat2", 80)]);
    const tmp = path.join(os.tmpdir(), "missing-baseline.json");
    const a = await analyseRegression({ report: r, baselinePath: tmp });
    expect(a.baselineFound).toBe(false);
    expect(a.pass).toBe(true);
    expect(a.findings).toEqual([]);
  });

  it("passes when scores are within tolerance", async () => {
    const r = report([jobResult("beyond-clean", "water-cat2", 78)]);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-pass-"));
    const baselinePath = path.join(tmpDir, "b.json");
    await promoteToBaseline({
      report: report([jobResult("beyond-clean", "water-cat2", 80)]),
      baselinePath,
      note: "seed",
    });
    const a = await analyseRegression({ report: r, baselinePath });
    expect(a.baselineFound).toBe(true);
    expect(a.pass).toBe(true);
    expect(a.findings.filter((f) => f.severity === "hard")).toEqual([]);
  });

  it("hard-fails on a single-cell drop > tolerance", async () => {
    const r = report([jobResult("beyond-clean", "water-cat2", 60)]);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-hard-"));
    const baselinePath = path.join(tmpDir, "b.json");
    await promoteToBaseline({
      report: report([jobResult("beyond-clean", "water-cat2", 80)]),
      baselinePath,
      note: "seed",
    });
    const a = await analyseRegression({ report: r, baselinePath });
    expect(a.pass).toBe(false);
    const hard = a.findings.filter((f) => f.severity === "hard");
    expect(hard.length).toBeGreaterThan(0);
    expect(hard[0].dimension).toBe("deterministic");
  });

  it("coverage-fails when a previously graded cell is now ungraded", async () => {
    const r = report([jobResult("beyond-clean", "water-cat2", null)]);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-cov-"));
    const baselinePath = path.join(tmpDir, "b.json");
    await promoteToBaseline({
      report: report([jobResult("beyond-clean", "water-cat2", 80)]),
      baselinePath,
      note: "seed",
    });
    const a = await analyseRegression({ report: r, baselinePath });
    expect(a.pass).toBe(false);
    expect(a.findings.some((f) => f.severity === "coverage")).toBe(true);
  });

  it("soft-fails on aggregate mean drop", async () => {
    const r = report([
      jobResult("beyond-clean", "water-cat2", 70),
      jobResult("elite-restoration", "water-cat2", 70),
    ]);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-soft-"));
    const baselinePath = path.join(tmpDir, "b.json");
    await promoteToBaseline({
      report: report([
        jobResult("beyond-clean", "water-cat2", 80),
        jobResult("elite-restoration", "water-cat2", 80),
      ]),
      baselinePath,
      note: "seed",
    });
    const a = await analyseRegression({
      report: r,
      baselinePath,
      cellTolerance: 100, // disable hard fails
      meanTolerance: 4,
    });
    expect(a.findings.some((f) => f.severity === "soft")).toBe(true);
    // Soft alone doesn't fail the gate.
    expect(a.pass).toBe(true);
  });

  it("ignores cells in the baseline that are no longer in the run", async () => {
    const r = report([jobResult("beyond-clean", "water-cat2", 80)]);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-skip-"));
    const baselinePath = path.join(tmpDir, "b.json");
    await promoteToBaseline({
      report: report([
        jobResult("beyond-clean", "water-cat2", 80),
        jobResult("elite-restoration", "mould-cond3", 80),
      ]),
      baselinePath,
      note: "seed",
    });
    const a = await analyseRegression({ report: r, baselinePath });
    // The missing cell counts as a coverage finding.
    expect(a.findings.some((f) => f.severity === "coverage")).toBe(true);
  });
});
