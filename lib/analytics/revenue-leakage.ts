/**
 * Revenue-leakage analyzer — RA-7026.
 *
 * Quantifies "money left on the table" across real Ascora jobs: for each invoiced
 * line item, compare the actual unit price charged against a benchmark rate for
 * that part (learned `ScopePricingDatabase` median, or an IICRC-correct rate).
 * Leakage is the sum of POSITIVE per-line gaps (under-charging) — over-charged
 * lines are never netted off, because the question is what we failed to bill.
 *
 * Pure and dependency-free: the caller supplies the jobs and a benchmark-rate
 * resolver, so this is fully unit-testable and runs identically on synthetic and
 * real data. Wiring (Prisma load of AscoraJob/AscoraLineItem + a resolver built
 * from ScopePricingDatabase) lives in the route/consumer, not here.
 */

export interface AscoraLineItemInput {
  partNumber: string;
  description: string;
  quantity: number;
  unitPriceExTax: number;
  amountExTax: number;
}

export interface AscoraJobInput {
  ascoraJobId: string;
  claimType: string | null;
  totalExTax: number | null;
  lineItems: AscoraLineItemInput[];
}

export interface BenchmarkRate {
  /** Benchmark unit price ex-tax (AUD). */
  rate: number;
  /** Where the benchmark came from, e.g. "ScopePricingDatabase:median". */
  source: string;
}

/**
 * Resolve the benchmark unit rate for a part on a given claim type. Return null
 * when no benchmark is known — such lines are reported as unmatched and excluded
 * from the leakage figure (never guessed).
 */
export type BenchmarkRateResolver = (
  partNumber: string,
  claimType: string | null,
) => BenchmarkRate | null;

export interface PartLeakage {
  partNumber: string;
  description: string;
  lineCount: number;
  totalQuantity: number;
  actualAvgUnitPrice: number;
  benchmarkUnitPrice: number;
  gapPerUnit: number;
  totalGap: number;
}

export interface ClaimTypeLeakage {
  claimType: string;
  jobCount: number;
  actualExTax: number;
  benchmarkExTax: number;
  leakage: number;
  leakagePct: number;
}

export interface RevenueLeakageReport {
  jobsAnalyzed: number;
  linesAnalyzed: number;
  linesMatched: number;
  linesUnmatched: number;
  /** Actual invoiced ex-tax across MATCHED lines. */
  totalActualExTax: number;
  /** Value of the MATCHED lines at benchmark rates. */
  totalBenchmarkExTax: number;
  /** Sum of positive per-line gaps = money left on the table. */
  totalLeakage: number;
  /** totalLeakage / totalBenchmarkExTax (0 when no matched value). */
  leakagePct: number;
  byClaimType: ClaimTypeLeakage[];
  topUnderpricedParts: PartLeakage[];
}

export interface AnalyzeOptions {
  /** Count a line only when (benchmark − actual)/benchmark exceeds this. Default 0. */
  minGapFraction?: number;
  /** Max entries in topUnderpricedParts. Default 20. */
  topPartsLimit?: number;
}

const UNCLASSIFIED = "Unclassified";

interface PartAcc {
  partNumber: string;
  description: string;
  lineCount: number;
  totalQuantity: number;
  actualValue: number; // Σ qty * actual
  benchmarkValue: number; // Σ qty * benchmark
  totalGap: number; // Σ qty * positiveGap
}

interface ClaimAcc {
  claimType: string;
  jobCount: number;
  actualExTax: number;
  benchmarkExTax: number;
  leakage: number;
}

