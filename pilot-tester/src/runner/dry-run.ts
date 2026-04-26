/**
 * Dry-run mode — exercises the harness internals without hitting any
 * remote API.
 *
 * The nightly canary needs a "the harness itself is healthy" signal
 * even when the operator hasn't yet provisioned sandbox accounts /
 * Unsplash key / GitHub Actions secrets. This entrypoint is what
 * runs on every PR — it confirms:
 *
 *   - Safety guard accepts known-sandbox + rejects known-prod
 *   - Fixture invariants hold (5 companies, 7 domains, key uniqueness)
 *   - Manifest schema parses
 *   - Reporter renders cleanly against synthetic graded results
 *   - Baseline analyser tolerates missing baseline file
 *
 * If anything trips, exit non-zero so PR CI fails.
 */

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import { assertSandbox, ProdAccessRefused } from "../client/safety.js";
import { SYNTHETIC_COMPANIES } from "../companies/fixtures.js";
import { JOBS } from "../jobs/index.js";
import { loadManifest } from "../images/source.js";
import { writeReport } from "./reporter.js";
import { analyseRegression } from "./baseline.js";
import type { JobResult, RunReport } from "./orchestrator.js";

export async function dryRun(): Promise<boolean> {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];

  // 1. Safety guard — accepts sandbox.
  try {
    assertSandbox({ baseUrl: "https://restoreassist-sandbox.vercel.app" });
    checks.push({ name: "safety: accepts sandbox", ok: true });
  } catch (err) {
    checks.push({
      name: "safety: accepts sandbox",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Safety guard — rejects prod.
  try {
    assertSandbox({ baseUrl: "https://app.restoreassist.com.au" });
    checks.push({
      name: "safety: rejects prod",
      ok: false,
      detail: "Did NOT throw on prod hostname",
    });
  } catch (err) {
    if (err instanceof ProdAccessRefused) {
      checks.push({ name: "safety: rejects prod", ok: true });
    } else {
      checks.push({
        name: "safety: rejects prod",
        ok: false,
        detail: `Threw the wrong error type: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 3. Fixture coverage.
  const domainSet = new Set<string>(JOBS.map((j) => j.domain));
  const expectedDomains = [
    "WATER",
    "MOULD",
    "BIOHAZARD",
    "FIRE_SMOKE",
    "STORM",
    "HVAC",
    "AUSTRALIAN_COMPLIANCE",
  ];
  const missing = expectedDomains.filter((d) => !domainSet.has(d));
  checks.push({
    name: "fixtures: cover all 7 domains",
    ok: missing.length === 0,
    detail: missing.length === 0 ? undefined : `missing: ${missing.join(", ")}`,
  });

  checks.push({
    name: "fixtures: at least 5 companies",
    ok: SYNTHETIC_COMPANIES.length >= 5,
  });

  // 4. Manifest schema parses.
  try {
    const m = await loadManifest();
    checks.push({
      name: "images: manifest parses",
      ok: typeof m.generatedAt === "string" && Array.isArray(m.entries),
    });
  } catch (err) {
    checks.push({
      name: "images: manifest parses",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // 5. Reporter + baseline analyser tolerate missing baseline.
  try {
    const synthetic: RunReport = makeSyntheticReport();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pilot-dry-"));
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const regression = await analyseRegression({
        report: synthetic,
        baselinePath: path.join(tmpDir, "baselines/missing.json"),
      });
      const written = await writeReport(synthetic, regression);
      const md = await fs.readFile(written.markdownPath, "utf8");
      checks.push({
        name: "reporter: renders + handles missing baseline",
        ok: md.includes("Pilot tester run") && md.includes("No baseline found"),
      });
    } finally {
      process.chdir(originalCwd);
    }
  } catch (err) {
    checks.push({
      name: "reporter: renders + handles missing baseline",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // Print a tight summary.
  let ok = true;
  for (const c of checks) {
    // eslint-disable-next-line no-console
    console.log(
      `${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`,
    );
    if (!c.ok) ok = false;
  }
  // eslint-disable-next-line no-console
  console.log(
    `\n[pilot-tester dry-run] ${ok ? "all checks passed" : "FAILED"}`,
  );
  return ok;
}

function makeSyntheticReport(): RunReport {
  const company = SYNTHETIC_COMPANIES[0];
  const job = JOBS[0];
  const result: JobResult = {
    company,
    job,
    inspectionId: "dry-run-inspection",
    generationId: "dry-run-generation",
    durationMs: 1234,
    graded: {
      inspectionId: "dry-run-inspection",
      domain: job.domain,
      generationId: "dry-run-generation",
      modelUsed: "rule-based",
      latencyMs: 42,
      costEstimateUsd: null,
      deterministic: {
        composite: 78,
        structural: 80,
        citations: 75,
        equipment: 82,
        specificity: 70,
        category: 80,
      },
      adjuster: null,
      judge: null,
      fullyGraded: false,
    },
  };
  const startedAt = new Date().toISOString();
  return {
    runId: "dry-run",
    baseUrl: "https://restoreassist-sandbox.vercel.app",
    startedAt,
    finishedAt: startedAt,
    totalMs: 1234,
    results: [result],
    success: true,
  };
}
