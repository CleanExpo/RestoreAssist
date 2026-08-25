import { describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";
import { analyseRegression, promoteToBaseline } from "../runner/baseline.js";
import type { JobResult, RunReport } from "../runner/orchestrator.js";
import type { GradedAssessment } from "../runner/grader.js";
import { SYNTHETIC_COMPANIES } from "../companies/fixtures.js";
import { JOBS } from "../jobs/index.js";
import { sha256Json } from "../runner/evidence.js";
import type { GenerateAssessmentOutput } from "../client/api-client.js";

const REVISION = "b".repeat(40);

function generatedAssessment(
  generationId: string,
  domain: string,
  workspaceId: string,
): GenerateAssessmentOutput {
  return {
    assessmentGenerationId: generationId,
    report: { sections: [] },
    scope: { items: [] },
    estimate: { lines: [], totals: { subtotalExGst: 0, gstTotal: 0, totalIncGst: 0 } },
    citations: [],
    meta: {
      domain,
      generatedAt: new Date().toISOString(),
      modelUsed: "test-model",
      latencyMs: 1,
      costEstimateUsd: 0,
      workspaceId,
    },
  } as unknown as GenerateAssessmentOutput;
}

function graded(
  detComposite: number | null,
  judgeComposite: number | null,
  inspectionId: string,
  generationId: string,
  domain: GradedAssessment["domain"],
  assessmentSha256: string,
): GradedAssessment {
  return {
    inspectionId,
    domain,
    generationId,
    assessmentSha256,
    modelUsed: "test-model",
    latencyMs: 1,
    costEstimateUsd: 0,
    deterministic:
      detComposite === null
        ? null
        : {
            composite: detComposite,
            structural: detComposite,
            citations: detComposite,
            equipment: detComposite,
            specificity: detComposite,
            category: detComposite,
          },
    adjuster:
      detComposite === null || judgeComposite === null
        ? null
        : {
            recommendation: "approve",
            findingCount: 0,
            criticalFindings: 0,
            costReasonableness: "within-range",
            inspectionId,
            generationId,
            assessmentSha256,
            costUsd: 0,
            failedAttemptCostUsd: 0,
            raw: {
              inspectionId,
              assessmentGenerationId: generationId,
              assessmentSha256,
              recommendation: "approve",
              findings: [],
              costReasonableness: "within-range",
              costUsd: 0,
              failedAttemptCostUsd: 0,
            },
          },
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
  judgeComposite: number | null = detComposite,
): JobResult {
  const company = SYNTHETIC_COMPANIES.find((c) => c.key === companyKey)!;
  const job = JOBS.find((j) => j.key === jobKey)!;
  const identity = `${companyKey}-${jobKey}`;
  const generationId = `g-${identity}`;
  const pilotEmail = `pilot-${company.key}@restoreassist.sandbox`;
  const workspaceId = `workspace-${company.key}`;
  const imageEvidence = Array.from({ length: job.photoCount }, (_, index) => ({
    cacheKey: sha256Json(`${identity}-image-${index}`).slice(0, 40),
    contentSha256: sha256Json(`${identity}-content-${index}`),
    photoId: `photo-${identity}-${index}`,
  }));
  const generated = generatedAssessment(generationId, job.domain, workspaceId);
  const outputSha256 = sha256Json(generated);
  return {
    company,
    job,
    inspectionId: `i-${identity}`,
    generationId,
    pilotEmail,
    workspaceId,
    imageEvidence,
    inputSha256: sha256Json({
      company,
      job,
      pilotEmail,
      workspaceId,
      images: imageEvidence,
    }),
    generatedAssessment: generated,
    outputSha256,
    durationMs: 100,
    graded: graded(
      detComposite,
      judgeComposite,
      `i-${identity}`,
      `g-${identity}`,
      job.domain,
      outputSha256,
    ),
    budgetEvidence: {
      reservationId: `reservation-${identity}`,
      workspaceId,
      ceilingUsd: 5,
      startingSpentUsd: 0,
      reservedUsd: 0.1,
      generationCostUsd: 0,
      judgeCostUsd: 0,
      adjusterCostUsd: 0,
      failedAttemptCostUsd: 0,
      totalActualCostUsd: 0,
      reconciledSpentUsd: 0,
      reconciledAt: new Date().toISOString(),
    },
  };
}

function report(results: JobResult[]): RunReport {
  const now = Date.now();
  return {
    runId: "test",
    revision: REVISION,
    baseUrl: "https://restoreassist-sandbox.vercel.app",
    startedAt: new Date(now - 1_000).toISOString(),
    finishedAt: new Date(now).toISOString(),
    totalMs: 1_000,
    dailyBudgetUsd: 5,
    results,
    success: true,
  };
}

async function writeBaselineFixture(
  baselinePath: string,
  results: JobResult[],
): Promise<void> {
  const sourceReport = report(results);
  const sourceReportBytes = JSON.stringify(sourceReport, null, 2);
  await fs.writeFile(path.join(path.dirname(baselinePath), "source-report.json"), sourceReportBytes);
  await fs.writeFile(
    baselinePath,
    JSON.stringify({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      note: "reviewed test fixture",
      source: {
        runId: sourceReport.runId,
        revision: sourceReport.revision,
        baseUrl: sourceReport.baseUrl,
        startedAt: sourceReport.startedAt,
        finishedAt: sourceReport.finishedAt,
        reportSha256: createHash("sha256").update(sourceReportBytes).digest("hex"),
      },
      cells: results.map((result) => ({
        key: `${result.company.key}/${result.job.key}`,
        domain: result.job.domain,
        deterministic: result.graded?.deterministic?.composite ?? null,
        judge: result.graded?.judge?.composite ?? null,
        inspectionId: result.inspectionId ?? null,
        generationId: result.generationId ?? null,
        inputSha256: result.inputSha256 ?? null,
        outputSha256: result.outputSha256 ?? null,
        assessmentSha256: result.graded?.assessmentSha256 ?? null,
        adjusterRecommendation: result.graded?.adjuster?.recommendation ?? null,
        adjusterCriticalFindings: result.graded?.adjuster?.criticalFindings ?? null,
        adjusterCostReasonableness:
          result.graded?.adjuster?.costReasonableness ?? null,
      })),
    }),
  );
}

describe("baseline regression detector", () => {
  it("fails closed when the baseline file is missing", async () => {
    const r = report([jobResult("beyond-clean", "water-cat2", 80)]);
    const tmp = path.join(os.tmpdir(), "missing-baseline.json");
    const a = await analyseRegression({ report: r, baselinePath: tmp, requireExactPopulation: false });
    expect(a.baselineFound).toBe(false);
    expect(a.pass).toBe(false);
    expect(a.findings.some((finding) => finding.severity === "coverage")).toBe(true);
  });

  it("passes when scores are within tolerance", async () => {
    const r = report([jobResult("beyond-clean", "water-cat2", 78)]);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-pass-"));
    const baselinePath = path.join(tmpDir, "b.json");
    await writeBaselineFixture(baselinePath, [
      jobResult("beyond-clean", "water-cat2", 80),
    ]);
    const a = await analyseRegression({ report: r, baselinePath, requireExactPopulation: false });
    expect(a.baselineFound).toBe(true);
    expect(a.pass).toBe(true);
    expect(a.findings.filter((f) => f.severity === "hard")).toEqual([]);
  });

  it("hard-fails on a single-cell drop > tolerance", async () => {
    const r = report([jobResult("beyond-clean", "water-cat2", 60)]);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-hard-"));
    const baselinePath = path.join(tmpDir, "b.json");
    await writeBaselineFixture(baselinePath, [
      jobResult("beyond-clean", "water-cat2", 80),
    ]);
    const a = await analyseRegression({ report: r, baselinePath, requireExactPopulation: false });
    expect(a.pass).toBe(false);
    const hard = a.findings.filter((f) => f.severity === "hard");
    expect(hard.length).toBeGreaterThan(0);
    expect(hard[0].dimension).toBe("deterministic");
  });

  it("coverage-fails when a previously graded cell is now ungraded", async () => {
    const r = report([jobResult("beyond-clean", "water-cat2", null)]);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-cov-"));
    const baselinePath = path.join(tmpDir, "b.json");
    await writeBaselineFixture(baselinePath, [
      jobResult("beyond-clean", "water-cat2", 80),
    ]);
    const a = await analyseRegression({ report: r, baselinePath, requireExactPopulation: false });
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
    await writeBaselineFixture(baselinePath, [
      jobResult("beyond-clean", "water-cat2", 80),
      jobResult("elite-restoration", "water-cat2", 80),
    ]);
    const a = await analyseRegression({
      report: r,
      baselinePath,
      cellTolerance: 100, // disable hard fails
      meanTolerance: 4,
      requireExactPopulation: false,
    });
    expect(a.findings.some((f) => f.severity === "soft")).toBe(true);
    expect(a.pass).toBe(false);
  });

  it("fails closed for an empty baseline", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-empty-"));
    const baselinePath = path.join(tmpDir, "b.json");
    await fs.writeFile(
      baselinePath,
      JSON.stringify({
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        note: "reviewed empty fixture",
        source: {
          runId: "fixture-run",
          revision: REVISION,
          baseUrl: "https://restoreassist-sandbox.vercel.app",
          startedAt: new Date(Date.now() - 2_000).toISOString(),
          finishedAt: new Date(Date.now() - 1_000).toISOString(),
          reportSha256: "c".repeat(64),
        },
        cells: [],
      }),
    );
    const a = await analyseRegression({
      report: report([jobResult("beyond-clean", "water-cat2", 80)]),
      baselinePath,
      requireExactPopulation: false,
    });
    expect(a.baselineFound).toBe(false);
    expect(a.pass).toBe(false);
  });

  it("coverage-fails when a current cell is absent from the baseline", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-new-cell-"));
    const baselinePath = path.join(tmpDir, "b.json");
    await writeBaselineFixture(baselinePath, [
      jobResult("beyond-clean", "water-cat2", 80),
    ]);
    const a = await analyseRegression({
      report: report([
        jobResult("beyond-clean", "water-cat2", 80),
        jobResult("elite-restoration", "mould-cond3", 80),
      ]),
      baselinePath,
      requireExactPopulation: false,
    });
    expect(a.pass).toBe(false);
    expect(a.findings.some((f) => f.message.includes("absent from the baseline"))).toBe(true);
  });

  it("ignores cells in the baseline that are no longer in the run", async () => {
    const r = report([jobResult("beyond-clean", "water-cat2", 80)]);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-skip-"));
    const baselinePath = path.join(tmpDir, "b.json");
    await writeBaselineFixture(baselinePath, [
      jobResult("beyond-clean", "water-cat2", 80),
      jobResult("elite-restoration", "mould-cond3", 80),
    ]);
    const a = await analyseRegression({ report: r, baselinePath, requireExactPopulation: false });
    // The missing cell counts as a coverage finding.
    expect(a.findings.some((f) => f.severity === "coverage")).toBe(true);
  });

  it("promotes only the exact canonical population with unique executions", async () => {
    const results = SYNTHETIC_COMPANIES.flatMap((company) =>
      JOBS.map((job) => jobResult(company.key, job.key, 80)),
    );
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-promote-"));
    const baselinePath = path.join(tmpDir, "b.json");
    await expect(
      promoteToBaseline({ report: report(results), baselinePath, note: "reviewed full run" }),
    ).resolves.toMatchObject({ cells: expect.any(Array) });

    await expect(
      promoteToBaseline({
        report: report(results.slice(0, 1)),
        baselinePath,
        note: "partial run",
      }),
    ).rejects.toThrow(/exact company\/job population/);
  });

  it("refuses to promote production, stale, rejected, or zero-quality runs", async () => {
    const makeResults = () =>
      SYNTHETIC_COMPANIES.flatMap((company) =>
        JOBS.map((job) => jobResult(company.key, job.key, 80)),
      );
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-refuse-"));
    const baselinePath = path.join(tmpDir, "b.json");

    const production = report(makeResults());
    production.baseUrl = "https://restoreassist.app";
    await expect(
      promoteToBaseline({ report: production, baselinePath, note: "reviewed production run" }),
    ).rejects.toThrow(/invalid canary report/);

    const stale = report(makeResults());
    stale.startedAt = "2026-01-01T00:00:00.000Z";
    stale.finishedAt = "2026-01-01T00:01:00.000Z";
    await expect(
      promoteToBaseline({ report: stale, baselinePath, note: "reviewed stale run" }),
    ).rejects.toThrow(/invalid canary report/);

    const rejected = report(makeResults());
    rejected.results[0].graded!.adjuster!.recommendation = "escalate";
    await expect(
      promoteToBaseline({ report: rejected, baselinePath, note: "reviewed rejected run" }),
    ).rejects.toThrow(/invalid canary report/);

    const zero = report(makeResults());
    zero.results[0].graded!.deterministic = {
      composite: 0,
      structural: 0,
      citations: 0,
      equipment: 0,
      specificity: 0,
      category: 0,
    };
    await expect(
      promoteToBaseline({ report: zero, baselinePath, note: "reviewed zero score run" }),
    ).rejects.toThrow(/invalid canary report/);
  });

  it("treats stale or production-sourced baseline provenance as invalid", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-provenance-"));
    const baselinePath = path.join(tmpDir, "b.json");
    const current = jobResult("beyond-clean", "water-cat2", 80);
    await writeBaselineFixture(baselinePath, [current]);
    const stale = JSON.parse(await fs.readFile(baselinePath, "utf8"));
    stale.generatedAt = "2026-01-01T00:00:00.000Z";
    await fs.writeFile(baselinePath, JSON.stringify(stale));
    expect(
      (await analyseRegression({ report: report([current]), baselinePath, requireExactPopulation: false })).baselineFound,
    ).toBe(false);

    await writeBaselineFixture(baselinePath, [current]);
    const production = JSON.parse(await fs.readFile(baselinePath, "utf8"));
    production.source.baseUrl = "https://restoreassist.app";
    await fs.writeFile(baselinePath, JSON.stringify(production));
    expect(
      (await analyseRegression({ report: report([current]), baselinePath, requireExactPopulation: false })).baselineFound,
    ).toBe(false);

    await writeBaselineFixture(baselinePath, [current]);
    const rejected = JSON.parse(await fs.readFile(baselinePath, "utf8"));
    rejected.cells[0].adjusterRecommendation = "escalate";
    await fs.writeFile(baselinePath, JSON.stringify(rejected));
    expect(
      (await analyseRegression({ report: report([current]), baselinePath, requireExactPopulation: false })).baselineFound,
    ).toBe(false);
  });

  it("rejects a baseline when the retained source-report bytes change", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baseline-source-bytes-"));
    const baselinePath = path.join(tmpDir, "b.json");
    const current = jobResult("beyond-clean", "water-cat2", 80);
    await writeBaselineFixture(baselinePath, [current]);
    const sourcePath = path.join(tmpDir, "source-report.json");
    await fs.appendFile(sourcePath, "\n");
    const analysis = await analyseRegression({
      report: report([current]),
      baselinePath,
      requireExactPopulation: false,
    });
    expect(analysis.baselineFound).toBe(false);
    expect(analysis.pass).toBe(false);
  });
});