export function analyzeRevenueLeakage(
  jobs: AscoraJobInput[],
  resolveBenchmark: BenchmarkRateResolver,
  options: AnalyzeOptions = {},
): RevenueLeakageReport {
  const minGapFraction = options.minGapFraction ?? 0;
  const topPartsLimit = options.topPartsLimit ?? 20;

  let linesAnalyzed = 0;
  let linesMatched = 0;
  let linesUnmatched = 0;
  let totalActualExTax = 0;
  let totalBenchmarkExTax = 0;
  let totalLeakage = 0;

  const parts = new Map<string, PartAcc>();
  const claims = new Map<string, ClaimAcc>();

  for (const job of jobs) {
    const claimType = job.claimType ?? UNCLASSIFIED;
    let claim = claims.get(claimType);
    if (!claim) {
      claim = {
        claimType,
        jobCount: 0,
        actualExTax: 0,
        benchmarkExTax: 0,
        leakage: 0,
      };
      claims.set(claimType, claim);
    }
    claim.jobCount += 1;

    for (const line of job.lineItems) {
      linesAnalyzed += 1;
      const benchmark = resolveBenchmark(line.partNumber, job.claimType);
      if (!benchmark) {
        linesUnmatched += 1;
        continue;
      }
      linesMatched += 1;

      const actualValue = line.quantity * line.unitPriceExTax;
      const benchmarkValue = line.quantity * benchmark.rate;
      const rawGapPerUnit = benchmark.rate - line.unitPriceExTax;
      const meetsThreshold =
        benchmark.rate > 0 && rawGapPerUnit / benchmark.rate > minGapFraction;
      const lineGap = rawGapPerUnit > 0 && meetsThreshold ? line.quantity * rawGapPerUnit : 0;

      totalActualExTax += actualValue;
      totalBenchmarkExTax += benchmarkValue;
      totalLeakage += lineGap;

      claim.actualExTax += actualValue;
      claim.benchmarkExTax += benchmarkValue;
      claim.leakage += lineGap;

      let part = parts.get(line.partNumber);
      if (!part) {
        part = {
          partNumber: line.partNumber,
          description: line.description,
          lineCount: 0,
          totalQuantity: 0,
          actualValue: 0,
          benchmarkValue: 0,
          totalGap: 0,
        };
        parts.set(line.partNumber, part);
      }
      part.lineCount += 1;
      part.totalQuantity += line.quantity;
      part.actualValue += actualValue;
      part.benchmarkValue += benchmarkValue;
      part.totalGap += lineGap;
    }
  }

  const byClaimType: ClaimTypeLeakage[] = [...claims.values()]
    .map((c) => ({
      claimType: c.claimType,
      jobCount: c.jobCount,
      actualExTax: c.actualExTax,
      benchmarkExTax: c.benchmarkExTax,
      leakage: c.leakage,
      leakagePct: c.benchmarkExTax > 0 ? c.leakage / c.benchmarkExTax : 0,
    }))
    .sort((a, b) => b.leakage - a.leakage);

  const topUnderpricedParts: PartLeakage[] = [...parts.values()]
    .filter((p) => p.totalGap > 0)
    .map((p) => ({
      partNumber: p.partNumber,
      description: p.description,
      lineCount: p.lineCount,
      totalQuantity: p.totalQuantity,
      actualAvgUnitPrice: p.totalQuantity > 0 ? p.actualValue / p.totalQuantity : 0,
      benchmarkUnitPrice: p.totalQuantity > 0 ? p.benchmarkValue / p.totalQuantity : 0,
      gapPerUnit:
        p.totalQuantity > 0 ? (p.benchmarkValue - p.actualValue) / p.totalQuantity : 0,
      totalGap: p.totalGap,
    }))
    .sort((a, b) => b.totalGap - a.totalGap)
    .slice(0, topPartsLimit);

  return {
    jobsAnalyzed: jobs.length,
    linesAnalyzed,
    linesMatched,
    linesUnmatched,
    totalActualExTax,
    totalBenchmarkExTax,
    totalLeakage,
    leakagePct: totalBenchmarkExTax > 0 ? totalLeakage / totalBenchmarkExTax : 0,
    byClaimType,
    topUnderpricedParts,
  };
}

export interface PricingDbRow {
  partNumber: string;
  averageUnitPriceAU: number;
  medianUnitPriceAU?: number | null;
}

/**
 * Build a benchmark resolver from `ScopePricingDatabase` rows. Prefers the median
 * (robust to outliers) and falls back to the average. Unknown parts resolve to
 * null so they are excluded from the leakage figure rather than guessed.
 */
export function benchmarkResolverFromPricingDb(
  rows: PricingDbRow[],
): BenchmarkRateResolver {
  const byPart = new Map<string, BenchmarkRate>();
  for (const row of rows) {
    const median = row.medianUnitPriceAU;
    if (median != null) {
      byPart.set(row.partNumber, {
        rate: median,
        source: "ScopePricingDatabase:median",
      });
    } else {
      byPart.set(row.partNumber, {
        rate: row.averageUnitPriceAU,
        source: "ScopePricingDatabase:average",
      });
    }
  }
  return (partNumber) => byPart.get(partNumber) ?? null;
}
