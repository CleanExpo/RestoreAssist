import { describe, expect, it } from "vitest";
import type { RegressionAnalysis } from "../runner/baseline.js";
import type { RunReport } from "../runner/orchestrator.js";
import { evaluateReleaseGate } from "../runner/release-gate.js";
import { SYNTHETIC_COMPANIES } from "../companies/fixtures.js";
import { JOBS } from "../jobs/index.js";
import { sha256Json } from "../runner/evidence.js";
import type { GenerateAssessmentOutput } from "../client/api-client.js";

const REVISION = "a".repeat(40);

function generatedAssessment(
  generationId: string,
  domain: string,
  workspaceId: string,
): GenerateAssessmentOutput {
  return {
    assessmentGenerationId: generationId,
    report: { sections: [] },
    scope: { items: [] },
    estimate: {
      lines: [],
      totals: { subtotalExGst: 0, gstTotal: 0, totalIncGst: 0 },
    },
    citations: [],
    meta: {
      domain,
      generatedAt: new Date().toISOString(),
      modelUsed: "test",
      latencyMs: 1,
      costEstimateUsd: 0,
      workspaceId,
    },
  } as unknown as GenerateAssessmentOutput;
}

function regression(overrides: Partial<RegressionAnalysis> = {}): RegressionAnalysis {
  return {
    baselineFound: true,
    cellTolerance: 8,
    meanTolerance: 4,
    meanBefore: 80,
    meanAfter: 80,
    findings: [],
    pass: true,
    ...overrides,
  };
}

function report(fullyGraded: boolean): RunReport {
  const now = Date.now();
  return {
    runId: "test",
    revision: REVISION,
    baseUrl: "https://restoreassist-sandbox.vercel.app",
    startedAt: new Date(now - 60_000).toISOString(),
    finishedAt: new Date(now).toISOString(),
    totalMs: 60_000,
    dailyBudgetUsd: 5,
    success: true,
    results: SYNTHETIC_COMPANIES.flatMap((company) =>
      JOBS.map((job) => {
        const identity = `${company.key}-${job.key}`;
        const inspectionId = `inspection-${identity}`;
        const generationId = `generation-${identity}`;
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
        inspectionId,
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
        durationMs: 1,
        graded: {
          inspectionId,
          generationId,
          assessmentSha256: outputSha256,
          domain: job.domain,
          modelUsed: "test",
          latencyMs: 1,
          costEstimateUsd: 0,
          fullyGraded,
          deterministic: fullyGraded
            ? { composite: 80, structural: 80, citations: 80, equipment: 80, specificity: 80, category: 80 }
            : null,
          adjuster: fullyGraded
            ? {
                recommendation: "approve", findingCount: 0, criticalFindings: 0,
                costReasonableness: "within-range", inspectionId, generationId,
                assessmentSha256: outputSha256, costUsd: 0, failedAttemptCostUsd: 0,
                raw: {
                  inspectionId, assessmentGenerationId: generationId,
                  assessmentSha256: outputSha256, recommendation: "approve",
                  findings: [], costReasonableness: "within-range",
                  costUsd: 0, failedAttemptCostUsd: 0,
                },
              }
            : null,
          judge: fullyGraded
            ? { composite: 80, professionalism: 8, specificity: 8, consistency: 8, actionability: 8, rationale: "Evidence is complete.", modelUsed: "test", costUsd: 0, latencyMs: 1 }
            : null,
        } as RunReport["results"][number]["graded"],
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
          reconciledAt: new Date(now).toISOString(),
        },
        };
      }),
    ),
  };
}

