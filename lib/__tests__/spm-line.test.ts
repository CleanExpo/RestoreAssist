import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { isSpmLine, spmRecommendation, SPM_LINE_DESCRIPTION } from "@/lib/billing/spm-line";

describe("SPM is a recommendation, never an inserted charge", () => {
  it.each([[2499.99, false], [2500, false], [2500.01, true], [3000, true]])("boundary %s", (total, recommended) => {
    const rows = [{ total, lineKind: null }];
    const before = structuredClone(rows);
    const result = spmRecommendation(rows, "AU");
    expect(result.recommended).toBe(recommended);
    expect(result.workTotalExGst).toBe(total);
    expect(result.line).toEqual(recommended ? { description: SPM_LINE_DESCRIPTION, quantity: 2, unit: "hr", rate: 175, total: 350 } : null);
    expect(result.reason).toEqual(recommended ? expect.any(String) : null);
    expect(rows).toEqual(before);
  });
  it.each(["NZ", "nz", "NZL", " New Zealand "])("never recommends for %s", country => {
    expect(spmRecommendation([{ total: 9000 }], country).recommended).toBe(false);
  });
  it.each([null, undefined, "AU", "Australia"])("defaults %s to AU", country => {
    expect(spmRecommendation([{ total: 3000 }], country).recommended).toBe(true);
  });
  it("sums Decimal values without binary boundary errors", () => {
    expect(spmRecommendation([{ total: new Decimal("2499.99") }, { total: new Decimal("0.01") }], "AU").recommended).toBe(false);
    expect(spmRecommendation([{ total: "2499.99" }, { total: "0.02" }], "AU").recommended).toBe(true);
  });
  it("excludes an added SPM row from work and hides the card", () => {
    expect(spmRecommendation([{ total: 3000 }, { total: 350, lineKind: "SPM" }], "AU")).toEqual({ recommended: false, workTotalExGst: 3000, line: null, reason: null });
  });
  it("wording does not identify a line", () => {
    const rows = [{ description: SPM_LINE_DESCRIPTION, total: 3000, lineKind: null }];
    expect(spmRecommendation(rows, "AU").recommended).toBe(true);
    expect(isSpmLine(rows[0])).toBe(false);
    expect(isSpmLine({ lineKind: "SPM" })).toBe(true);
  });
  it("builds a priced recommendation from the supplied rate", () => {
    expect(spmRecommendation([{ total: 3000 }], "AU", 190).line?.total).toBe(380);
    for (const rate of [0, -1, NaN, Infinity]) expect(() => spmRecommendation([], "AU", rate)).toThrow();
  });
});
