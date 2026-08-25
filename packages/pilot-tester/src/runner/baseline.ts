/**
 * Baseline-regression detector.
 *
 * The nightly canary gives us a 5×7 = 35-cell grid of scores per
 * run. A single bad model patch shows up as a small bump in the
 * mean and a large bump in the worst-case cell. We surface both.
 *
 * The baseline file (`pilot-tester/baselines/<env>.json`) is
 * checked in. Operator updates it intentionally when scores
 * legitimately move (e.g. after a prompt improvement). Drift
 * outside the configured tolerance triggers a regression.
 *
 * Rules:
 *   - Hard fail: any (company, job, domain) cell drops by more
 *     than `cellTolerance` points (default 8) on either det or
 *     judge composite.
 *   - Soft fail: mean across all cells drops by more than
 *     `meanTolerance` (default 4).
 *   - Coverage fail: a cell that was previously graded is now
 *     un-graded (suggests an outage on adjuster / judge / DB).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { JobResult, RunReport } from "./orchestrator.js";
import {
  hasCompleteGrading,
  validateAssessmentTimeline,
  validateBudgetEvidence,
  validateRunPopulation,
} from "./release-gate.js";
import { assertSandbox } from "../client/safety.js";
import { SYNTHETIC_COMPANIES } from "../companies/fixtures.js";
import { JOBS } from "../jobs/index.js";

export const BASELINE_SCHEMA_VERSION = 2;
export const BASELINE_MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
export const SOURCE_RUN_MAX_AGE_AT_PROMOTION_MS = 24 * 60 * 60 * 1000;
export const MINIMUM_BASELINE_SCORE = 70;
const CANONICAL_SANDBOX_URL = "https://restoreassist-sandbox.vercel.app";

export interface BaselineCell {
  /** Composite key: `${companyKey}/${jobKey}` */
  key: string;
  domain: string;
  deterministic: number | null;
  judge: number | null;
  inspectionId: string | null;
  generationId: string | null;
  inputSha256: string | null;
  outputSha256: string | null;
  assessmentSha256: string | null;
  adjusterRecommendation: string | null;
  adjusterCriticalFindings: number | null;
  adjusterCostReasonableness: string | null;
}

export interface Baseline {
  schemaVersion: typeof BASELINE_SCHEMA_VERSION;
  generatedAt: string;
  /** Free-form note from the operator who created the baseline. */
  note: string;
  source: {
    runId: string;
    revision: string;
    baseUrl: string;
    startedAt: string;
    finishedAt: string;
    reportSha256: string;
  };
  cells: BaselineCell[];
}

export interface RegressionFinding {
  severity: "hard" | "soft" | "coverage";
  cellKey: string | null;
  dimension: "deterministic" | "judge" | "mean" | "coverage";
  before: number | null;
  after: number | null;
  delta: number | null;
  message: string;
}

export interface RegressionAnalysis {
  baselineFound: boolean;
  cellTolerance: number;
  meanTolerance: number;
  meanBefore: number | null;
  meanAfter: number | null;
  findings: RegressionFinding[];
  pass: boolean;
}

export interface AnalyseOptions {
  report: RunReport;
  baselinePath: string;
  cellTolerance?: number;
  meanTolerance?: number;
  baselineSourceReportPath?: string;
  requireExactPopulation?: boolean;
}

