/**
 * RA-8419 slice a: Senior Project Manager (SPM) line.
 *
 * Founder rule (17/11/2026): every claim over $2,500 carries a Senior Project
 * Manager line, 2 hrs at $175 = $350 ex GST, for the site visit and scope. It
 * is a required process step (Decision 5: no waiver). The threshold is
 * measured ex GST and before the SPM line itself, so the fee can never push a
 * job over the line by itself. It is its own line: contingency is not charged
 * on it and no project-management percentage is added. AU only for now.
 */
import { describe, expect, it } from "vitest";
import type {
  CostEstimateItem,
  CostEstimateResult,
} from "@/lib/nir-cost-estimation";
import { buildEstimateLines } from "@/lib/estimate-lines";
import {
  SPM_DEFAULT_HOURLY_RATE,
  SPM_HOURS,
  SPM_LINE_DESCRIPTION,
  SPM_THRESHOLD_EX_GST,
  isSpmLine,
  withSpmLine,
} from "@/lib/billing/spm-line";

function item(subtotal: number): CostEstimateItem {
  return {
    category: "Labour",
    description: "Water extraction",
    quantity: 1,
    unit: "job",
    rate: subtotal,
    subtotal,
    nrpgField: null,
    nrpgCompliant: true,
    rateSource: "company-config",
    isEstimated: true,
  };
}

/** An estimate whose total ex GST (subtotal + contingency) is `total`. */
function estimateTotalling(total: number, contingency = 0): CostEstimateResult {
  const subtotal = Math.round((total - contingency) * 100) / 100;
  return {
    items: [item(subtotal)],
    subtotal,
    contingency,
    contingencyPercentage: contingency > 0 ? 10 : 0,
    total,
    currency: "AUD",
    breakdown: { equipment: 0, labour: subtotal, materials: 0, other: 0 },
    nrpgCompliant: true,
    nrpgViolations: [],
    pricingSource: "company-config",
  };
}

const spmLines = (e: CostEstimateResult) => e.items.filter(isSpmLine);

describe("RA-8419 SPM line: the $2,500 threshold", () => {
  it("constants match the founder rule", () => {
    expect(SPM_THRESHOLD_EX_GST).toBe(2500);
    expect(SPM_HOURS).toBe(2);
    expect(SPM_DEFAULT_HOURLY_RATE).toBe(175);
  });

  it("$2,499.99 ex GST: no SPM line, estimate unchanged", () => {
    const before = estimateTotalling(2499.99);
    const after = withSpmLine(before, { country: "AU" });
    expect(spmLines(after)).toHaveLength(0);
    expect(after.total).toBe(2499.99);
    expect(after.subtotal).toBe(2499.99);
  });

  it("$2,500.00 ex GST exactly: no SPM line (rule is 'over $2,500')", () => {
    const after = withSpmLine(estimateTotalling(2500), { country: "AU" });
    expect(spmLines(after)).toHaveLength(0);
    expect(after.total).toBe(2500);
  });

  it("$2,500.01 ex GST: one SPM line of 2 hrs @ $175 = $350, total +$350", () => {
    const after = withSpmLine(estimateTotalling(2500.01), { country: "AU" });
    const spm = spmLines(after);
    expect(spm).toHaveLength(1);
    expect(spm[0].description).toBe(SPM_LINE_DESCRIPTION);
    expect(spm[0].quantity).toBe(2);
    expect(spm[0].unit).toBe("hr");
    expect(spm[0].rate).toBe(175);
    expect(spm[0].subtotal).toBe(350);
    expect(spm[0].isEstimated).toBe(false);
    expect(after.subtotal).toBe(2850.01);
    expect(after.total).toBe(2850.01);
  });

  it("threshold counts contingency (total ex GST), not the bare subtotal", () => {
    // subtotal 2,300 + contingency 200.01 = 2,500.01 ex GST -> SPM applies.
    const after = withSpmLine(estimateTotalling(2500.01, 200.01), {
      country: "AU",
    });
    expect(spmLines(after)).toHaveLength(1);
  });
});

