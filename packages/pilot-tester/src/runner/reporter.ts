/**
 * Reporter — markdown + JSON.
 *
 * One artefact per run, written under reports/. The markdown is the
 * human-readable digest; the JSON is the machine-readable companion
 * the nightly CI workflow diffs against the baseline to spot
 * regressions.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { RunReport } from "./orchestrator.js";
import type { RegressionAnalysis } from "./baseline.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORTS_DIR = path.resolve(__dirname, "..", "..", "reports");

export interface WrittenReport {
  jsonPath: string;
  markdownPath: string;
}

export async function writeReport(
  report: RunReport,
  regression?: RegressionAnalysis,
): Promise<WrittenReport> {
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  const stamp = report.startedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(REPORTS_DIR, `${stamp}-${report.runId}.json`);
  const markdownPath = path.join(REPORTS_DIR, `${stamp}-${report.runId}.md`);

  const payload = regression ? { ...report, regression } : report;
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile(markdownPath, renderMarkdown(report, regression), "utf8");

  return { jsonPath, markdownPath };
}

function renderMarkdown(
  report: RunReport,
  regression?: RegressionAnalysis,
): string {
  const lines: string[] = [];
  lines.push(`# Pilot tester run · ${report.runId}`);
  lines.push("");
  lines.push(`- Base URL: ${report.baseUrl}`);
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Finished: ${report.finishedAt}`);
  lines.push(`- Duration: ${(report.totalMs / 1000).toFixed(1)}s`);
  lines.push(
    `- Outcome: ${report.success ? "✅ all jobs ran" : "⚠️ failures"}`,
  );
  lines.push("");

  const ok = report.results.filter((r) => !r.error).length;
  const fail = report.results.length - ok;
  const fullyGraded = report.results.filter(
    (r) => r.graded?.fullyGraded,
  ).length;
  const avgComposite = average(
    report.results
      .map((r) => r.graded?.deterministic?.composite)
      .filter((n): n is number => typeof n === "number"),
  );

  lines.push(`## Summary`);
  lines.push("");
  lines.push(`- ✅ jobs run: ${ok}`);
  lines.push(`- ✗ jobs failed: ${fail}`);
  lines.push(`- 📐 fully-graded jobs: ${fullyGraded}`);
  if (avgComposite !== null) {
    lines.push(
      `- 📊 mean deterministic composite: ${avgComposite.toFixed(1)}/100`,
    );
  }
  lines.push("");

  lines.push(`## Per-job`);
  lines.push("");
  lines.push(
    "| Company | Job | Domain | Status | Det | Judge | Adj | Latency |",
  );
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of report.results) {
    const det = r.graded?.deterministic?.composite;
    const judge = r.graded?.judge?.composite;
    const adj = r.graded?.adjuster?.recommendation ?? "—";
    const status = r.error ? `✗ ${r.error}` : r.graded?.fullyGraded ? "✓" : "·";
    lines.push(
      `| ${r.company.name} | ${r.job.key} | ${r.job.domain} | ${status} | ${det !== undefined ? det.toFixed(0) : "—"} | ${judge !== undefined ? judge.toFixed(0) : "—"} | ${adj} | ${(r.durationMs / 1000).toFixed(1)}s |`,
    );
  }
  lines.push("");

  // Regression block — pinned high in the report so anything red
  // surfaces above the per-job grid.
  if (regression) {
    lines.push(`## Baseline regression`);
    lines.push("");
    if (!regression.baselineFound) {
      lines.push(
        `- ⚠️  No baseline found. First run, or baseline file deleted.`,
      );
      lines.push(
        `- Run \`tsx pilot-tester/src/runner/baseline.ts promote <report.json>\` to seed one.`,
      );
    } else {
      lines.push(
        `- ${regression.pass ? "✅ pass" : "🚨 FAIL"} (cell tol ±${regression.cellTolerance}, mean tol ±${regression.meanTolerance})`,
      );
      if (regression.meanBefore !== null && regression.meanAfter !== null) {
        const delta = regression.meanAfter - regression.meanBefore;
        lines.push(
          `- Mean composite: ${regression.meanBefore.toFixed(1)} → ${regression.meanAfter.toFixed(1)} (${delta >= 0 ? "+" : ""}${delta.toFixed(1)})`,
        );
      }
      if (regression.findings.length > 0) {
        lines.push(`- ${regression.findings.length} finding(s):`);
        for (const f of regression.findings) {
          const tag =
            f.severity === "hard"
              ? "🚨"
              : f.severity === "coverage"
                ? "⚠️"
                : "ℹ️";
          lines.push(`  - ${tag} ${f.message}`);
        }
      }
    }
    lines.push("");
  }

  // Per-domain digest — easier to spot a single-domain regression.
  const byDomain = new Map<string, number[]>();
  for (const r of report.results) {
    const score = r.graded?.deterministic?.composite;
    if (typeof score === "number") {
      const key = r.job.domain;
      if (!byDomain.has(key)) byDomain.set(key, []);
      byDomain.get(key)!.push(score);
    }
  }
  if (byDomain.size > 0) {
    lines.push(`## Per-domain mean deterministic composite`);
    lines.push("");
    for (const [domain, scores] of [...byDomain.entries()].sort()) {
      lines.push(
        `- ${domain}: ${average(scores)!.toFixed(1)}/100 (n=${scores.length})`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}