export async function analyseRegression(
  opts: AnalyseOptions,
): Promise<RegressionAnalysis> {
  const cellTolerance = opts.cellTolerance ?? 8;
  const meanTolerance = opts.meanTolerance ?? 4;
  const findings: RegressionFinding[] = [];

  let baseline: Baseline | null = null;
  try {
    const raw = await fs.readFile(opts.baselinePath, "utf8");
    baseline = JSON.parse(raw) as Baseline;
    const sourceReportPath =
      opts.baselineSourceReportPath ?? path.join(path.dirname(opts.baselinePath), "source-report.json");
    const sourceReportBytes = await fs.readFile(sourceReportPath, "utf8");
    validateBaseline(baseline, {
      requireExactPopulation: opts.requireExactPopulation ?? true,
      sourceReportBytes,
    });
  } catch {
    return {
      baselineFound: false,
      cellTolerance,
      meanTolerance,
      meanBefore: null,
      meanAfter: meanCompositeFromResults(opts.report.results),
      findings: [
        {
          severity: "coverage",
          cellKey: null,
          dimension: "coverage",
          before: null,
          after: null,
          delta: null,
          message: "Required regression baseline is missing or invalid",
        },
      ],
      pass: false,
    };
  }

  const baselineByKey = new Map(baseline.cells.map((c) => [c.key, c]));
  const currentCells = opts.report.results.map((r) => resultToCell(r));

  for (const cell of currentCells) {
    const before = baselineByKey.get(cell.key);
    if (!before) {
      findings.push({
        severity: "coverage",
        cellKey: cell.key,
        dimension: "coverage",
        before: null,
        after: 1,
        delta: null,
        message: `Cell ${cell.key} is present in the current run but absent from the baseline`,
      });
      continue;
    }
    pushDimensionFinding(
      findings,
      "deterministic",
      cell,
      before,
      cellTolerance,
    );
    pushDimensionFinding(findings, "judge", cell, before, cellTolerance);
  }

  // Coverage fail: previously graded, now un-graded.
  for (const before of baseline.cells) {
    const cur = currentCells.find((c) => c.key === before.key);
    if (!cur) {
      findings.push({
        severity: "coverage",
        cellKey: before.key,
        dimension: "coverage",
        before: 1,
        after: 0,
        delta: -1,
        message: `Cell ${before.key} present in baseline but missing from current run`,
      });
      continue;
    }
    if (before.deterministic !== null && cur.deterministic === null) {
      findings.push({
        severity: "coverage",
        cellKey: before.key,
        dimension: "deterministic",
        before: before.deterministic,
        after: null,
        delta: null,
        message: `Cell ${before.key} lost deterministic score`,
      });
    }
    if (before.judge !== null && cur.judge === null) {
      findings.push({
        severity: "coverage",
        cellKey: before.key,
        dimension: "judge",
        before: before.judge,
        after: null,
        delta: null,
        message: `Cell ${before.key} lost judge score`,
      });
    }
  }

  // Soft fail: aggregate mean drop across the deterministic dimension.
  const meanAfter = meanCompositeFromResults(opts.report.results);
  const meanBefore = meanFromBaseline(baseline);
  if (
    meanAfter !== null &&
    meanBefore !== null &&
    meanBefore - meanAfter > meanTolerance
  ) {
    findings.push({
      severity: "soft",
      cellKey: null,
      dimension: "mean",
      before: meanBefore,
      after: meanAfter,
      delta: meanAfter - meanBefore,
      message: `Mean deterministic composite dropped by ${(meanBefore - meanAfter).toFixed(1)} (>${meanTolerance})`,
    });
  }

  return {
    baselineFound: true,
    cellTolerance,
    meanTolerance,
    meanBefore,
    meanAfter,
    findings,
    pass: findings.length === 0,
  };
}

function pushDimensionFinding(
  findings: RegressionFinding[],
  dim: "deterministic" | "judge",
  cur: BaselineCell,
  before: BaselineCell,
  cellTolerance: number,
): void {
  const a = cur[dim];
  const b = before[dim];
  if (a === null || b === null) return;
  const delta = a - b;
  if (delta < -cellTolerance) {
    findings.push({
      severity: "hard",
      cellKey: cur.key,
      dimension: dim,
      before: b,
      after: a,
      delta,
      message: `${cur.key} ${dim} dropped ${(-delta).toFixed(1)} points (${b.toFixed(0)} → ${a.toFixed(0)})`,
    });
  }
}