describe("RA-8419 SPM line: its own line, never inside other charges", () => {
  it("contingency is not charged on the SPM line", () => {
    const before = estimateTotalling(5000, 500);
    const after = withSpmLine(before, { country: "AU" });
    expect(after.contingency).toBe(500);
    expect(after.contingencyPercentage).toBe(before.contingencyPercentage);
    expect(after.total).toBe(5350);
  });

  it("no project-management percentage is added: total rises by exactly $350", () => {
    const before = estimateTotalling(10000);
    const after = withSpmLine(before, { country: "AU" });
    // An 8% PM charge would add 800 on top; the SPM line replaces it.
    expect(after.total - before.total).toBe(350);
  });

  it("is persisted as its own row by buildEstimateLines, and the rows sum to the total", () => {
    const after = withSpmLine(estimateTotalling(4000, 400), { country: "AU" });
    const rows = buildEstimateLines(after);
    const spmRows = rows.filter((r) => r.description === SPM_LINE_DESCRIPTION);
    expect(spmRows).toHaveLength(1);
    expect(spmRows[0].total).toBe(350);
    expect(spmRows[0].contingency).toBe(0);
    const sum = rows.reduce((s, r) => s + r.total, 0);
    expect(Math.round(sum * 100) / 100).toBe(after.total);
  });

  it("goes into the 'other' breakdown, leaving trade labour unchanged", () => {
    const before = estimateTotalling(3000);
    const after = withSpmLine(before, { country: "AU" });
    expect(after.breakdown.labour).toBe(before.breakdown.labour);
    expect(after.breakdown.other).toBe(before.breakdown.other + 350);
  });

  it("does not mutate the estimate it is given", () => {
    const before = estimateTotalling(3000);
    const snapshot = JSON.parse(JSON.stringify(before));
    withSpmLine(before, { country: "AU" });
    expect(before).toEqual(snapshot);
  });
});

describe("RA-8419 SPM line: applied once, measured before itself", () => {
  it("applying twice gives one SPM line and the same total", () => {
    const once = withSpmLine(estimateTotalling(3000), { country: "AU" });
    const twice = withSpmLine(once, { country: "AU" });
    expect(spmLines(twice)).toHaveLength(1);
    expect(twice.total).toBe(once.total);
  });

  it("an existing SPM line does not count towards the threshold", () => {
    // 2,400 of work + a stale 350 SPM line = 2,750; work alone is under 2,500.
    const stale = withSpmLine(estimateTotalling(3000), { country: "AU" });
    const under: CostEstimateResult = {
      ...stale,
      items: [item(2400), ...spmLines(stale)],
      subtotal: 2750,
      total: 2750,
      breakdown: { equipment: 0, labour: 2400, materials: 0, other: 350 },
    };
    const after = withSpmLine(under, { country: "AU" });
    expect(spmLines(after)).toHaveLength(0);
    expect(after.total).toBe(2400);
    expect(after.breakdown.other).toBe(0);
  });

  it("appending to saved rows: prior work counts, and no second SPM line is added", () => {
    // 1,500 already saved + 1,200 new = 2,700 -> SPM applies.
    const added = withSpmLine(estimateTotalling(1200), {
      country: "AU",
      priorTotalExGst: 1500,
    });
    expect(spmLines(added)).toHaveLength(1);
    const alreadyCharged = withSpmLine(estimateTotalling(1200), {
      country: "AU",
      priorTotalExGst: 1500,
      spmAlreadyCharged: true,
    });
    expect(spmLines(alreadyCharged)).toHaveLength(0);
  });
});

describe("RA-8419 SPM line: Australia only for now", () => {
  it.each(["NZ", "nz", " New Zealand "])("not applied for %j", (country) => {
    const after = withSpmLine(estimateTotalling(9000), { country });
    expect(spmLines(after)).toHaveLength(0);
    expect(after.total).toBe(9000);
  });

  it.each(["AU", "au", "Australia", null, undefined])(
    "applied for %j (RestoreAssist defaults to Australia)",
    (country) => {
      const after = withSpmLine(estimateTotalling(9000), { country });
      expect(spmLines(after)).toHaveLength(1);
    },
  );
});

describe("RA-8419 SPM line: rate is a default each company can change", () => {
  it("uses a company hourly rate when given", () => {
    const after = withSpmLine(estimateTotalling(3000), {
      country: "AU",
      hourlyRate: 190,
    });
    const [spm] = spmLines(after);
    expect(spm.rate).toBe(190);
    expect(spm.subtotal).toBe(380);
  });

  it("rejects a non-positive or non-finite rate instead of pricing at $0", () => {
    for (const hourlyRate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        withSpmLine(estimateTotalling(3000), { country: "AU", hourlyRate }),
      ).toThrow();
    }
  });
});
