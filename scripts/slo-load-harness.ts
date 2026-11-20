#!/usr/bin/env npx tsx
/**
 * W5-5 — lightweight read-only load probe against /api/health.
 * Writes docs/internal/metrics/slo-last-run.json for program-status.
 */

import fs from "node:fs";
import path from "node:path";
import {
  evaluateSlo,
  getSloTargets,
  type SloSampleResult,
} from "../lib/operations/slo-targets";

const OUT_PATH = path.join(
  process.cwd(),
  "docs/internal/metrics/slo-last-run.json",
);

async function fetchLatencyMs(url: string): Promise<number | null> {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    await res.arrayBuffer().catch(() => undefined);
    if (!res.ok) return null;
    return performance.now() - start;
  } catch {
    return null;
  }
}

async function runPool(
  baseUrl: string,
  total: number,
  concurrency: number,
): Promise<SloSampleResult> {
  const latenciesMs: number[] = [];
  let errors = 0;
  let next = 0;

  const healthUrl = `${baseUrl.replace(/\/$/, "")}/api/health`;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= total) break;
      const ms = await fetchLatencyMs(healthUrl);
      if (ms == null) errors += 1;
      else latenciesMs.push(ms);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { latenciesMs, errors, total };
}

async function main() {
  const baseUrl =
    process.env.SLO_BASE_URL?.trim() ||
    process.env.BASE_URL?.trim() ||
    "http://127.0.0.1:3000";

  if (process.env.VERCEL_ENV === "production" && !process.env.SLO_ALLOW_PROD) {
    console.error("Refusing SLO harness on production without SLO_ALLOW_PROD=1");
    process.exit(2);
  }

  const targets = getSloTargets();
  const sample = await runPool(
    baseUrl,
    targets.requestsPerRun,
    targets.concurrency,
  );
  const evaluation = evaluateSlo(sample, targets);

  const report = {
    ranAt: new Date().toISOString(),
    baseUrl,
    path: "/api/health",
    ...evaluation,
    sample: {
      total: sample.total,
      errors: sample.errors,
      successLatencies: sample.latenciesMs.length,
    },
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify(report, null, 2));
  process.exit(evaluation.pass ? 0 : 1);
}

void main();