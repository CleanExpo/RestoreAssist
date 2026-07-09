import { describe, it, expect } from "vitest";
import {
  analyzeRevenueLeakage,
  benchmarkResolverFromPricingDb,
  type AscoraJobInput,
  type BenchmarkRateResolver,
} from "../revenue-leakage";

// RA-7026: revenue-leakage analyzer. For each real Ascora job, compare what was
// actually invoiced (line-item unit prices) against a benchmark rate per part
// (learned ScopePricingDatabase / IICRC-correct rate). "Money left on the table"
// = the sum of positive per-line gaps (under-charging), never netting overcharges.

function job(
  claimType: string | null,
  lines: Array<[string, number, number]>, // [partNumber, quantity, unitPriceExTax]
  id = "j1",
): AscoraJobInput {
  return {
    ascoraJobId: id,
    claimType,
    totalExTax: lines.reduce((s, [, q, p]) => s + q * p, 0),
    lineItems: lines.map(([partNumber, quantity, unitPriceExTax]) => ({
      partNumber,
      description: partNumber,
      quantity,
      unitPriceExTax,
      amountExTax: quantity * unitPriceExTax,
    })),
  };
}

/** Fixed benchmark rates for tests. */
const fixed: (rates: Record<string, number>) => BenchmarkRateResolver =
  (rates) => (partNumber) =>
    partNumber in rates
      ? { rate: rates[partNumber], source: "test" }
      : null;

describe("analyzeRevenueLeakage", () => {
  it("returns a zeroed report for no jobs", () => {
    const r = analyzeRevenueLeakage([], fixed({}));
    expect(r.jobsAnalyzed).toBe(0);
    expect(r.totalLeakage).toBe(0);
    expect(r.leakagePct).toBe(0);
    expect(r.topUnderpricedParts).toEqual([]);
  });

  it("quantifies under-charging (mould at 5x under-quote, cf. PR #1813)", () => {
    // charged $20/m², benchmark $100/m², 50 m² -> 50 * (100-20) = 4000 leakage
    const r = analyzeRevenueLeakage(
      [job("Mould Remediation", [["MOULD-REM-M2", 50, 20]])],
      fixed({ "MOULD-REM-M2": 100 }),
    );
    expect(r.totalLeakage).toBeCloseTo(4000);
    expect(r.totalBenchmarkExTax).toBeCloseTo(5000);
    expect(r.leakagePct).toBeCloseTo(0.8);
    expect(r.linesMatched).toBe(1);
  });

  it("never counts an over-charged line as leakage (no netting)", () => {
    // charged $120 vs benchmark $100 -> gap is negative -> 0 leakage
    const r = analyzeRevenueLeakage(
      [job("Water Damage", [["DRY-FAN", 10, 120]])],
      fixed({ "DRY-FAN": 100 }),
    );
    expect(r.totalLeakage).toBe(0);
  });

  it("excludes lines with no benchmark from leakage but counts them as unmatched", () => {
    const r = analyzeRevenueLeakage(
      [job("Water Damage", [["KNOWN", 1, 10], ["UNKNOWN", 1, 10]])],
      fixed({ KNOWN: 20 }),
    );
    expect(r.linesAnalyzed).toBe(2);
    expect(r.linesMatched).toBe(1);
    expect(r.linesUnmatched).toBe(1);
    expect(r.totalLeakage).toBeCloseTo(10); // only KNOWN: 1 * (20-10)
  });

  it("aggregates leakage by claim type, sorted by leakage desc", () => {
    const r = analyzeRevenueLeakage(
      [
        job("Mould Remediation", [["M", 10, 10]], "j1"), // 10*(50-10)=400
        job("Water Damage", [["W", 10, 10]], "j2"), //     10*(30-10)=200
      ],
      fixed({ M: 50, W: 30 }),
    );
    expect(r.byClaimType.map((c) => c.claimType)).toEqual([
      "Mould Remediation",
      "Water Damage",
    ]);
    expect(r.byClaimType[0].leakage).toBeCloseTo(400);
    expect(r.byClaimType[0].jobCount).toBe(1);
  });

  it("ranks top under-priced parts and aggregates across lines of the same part", () => {
    const r = analyzeRevenueLeakage(
      [
        job("Mould Remediation", [["BIG", 10, 10]], "j1"), // gap 40/u -> 400
        job("Mould Remediation", [["BIG", 5, 10]], "j2"), //  gap 40/u -> 200 (same part)
        job("Water Damage", [["SMALL", 1, 10]], "j3"), //     gap 5/u  -> 5
      ],
      fixed({ BIG: 50, SMALL: 15 }),
      { topPartsLimit: 5 },
    );
    expect(r.topUnderpricedParts[0].partNumber).toBe("BIG");
    expect(r.topUnderpricedParts[0].lineCount).toBe(2);
    expect(r.topUnderpricedParts[0].totalQuantity).toBe(15);
    expect(r.topUnderpricedParts[0].totalGap).toBeCloseTo(600);
    expect(r.topUnderpricedParts[0].gapPerUnit).toBeCloseTo(40);
    expect(r.topUnderpricedParts[1].partNumber).toBe("SMALL");
  });

  it("honours minGapFraction to ignore trivial rate differences", () => {
    // 1% under benchmark, threshold 5% -> not counted
    const r = analyzeRevenueLeakage(
      [job("Water Damage", [["P", 100, 99]])],
      fixed({ P: 100 }),
      { minGapFraction: 0.05 },
    );
    expect(r.totalLeakage).toBe(0);
  });
});

describe("benchmarkResolverFromPricingDb", () => {
  it("prefers median over average and returns null for unknown parts", () => {
    const resolve = benchmarkResolverFromPricingDb([
      { partNumber: "A", averageUnitPriceAU: 50, medianUnitPriceAU: 45 },
      { partNumber: "B", averageUnitPriceAU: 80, medianUnitPriceAU: null },
    ]);
    expect(resolve("A", null)?.rate).toBe(45);
    expect(resolve("A", null)?.source).toContain("median");
    expect(resolve("B", null)?.rate).toBe(80);
    expect(resolve("B", null)?.source).toContain("average");
    expect(resolve("C", null)).toBeNull();
  });
});
