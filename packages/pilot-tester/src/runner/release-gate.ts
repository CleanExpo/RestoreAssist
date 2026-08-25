import type { RegressionAnalysis } from "./baseline.js";
import type { JobResult, RunReport } from "./orchestrator.js";
import { SYNTHETIC_COMPANIES } from "../companies/fixtures.js";
import { JOBS } from "../jobs/index.js";
import { assertSandbox } from "../client/safety.js";
import { sha256Json, stableJson } from "./evidence.js";

export interface ReleaseGateResult {
  pass: boolean;
  reasons: string[];
}

const CANONICAL_FIXTURE_JSON = new Map(
  SYNTHETIC_COMPANIES.flatMap((company) =>
    JOBS.map((job) => [
      `${company.key}/${job.key}`,
      { company: stableJson(company), job: stableJson(job) },
    ] as const),
  ),
);

const MAX_DAILY_BUDGET_USD = 5;
const MINIMUM_QUALITY_SCORE = 70;
const MAX_REPORT_AGE_MS = 30 * 60 * 1000;
const CANONICAL_SANDBOX_URL = "https://restoreassist-sandbox.vercel.app";

/**
 * Bind a release-evidence report to the canonical 5×7 fixture grid and to
 * distinct runtime executions. A matching key alone is not evidence that the
 * canonical company/job input was used, and a repeated identifier can make one
 * execution look like an entire matrix.
 */
export function validateRunPopulation(report: RunReport): string[] {
  const reasons: string[] = [];
  // These strings were captured at module initialisation. Keeping references
  // to the exported fixture objects would let a caller mutate both the
  // observed and "canonical" values and make an alteration self-approve.
  const expected = CANONICAL_FIXTURE_JSON;
  const observedKeys = report.results.map(
    (result) => `${result.company.key}/${result.job.key}`,
  );
  const observedKeySet = new Set(observedKeys);
  if (
    observedKeys.length !== expected.size ||
    observedKeySet.size !== observedKeys.length ||
    [...expected.keys()].some((key) => !observedKeySet.has(key))
  ) {
    reasons.push("pilot run does not contain the exact company/job population");
  }

  const alteredFixtures = report.results.filter((result) => {
    const canonical = expected.get(`${result.company.key}/${result.job.key}`);
    return (
      canonical === undefined ||
      stableJson(result.company) !== canonical.company ||
      stableJson(result.job) !== canonical.job
    );
  });
  if (alteredFixtures.length > 0) {
    reasons.push(`${alteredFixtures.length} pilot job(s) do not match canonical fixtures`);
  }

  const companyIdentities = new Map<string, { email: string; workspaceId: string }>();
  const photoIds = new Set<string>();
  let invalidIdentityOrImages = 0;
  for (const result of report.results) {
    const expectedEmail = `pilot-${result.company.key}@restoreassist.sandbox`;
    const images = result.imageEvidence;
    if (
      result.pilotEmail !== expectedEmail ||
      typeof result.workspaceId !== "string" ||
      result.workspaceId.length < 6 ||
      !Array.isArray(images) ||
      images.length !== result.job.photoCount ||
      new Set(images.map((image) => image.cacheKey)).size !== images.length ||
      images.some(
        (image) =>
          !/^[0-9a-f]{40}$/i.test(image.cacheKey) ||
          !/^[0-9a-f]{64}$/i.test(image.contentSha256) ||
          typeof image.photoId !== "string" ||
          image.photoId.length === 0 ||
          photoIds.has(image.photoId),
      )
    ) {
      invalidIdentityOrImages++;
      continue;
    }
    for (const image of images) photoIds.add(image.photoId);
    const prior = companyIdentities.get(result.company.key);
    if (
      prior &&
      (prior.email !== result.pilotEmail || prior.workspaceId !== result.workspaceId)
    ) {
      invalidIdentityOrImages++;
    } else {
      companyIdentities.set(result.company.key, {
        email: result.pilotEmail,
        workspaceId: result.workspaceId,
      });
    }
  }
  if (
    invalidIdentityOrImages > 0 ||
    companyIdentities.size !== SYNTHETIC_COMPANIES.length ||
    new Set([...companyIdentities.values()].map((identity) => identity.workspaceId)).size !==
      SYNTHETIC_COMPANIES.length
  ) {
    reasons.push("pilot results do not carry exact, unique sandbox identities and image inputs");
  }

  const inspectionIds = report.results.map((result) => result.inspectionId);
  const generationIds = report.results.map((result) => result.generationId);
  if (
    inspectionIds.some((id) => typeof id !== "string" || id.length === 0) ||
    new Set(inspectionIds).size !== inspectionIds.length
  ) {
    reasons.push("pilot run inspection identifiers are absent or reused");
  }
  if (
    generationIds.some((id) => typeof id !== "string" || id.length === 0) ||
    new Set(generationIds).size !== generationIds.length
  ) {
    reasons.push("pilot run generation identifiers are absent or reused");
  }
  return reasons;
}

