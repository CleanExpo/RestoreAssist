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
import type { JobResult, RunReport } from "./orchestrator.js";

export interface BaselineCell {
  /** Composite key: `${companyKey}/${jobKey}` */
  key: string;
  domain: string;
  deterministic: number | null;
  judge: number | null;
}

export interface Baseline {
  generatedAt: string;
  /** Free-form note from the operator who created the baseline. */
  note: string;
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
  } catch {
    return {
      baselineFound: false,
      cellTolerance,
      meanTolerance,
      meanBefore: null,
      meanAfter: meanCompositeFromResults(opts.report.results),
      findings: [],
      pass: true,
    };
  }

  const baselineByKey = new Map(baseline.cells.map((c) => [c.key, c]));
  const currentCells = opts.report.results.map((r) => resultToCell(r));

  for (const cell of currentCells) {
    const before = baselineByKey.get(cell.key);
    if (!before) continue;
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

  const hardFails = findings.filter((f) => f.severity === "hard").length;
  const coverageFails = findings.filter(
    (f) => f.severity === "coverage",
  ).length;

  return {
    baselineFound: true,
    cellTolerance,
    meanTolerance,
    meanBefore,
    meanAfter,
    findings,
    // The CI gate: any hard or coverage finding fails the run. Soft
    // findings get surfaced but don't block — they're a heads-up for
    // the operator, not a regression.
    pass: hardFails === 0 && coverageFails === 0,
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
    deterministic: r.graded?.deterministic?.composite ?? null,
    judge: r.graded?.judge?.composite ?? null,
  };
}

function meanCompositeFromResults(results: JobResult[]): number | null {
  const xs = results
    .map((r) => r.graded?.deterministic?.composite)
    .filter((n): n is number => typeof n === "number");
  if (xs.length === 0) return null;
  return xs.reduce((s, n) => s + n, 0) / xs.length;
}

function meanFromBaseline(b: Baseline): number | null {
  const xs = b.cells
    .map((c) => c.deterministic)
    .filter((n): n is number => typeof n === "number");
  if (xs.length === 0) return null;
  return xs.reduce((s, n) => s + n, 0) / xs.length;
}

// ── Baseline writer (operator-invoked, not in CI) ────────────────

export interface PromoteOptions {
  report: RunReport;
  baselinePath: string;
  note: string;
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
  const baseline: Baseline = {
    generatedAt: new Date().toISOString(),
    note: opts.note,
    cells: opts.report.results.map((r) => resultToCell(r)),
  };
  await fs.mkdir(path.dirname(opts.baselinePath), { recursive: true });
  await fs.writeFile(opts.baselinePath, JSON.stringify(baseline, null, 2));
  return baseline;
}