function resultToCell(r: JobResult): BaselineCell {
  return {
    key: `${r.company.key}/${r.job.key}`,
    domain: r.job.domain,
    deterministic: finiteScoreOrNull(r.graded?.deterministic?.composite),
    judge: finiteScoreOrNull(r.graded?.judge?.composite),
    inspectionId: r.inspectionId ?? null,
    generationId: r.generationId ?? null,
    inputSha256: r.inputSha256 ?? null,
    outputSha256: r.outputSha256 ?? null,
    assessmentSha256: r.graded?.assessmentSha256 ?? null,
    adjusterRecommendation: r.graded?.adjuster?.recommendation ?? null,
    adjusterCriticalFindings: r.graded?.adjuster?.criticalFindings ?? null,
    adjusterCostReasonableness: r.graded?.adjuster?.costReasonableness ?? null,
  };
}

function finiteScoreOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

function validBaselineScore(value: unknown): value is number {
  const parsed = finiteScoreOrNull(value);
  return parsed !== null && parsed >= MINIMUM_BASELINE_SCORE;
}

export function validateBaseline(
  baseline: Baseline,
  options: {
    nowMs?: number;
    requireExactPopulation?: boolean;
    sourceReportBytes?: string;
  } = {},
): void {
  const nowMs = options.nowMs ?? Date.now();
  const generatedAt = Date.parse(baseline.generatedAt);
  const sourceStartedAt = Date.parse(baseline.source?.startedAt ?? "");
  const sourceFinishedAt = Date.parse(baseline.source?.finishedAt ?? "");
  if (
    baseline.schemaVersion !== BASELINE_SCHEMA_VERSION ||
    Number.isNaN(generatedAt) ||
    generatedAt > nowMs + 60_000 ||
    nowMs - generatedAt > BASELINE_MAX_AGE_MS ||
    typeof baseline.note !== "string" ||
    baseline.note.trim().length < 10 ||
    typeof baseline.source?.runId !== "string" ||
    baseline.source.runId.trim().length === 0 ||
    !/^[0-9a-f]{40}$/i.test(baseline.source?.revision ?? "") ||
    !/^[0-9a-f]{64}$/i.test(baseline.source?.reportSha256 ?? "") ||
    Number.isNaN(sourceStartedAt) ||
    Number.isNaN(sourceFinishedAt) ||
    sourceStartedAt > sourceFinishedAt ||
    sourceFinishedAt > generatedAt + 60_000 ||
    generatedAt - sourceFinishedAt > SOURCE_RUN_MAX_AGE_AT_PROMOTION_MS
  ) {
    throw new Error("baseline provenance is missing, stale, future-dated, or invalid");
  }
  assertSandbox({
    baseUrl: baseline.source.baseUrl,
    allowedBaseUrls: [CANONICAL_SANDBOX_URL],
  });
  if (typeof options.sourceReportBytes !== "string" || options.sourceReportBytes.length === 0) {
    throw new Error("baseline source report bytes are required");
  }
  const observedReportSha256 = createHash("sha256")
    .update(options.sourceReportBytes)
    .digest("hex");
  if (observedReportSha256 !== baseline.source.reportSha256) {
    throw new Error("baseline source report bytes do not match reportSha256");
  }
  let sourceReport: RunReport;
  try {
    sourceReport = JSON.parse(options.sourceReportBytes) as RunReport;
  } catch {
    throw new Error("baseline source report is not valid JSON");
  }
  if (
    sourceReport.runId !== baseline.source.runId ||
    sourceReport.revision !== baseline.source.revision ||
    sourceReport.baseUrl !== baseline.source.baseUrl ||
    sourceReport.startedAt !== baseline.source.startedAt ||
    sourceReport.finishedAt !== baseline.source.finishedAt ||
    sourceReport.success !== true ||
    sourceReport.dailyBudgetUsd <= 0 ||
    sourceReport.dailyBudgetUsd > 5 ||
    (options.requireExactPopulation === true && validateRunPopulation(sourceReport).length > 0) ||
    validateAssessmentTimeline(sourceReport).length > 0 ||
    validateBudgetEvidence(sourceReport).length > 0 ||
    sourceReport.results.some((result) => !hasCompleteGrading(result))
  ) {
    throw new Error("baseline source report identity or release evidence is invalid");
  }
  if (!Array.isArray(baseline.cells) || baseline.cells.length === 0) {
    throw new Error("baseline cells must be a non-empty array");
  }
  const expected = new Map<string, string>(
    SYNTHETIC_COMPANIES.flatMap((company) =>
      JOBS.map((job) => [`${company.key}/${job.key}`, job.domain] as const),
    ),
  );
  const keys = new Set<string>();
  const inspectionIds = new Set<string>();
  const generationIds = new Set<string>();
  const outputHashes = new Set<string>();
  for (const cell of baseline.cells) {
    if (
      typeof cell?.key !== "string" ||
      keys.has(cell.key) ||
      expected.get(cell.key) !== cell.domain ||
      !validBaselineScore(cell.deterministic) ||
      !validBaselineScore(cell.judge) ||
      typeof cell.inspectionId !== "string" ||
      cell.inspectionId.length === 0 ||
      inspectionIds.has(cell.inspectionId) ||
      typeof cell.generationId !== "string" ||
      cell.generationId.length === 0 ||
      generationIds.has(cell.generationId) ||
      !/^[0-9a-f]{64}$/i.test(cell.inputSha256 ?? "") ||
      !/^[0-9a-f]{64}$/i.test(cell.outputSha256 ?? "") ||
      outputHashes.has(cell.outputSha256 ?? "") ||
      cell.assessmentSha256 !== cell.outputSha256 ||
      cell.adjusterRecommendation !== "approve" ||
      cell.adjusterCriticalFindings !== 0 ||
      cell.adjusterCostReasonableness !== "within-range"
    ) {
      throw new Error("baseline contains an invalid, low-quality, altered, or duplicate cell");
    }
    keys.add(cell.key);
    inspectionIds.add(cell.inspectionId);
    generationIds.add(cell.generationId);
    outputHashes.add(cell.outputSha256!);
  }
  if (
    options.requireExactPopulation === true &&
    (keys.size !== expected.size || [...expected.keys()].some((key) => !keys.has(key)))
  ) {
    throw new Error("baseline does not contain the exact canonical company/job population");
  }
}

