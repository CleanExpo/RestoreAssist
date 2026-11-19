/**
 * W5-5 / W6 — configurable SLO targets (override via env for owner gate).
 */

export type SloTargets = {
  p95LatencyMs: number;
  errorRateMax: number;
  concurrency: number;
  requestsPerRun: number;
};

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Defaults are conservative pilot baselines — Phil can raise via env. */
export function getSloTargets(): SloTargets {
  return {
    p95LatencyMs: numEnv("OPS_SLO_P95_MS", 1200),
    errorRateMax: numEnv("OPS_SLO_ERROR_RATE_MAX", 0.02),
    concurrency: numEnv("OPS_LOAD_CONCURRENCY", 5),
    requestsPerRun: numEnv("OPS_LOAD_REQUESTS", 25),
  };
}

export type SloSampleResult = {
  latenciesMs: number[];
  errors: number;
  total: number;
};

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, idx)] ?? 0;
}

export function evaluateSlo(
  sample: SloSampleResult,
  targets: SloTargets,
): {
  pass: boolean;
  p50Ms: number;
  p95Ms: number;
  errorRate: number;
  targets: SloTargets;
} {
  const sorted = [...sample.latenciesMs].sort((a, b) => a - b);
  const p50Ms = percentile(sorted, 50);
  const p95Ms = percentile(sorted, 95);
  const errorRate = sample.total > 0 ? sample.errors / sample.total : 0;
  const pass =
    sample.total > 0 &&
    p95Ms <= targets.p95LatencyMs &&
    errorRate <= targets.errorRateMax;

  return { pass, p50Ms, p95Ms, errorRate, targets };
}