const score = (value: unknown, maximum = 100) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum;

function adjusterRawMatches(result: JobResult): boolean {
  const adjuster = result.graded?.adjuster;
  const raw = adjuster?.raw;
  if (!adjuster || typeof raw !== "object" || raw === null || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  const findings = Array.isArray(record.findings) ? record.findings : null;
  const critical = findings?.filter(
    (finding) =>
      typeof finding === "object" &&
      finding !== null &&
      (finding as Record<string, unknown>).severity === "critical",
  ).length;
  return (
    record.inspectionId === result.inspectionId &&
    record.assessmentGenerationId === result.generationId &&
    record.assessmentSha256 === result.outputSha256 &&
    record.recommendation === adjuster.recommendation &&
    record.costReasonableness === adjuster.costReasonableness &&
    record.costUsd === adjuster.costUsd &&
    record.failedAttemptCostUsd === adjuster.failedAttemptCostUsd &&
    findings !== null &&
    findings.length === adjuster.findingCount &&
    critical === adjuster.criticalFindings
  );
}

export function hasCompleteGrading(result: JobResult): boolean {
  const graded = result.graded;
  const deterministicComposite = graded?.deterministic
    ? Math.round(
        0.3 * graded.deterministic.structural +
          0.25 * graded.deterministic.citations +
          0.2 * graded.deterministic.equipment +
          0.15 * graded.deterministic.specificity +
          0.1 * graded.deterministic.category,
      )
    : null;
  return !(
    typeof result.error === "string" && result.error.trim().length > 0
  ) && (
    graded?.fullyGraded === true &&
    typeof result.inspectionId === "string" &&
    result.inspectionId.length > 0 &&
    graded.inspectionId === result.inspectionId &&
    typeof result.generationId === "string" &&
    result.generationId.length > 0 &&
    graded.generationId === result.generationId &&
    typeof result.inputSha256 === "string" &&
    result.inputSha256 ===
      sha256Json({
        company: result.company,
        job: result.job,
        pilotEmail: result.pilotEmail,
        workspaceId: result.workspaceId,
        images: result.imageEvidence,
      }) &&
    result.generatedAssessment !== undefined &&
    typeof result.outputSha256 === "string" &&
    result.outputSha256 === sha256Json(result.generatedAssessment) &&
    graded.assessmentSha256 === result.outputSha256 &&
    result.generatedAssessment.assessmentGenerationId === result.generationId &&
    result.generatedAssessment.meta.domain === result.job.domain &&
    result.generatedAssessment.meta.workspaceId === result.workspaceId &&
    graded.domain === result.job.domain &&
    typeof graded.modelUsed === "string" &&
    graded.modelUsed.trim().length > 0 &&
    score(graded.latencyMs, Number.MAX_SAFE_INTEGER) &&
    graded.deterministic !== null &&
    score(graded.deterministic.composite) &&
    score(graded.deterministic.structural) &&
    score(graded.deterministic.citations) &&
    score(graded.deterministic.equipment) &&
    score(graded.deterministic.specificity) &&
    score(graded.deterministic.category) &&
    graded.deterministic.composite === deterministicComposite &&
    graded.deterministic.composite >= MINIMUM_QUALITY_SCORE &&
    graded.adjuster !== null &&
    graded.adjuster.recommendation === "approve" &&
    Number.isInteger(graded.adjuster.findingCount) &&
    graded.adjuster.findingCount >= 0 &&
    Number.isInteger(graded.adjuster.criticalFindings) &&
    graded.adjuster.criticalFindings >= 0 &&
    graded.adjuster.criticalFindings <= graded.adjuster.findingCount &&
    graded.adjuster.criticalFindings === 0 &&
    graded.adjuster.costReasonableness === "within-range" &&
    graded.adjuster.inspectionId === result.inspectionId &&
    graded.adjuster.generationId === result.generationId &&
    graded.adjuster.assessmentSha256 === result.outputSha256 &&
    score(graded.adjuster.costUsd, Number.MAX_SAFE_INTEGER) &&
    score(graded.adjuster.failedAttemptCostUsd, Number.MAX_SAFE_INTEGER) &&
    adjusterRawMatches(result) &&
    graded.judge !== null &&
    score(graded.judge.composite) &&
    graded.judge.composite >= MINIMUM_QUALITY_SCORE &&
    score(graded.judge.professionalism, 10) &&
    score(graded.judge.specificity, 10) &&
    score(graded.judge.consistency, 10) &&
    score(graded.judge.actionability, 10) &&
    typeof graded.judge.rationale === "string" &&
    graded.judge.rationale.trim().length > 0 &&
    typeof graded.judge.modelUsed === "string" &&
    graded.judge.modelUsed.trim().length > 0 &&
    score(graded.judge.latencyMs, Number.MAX_SAFE_INTEGER) &&
    score(graded.costEstimateUsd, Number.MAX_SAFE_INTEGER) &&
    score(graded.judge.costUsd, Number.MAX_SAFE_INTEGER)
    && Math.abs(
      graded.judge.composite -
        ((graded.judge.professionalism +
          graded.judge.specificity +
          graded.judge.consistency +
          graded.judge.actionability) /
          4) *
          10,
    ) < 0.001
  );
}

export function validateAssessmentTimeline(report: RunReport): string[] {
  const startedAt = Date.parse(report.startedAt);
  const finishedAt = Date.parse(report.finishedAt);
  const stale = report.results.filter((result) => {
    const generatedAt = Date.parse(result.generatedAssessment?.meta.generatedAt ?? "");
    return (
      Number.isNaN(generatedAt) ||
      Number.isNaN(startedAt) ||
      Number.isNaN(finishedAt) ||
      generatedAt < startedAt - 60_000 ||
      generatedAt > finishedAt + 60_000
    );
  });
  return stale.length > 0
    ? [`${stale.length} generated assessment(s) are stale or outside the run`]
    : [];
}

export function validateBudgetEvidence(report: RunReport): string[] {
  const reasons: string[] = [];
  const reservationIds = new Set<string>();
  const startedAt = Date.parse(report.startedAt);
  const finishedAt = Date.parse(report.finishedAt);
  for (const result of report.results) {
    const budget = result.budgetEvidence;
    const reconciledAt = Date.parse(budget?.reconciledAt ?? "");
    if (
      !budget ||
      typeof budget.reservationId !== "string" ||
      budget.reservationId.length === 0 ||
      reservationIds.has(budget.reservationId) ||
      budget.workspaceId !== result.workspaceId ||
      budget.ceilingUsd !== report.dailyBudgetUsd ||
      !score(budget.startingSpentUsd, Number.MAX_SAFE_INTEGER) ||
      !score(budget.reservedUsd, Number.MAX_SAFE_INTEGER) ||
      budget.reservedUsd <= 0 ||
      budget.startingSpentUsd + budget.reservedUsd > report.dailyBudgetUsd ||
      !score(budget.generationCostUsd, Number.MAX_SAFE_INTEGER) ||
      !score(budget.judgeCostUsd, Number.MAX_SAFE_INTEGER) ||
      !score(budget.adjusterCostUsd, Number.MAX_SAFE_INTEGER) ||
      !score(budget.failedAttemptCostUsd, Number.MAX_SAFE_INTEGER) ||
      !score(budget.totalActualCostUsd, Number.MAX_SAFE_INTEGER) ||
      Math.abs(
        budget.totalActualCostUsd -
          (budget.generationCostUsd +
            budget.judgeCostUsd +
            budget.adjusterCostUsd +
            budget.failedAttemptCostUsd),
      ) > 1e-9 ||
      budget.totalActualCostUsd > budget.reservedUsd ||
      Math.abs(budget.generationCostUsd - (result.graded?.costEstimateUsd ?? -1)) > 1e-9 ||
      Math.abs(budget.judgeCostUsd - (result.graded?.judge?.costUsd ?? -1)) > 1e-9 ||
      Math.abs(budget.adjusterCostUsd - (result.graded?.adjuster?.costUsd ?? -1)) > 1e-9 ||
      budget.failedAttemptCostUsd < (result.graded?.adjuster?.failedAttemptCostUsd ?? 0) ||
      !score(budget.reconciledSpentUsd, Number.MAX_SAFE_INTEGER) ||
      budget.reconciledSpentUsd + 1e-9 < budget.startingSpentUsd + budget.totalActualCostUsd ||
      budget.reconciledSpentUsd > report.dailyBudgetUsd ||
      !Number.isFinite(reconciledAt) ||
      !Number.isFinite(startedAt) ||
      !Number.isFinite(finishedAt) ||
      reconciledAt < startedAt - 60_000 ||
      reconciledAt > finishedAt + 60_000
    ) {
      reasons.push(`${result.company.key}/${result.job.key} lacks a complete budget reservation receipt`);
    } else {
      reservationIds.add(budget.reservationId);
    }
  }
  return reasons;
}

/**
 * A pilot run is release evidence only when every job ran and all three
 * grading layers produced evidence against a committed regression baseline.
 */
export function evaluateReleaseGate(
  report: RunReport,
  regression: RegressionAnalysis,
): ReleaseGateResult {
  const reasons: string[] = [];
  try {
    assertSandbox({
      baseUrl: report.baseUrl,
      allowedBaseUrls: [CANONICAL_SANDBOX_URL],
    });
  } catch {
    reasons.push("pilot report source is not an approved sandbox origin");
  }
  if (!/^[0-9a-f]{40}$/i.test(report.revision)) {
    reasons.push("pilot report is not bound to an exact source revision");
  }
  const startedAt = Date.parse(report.startedAt);
  const finishedAt = Date.parse(report.finishedAt);
  const now = Date.now();
  if (
    Number.isNaN(startedAt) ||
    Number.isNaN(finishedAt) ||
    startedAt > finishedAt ||
    finishedAt > now + 60_000 ||
    now - finishedAt > MAX_REPORT_AGE_MS ||
    Math.abs(report.totalMs - (finishedAt - startedAt)) > 5_000
  ) {
    reasons.push("pilot report timestamps are stale, future-dated, or inconsistent");
  }
  reasons.push(...validateAssessmentTimeline(report));
  if (
    typeof report.dailyBudgetUsd !== "number" ||
    !Number.isFinite(report.dailyBudgetUsd) ||
    report.dailyBudgetUsd <= 0 ||
    report.dailyBudgetUsd > MAX_DAILY_BUDGET_USD
  ) {
    reasons.push("pilot report does not carry the executable $5 daily budget ceiling");
  }
  if (!report.success) reasons.push("one or more pilot jobs failed");
  if (report.results.length === 0) reasons.push("pilot run produced no job results");
  reasons.push(...validateRunPopulation(report));
  const errored = report.results.filter(
    (result) => typeof result.error === "string" && result.error.trim().length > 0,
  );
  if (errored.length > 0) reasons.push(`${errored.length} pilot job(s) carry an error`);

  const incomplete = report.results.filter((result) => !hasCompleteGrading(result));
  if (incomplete.length > 0) {
    reasons.push(`${incomplete.length} pilot job(s) were not fully graded`);
  }
  reasons.push(...validateBudgetEvidence(report));
  if (!regression.baselineFound) reasons.push("regression baseline is missing or invalid");
  if (!regression.pass) reasons.push("regression analysis failed");

  return { pass: reasons.length === 0, reasons };
}