function meanCompositeFromResults(results: JobResult[]): number | null {
  const xs = results
    .map((r) => r.graded?.deterministic?.composite)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (xs.length === 0) return null;
  return xs.reduce((s, n) => s + n, 0) / xs.length;
}

function meanFromBaseline(b: Baseline): number | null {
  const xs = b.cells
    .map((c) => c.deterministic)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (xs.length === 0) return null;
  return xs.reduce((s, n) => s + n, 0) / xs.length;
}

// ── Baseline writer (operator-invoked, not in CI) ────────────────

export interface PromoteOptions {
  report: RunReport;
  baselinePath: string;
  note: string;
  sourceReportPath?: string;
}

/**
 * Convert a green run into the new baseline. Run manually after a
 * legitimate score movement (e.g. prompt improvement landed).
 *
 *   tsx pilot-tester/src/runner/baseline.ts promote ./reports/<run>.json "<note>"
 */
export async function promoteToBaseline(
  opts: PromoteOptions,
): Promise<Baseline> {
  const populationFailures = validateRunPopulation(opts.report);
  const finishedAt = Date.parse(opts.report.finishedAt);
  const startedAt = Date.parse(opts.report.startedAt);
  const now = Date.now();
  let sandboxSource = true;
  try {
    assertSandbox({
      baseUrl: opts.report.baseUrl,
      allowedBaseUrls: [CANONICAL_SANDBOX_URL],
    });
  } catch {
    sandboxSource = false;
  }
  if (
    opts.report.success !== true ||
    opts.report.results.length === 0 ||
    opts.report.results.some((result) => !hasCompleteGrading(result)) ||
    populationFailures.length > 0 ||
    !sandboxSource ||
    !/^[0-9a-f]{40}$/i.test(opts.report.revision) ||
    Number.isNaN(startedAt) ||
    Number.isNaN(finishedAt) ||
    startedAt > finishedAt ||
    finishedAt > now + 60_000 ||
    now - finishedAt > SOURCE_RUN_MAX_AGE_AT_PROMOTION_MS ||
    opts.report.dailyBudgetUsd <= 0 ||
    opts.report.dailyBudgetUsd > 5 ||
    opts.note.trim().length < 10
  ) {
    throw new Error(
      `refusing to promote an invalid canary report${
        populationFailures.length > 0 ? `: ${populationFailures.join("; ")}` : ""
      }`,
    );
  }
  const sourceReportPath =
    opts.sourceReportPath ?? path.join(path.dirname(opts.baselinePath), "source-report.json");
  const sourceReportBytes = JSON.stringify(opts.report, null, 2);
  const baseline: Baseline = {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    note: opts.note,
    source: {
      runId: opts.report.runId,
      revision: opts.report.revision,
      baseUrl: opts.report.baseUrl,
      startedAt: opts.report.startedAt,
      finishedAt: opts.report.finishedAt,
      reportSha256: createHash("sha256").update(sourceReportBytes).digest("hex"),
    },
    cells: opts.report.results.map((r) => resultToCell(r)),
  };
  validateBaseline(baseline, { requireExactPopulation: true, sourceReportBytes });
  await fs.mkdir(path.dirname(opts.baselinePath), { recursive: true });
  await fs.mkdir(path.dirname(sourceReportPath), { recursive: true });
  await fs.writeFile(sourceReportPath, sourceReportBytes);
  const serialized = JSON.stringify(baseline, null, 2);
  await fs.writeFile(opts.baselinePath, serialized);
  const observed = await fs.readFile(opts.baselinePath, "utf8");
  const observedSource = await fs.readFile(sourceReportPath, "utf8");
  if (observed !== serialized || observedSource !== sourceReportBytes) {
    throw new Error("baseline postcondition failed: persisted bytes do not match the promoted run");
  }
  return baseline;
}