describe("pilot release evidence gate", () => {
  it("passes only a fully graded run with a passing baseline", () => {
    expect(evaluateReleaseGate(report(true), regression()).pass).toBe(true);
  });

  it("rejects missing grading layers", () => {
    const result = evaluateReleaseGate(report(false), regression());
    expect(result.pass).toBe(false);
    expect(result.reasons.join("\n")).toMatch(/not fully graded/);
  });

  it("rejects a fullyGraded boolean when score evidence is absent", () => {
    const invalid = report(true);
    invalid.results[0].graded = {
      fullyGraded: true,
      deterministic: null,
      adjuster: null,
      judge: null,
    } as RunReport["results"][number]["graded"];
    expect(evaluateReleaseGate(invalid, regression()).pass).toBe(false);
  });

  it("rejects non-finite score evidence", () => {
    const invalid = report(true);
    invalid.results[0].graded!.deterministic!.composite = Number.NaN;
    expect(evaluateReleaseGate(invalid, regression()).pass).toBe(false);
  });

  it("rejects a success summary when a result carries an error", () => {
    const invalid = report(true);
    invalid.results[0].error = "upload failed";
    expect(evaluateReleaseGate(invalid, regression()).pass).toBe(false);
  });

  it("rejects incomplete nested grading evidence", () => {
    const invalid = report(true);
    invalid.results[0].graded!.adjuster = {
      recommendation: "approve",
    } as NonNullable<RunReport["results"][number]["graded"]>["adjuster"];
    expect(evaluateReleaseGate(invalid, regression()).pass).toBe(false);
  });

  it("rejects grading evidence belonging to another assessment", () => {
    const invalid = report(true);
    invalid.results[0].graded!.inspectionId = "inspection-other";
    invalid.results[0].graded!.generationId = "generation-other";
    invalid.results[0].graded!.domain = "FIRE_SMOKE";
    expect(evaluateReleaseGate(invalid, regression()).pass).toBe(false);
  });

  it("rejects a partial or duplicate company/job population", () => {
    const partial = report(true);
    partial.results = partial.results.slice(0, 1);
    expect(evaluateReleaseGate(partial, regression()).pass).toBe(false);

    const duplicate = report(true);
    duplicate.results[1] = duplicate.results[0];
    expect(evaluateReleaseGate(duplicate, regression()).pass).toBe(false);
  });

  it("rejects reused inspection and generation identities", () => {
    const invalid = report(true);
    for (const result of invalid.results) {
      result.inspectionId = "one-inspection";
      result.generationId = "one-generation";
      result.graded!.inspectionId = "one-inspection";
      result.graded!.generationId = "one-generation";
    }
    expect(evaluateReleaseGate(invalid, regression()).pass).toBe(false);
  });

  it("rejects reused workspace identities and incomplete image input evidence", () => {
    const invalid = report(true);
    const reusedWorkspace = invalid.results[0].workspaceId!;
    const target = invalid.results.find(
      (result) => result.company.key !== invalid.results[0].company.key,
    )!;
    target.workspaceId = reusedWorkspace;
    target.generatedAssessment!.meta.workspaceId = reusedWorkspace;
    target.inputSha256 = sha256Json({
      company: target.company,
      job: target.job,
      pilotEmail: target.pilotEmail,
      workspaceId: target.workspaceId,
      images: target.imageEvidence,
    });
    target.imageEvidence = [];
    expect(evaluateReleaseGate(invalid, regression()).pass).toBe(false);
  });

  it("rejects a persisted photo receipt reused across different jobs", () => {
    const invalid = report(true);
    const withImages = invalid.results.filter((result) => (result.imageEvidence?.length ?? 0) > 0);
    withImages[1].imageEvidence![0].photoId = withImages[0].imageEvidence![0].photoId;
    withImages[1].inputSha256 = sha256Json({
      company: withImages[1].company,
      job: withImages[1].job,
      pilotEmail: withImages[1].pilotEmail,
      workspaceId: withImages[1].workspaceId,
      images: withImages[1].imageEvidence,
    });
    expect(evaluateReleaseGate(invalid, regression()).pass).toBe(false);
  });

  it("rejects altered fixture content behind canonical keys", () => {
    const invalid = report(true);
    invalid.results[0].company = {
      ...invalid.results[0].company,
      defaultAddress: "Attacker-controlled address",
    };
    invalid.results[0].job = {
      ...invalid.results[0].job,
      photoCount: 0,
    };
    expect(evaluateReleaseGate(invalid, regression()).pass).toBe(false);
  });

  it("rejects mutation of the exported fixture objects themselves", () => {
    const original = SYNTHETIC_COMPANIES[0].defaultAddress;
    try {
      (SYNTHETIC_COMPANIES[0] as { defaultAddress: string }).defaultAddress =
        "Mutated canonical alias";
      expect(evaluateReleaseGate(report(true), regression()).pass).toBe(false);
    } finally {
      (SYNTHETIC_COMPANIES[0] as { defaultAddress: string }).defaultAddress = original;
    }
  });

  it.each([
    ["critical finding", { criticalFindings: 1, findingCount: 1 }],
    ["rejection", { recommendation: "escalate" }],
    ["high cost", { costReasonableness: "high" }],
  ])("rejects adjuster %s", (_name, override) => {
    const invalid = report(true);
    Object.assign(invalid.results[0].graded!.adjuster!, override);
    expect(evaluateReleaseGate(invalid, regression()).pass).toBe(false);
  });

  it("rejects a deterministic composite that contradicts its weighted dimensions", () => {
    const invalid = report(true);
    invalid.results[0].graded!.deterministic = {
      composite: 80,
      structural: 100,
      citations: 100,
      equipment: 0,
      specificity: 0,
      category: 0,
    };
    expect(evaluateReleaseGate(invalid, regression()).pass).toBe(false);
  });

  it("rejects generated assessment content changed after grading", () => {
    const invalid = report(true);
    invalid.results[0].generatedAssessment!.meta.modelUsed = "substituted-model";
    expect(evaluateReleaseGate(invalid, regression()).pass).toBe(false);
  });

  it("rejects a generated assessment outside the measured run", () => {
    const invalid = report(true);
    invalid.results[0].generatedAssessment!.meta.generatedAt = "2020-01-01T00:00:00.000Z";
    invalid.results[0].outputSha256 = sha256Json(invalid.results[0].generatedAssessment);
    invalid.results[0].graded!.assessmentSha256 = invalid.results[0].outputSha256;
    invalid.results[0].graded!.adjuster!.assessmentSha256 = invalid.results[0].outputSha256;
    (invalid.results[0].graded!.adjuster!.raw as Record<string, unknown>).assessmentSha256 = invalid.results[0].outputSha256;
    expect(evaluateReleaseGate(invalid, regression()).pass).toBe(false);
  });

  it("rejects adjuster raw evidence from another assessment", () => {
    const invalid = report(true);
    (invalid.results[0].graded!.adjuster!.raw as Record<string, unknown>).assessmentGenerationId = "other";
    expect(evaluateReleaseGate(invalid, regression()).pass).toBe(false);
  });

  it("rejects missing or overspent budget reservation evidence", () => {
    const missing = report(true);
    delete missing.results[0].budgetEvidence;
    expect(evaluateReleaseGate(missing, regression()).pass).toBe(false);

    const overspent = report(true);
    overspent.results[0].budgetEvidence!.reconciledSpentUsd = 5.01;
    expect(evaluateReleaseGate(overspent, regression()).pass).toBe(false);
  });

  it("rejects production, stale, unbound, and over-budget reports", () => {
    const production = report(true);
    production.baseUrl = "https://restoreassist.app";
    expect(evaluateReleaseGate(production, regression()).pass).toBe(false);

    const stale = report(true);
    stale.startedAt = "2026-01-01T00:00:00.000Z";
    stale.finishedAt = "2026-01-01T00:01:00.000Z";
    expect(evaluateReleaseGate(stale, regression()).pass).toBe(false);

    const unbound = report(true);
    unbound.revision = "main";
    expect(evaluateReleaseGate(unbound, regression()).pass).toBe(false);

    const overBudget = report(true);
    overBudget.dailyBudgetUsd = 5.01;
    expect(evaluateReleaseGate(overBudget, regression()).pass).toBe(false);
  });

  it("rejects a judge composite that contradicts its dimensions", () => {
    const invalid = report(true);
    invalid.results[0].graded!.judge!.composite = 100;
    expect(evaluateReleaseGate(invalid, regression()).pass).toBe(false);
  });

  it("rejects a missing baseline", () => {
    const result = evaluateReleaseGate(
      report(true),
      regression({ baselineFound: false, pass: false }),
    );
    expect(result.pass).toBe(false);
    expect(result.reasons.join("\n")).toMatch(/baseline is missing/);
  });

  it("rejects an empty run", () => {
    const empty = report(true);
    empty.results = [];
    expect(evaluateReleaseGate(empty, regression()).pass).toBe(false);
  });
});