async function baselineCli(argv: string[]): Promise<number> {
  if (argv[2] !== "promote" || !argv[3]) {
    console.error(
      "Usage: tsx src/runner/baseline.ts promote <report.json> [note] [baseline.json]",
    );
    return 2;
  }
  const reportPath = path.resolve(argv[3]);
  const note = argv[4] ?? "operator-reviewed canary run";
  const baselinePath = path.resolve(argv[5] ?? "baselines/sandbox.json");
  try {
    const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as RunReport;
    const promotionStartedAt = Date.now();
    await promoteToBaseline({ report, baselinePath, note });
    const persisted = JSON.parse(await fs.readFile(baselinePath, "utf8")) as Baseline;
    const persistedStat = await fs.stat(baselinePath);
    const generatedAtMs = Date.parse(persisted.generatedAt);
    const expectedCells = report.results.map((result) => resultToCell(result));
    if (
      !Array.isArray(persisted.cells) ||
      JSON.stringify(persisted.cells) !== JSON.stringify(expectedCells) ||
      persisted.note !== note ||
      Number.isNaN(generatedAtMs) ||
      generatedAtMs < promotionStartedAt - 1_000 ||
      generatedAtMs > Date.now() + 1_000 ||
      persistedStat.mtimeMs < promotionStartedAt - 1_000
    ) {
      throw new Error("baseline CLI postcondition failed: target does not match the promoted run");
    }
  } catch (error) {
    console.error(`[pilot-tester baseline] FAIL: ${String(error)}`);
    return 1;
  }
  console.log(`[pilot-tester baseline] wrote ${baselinePath}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await baselineCli(process.argv);
}
