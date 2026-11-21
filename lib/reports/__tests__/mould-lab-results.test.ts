import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { generateIICRCReportPDF } from "@/lib/generate-iicrc-report-pdf";
import { NOT_TESTED, mouldLabResultRows, shouldPrintMouldLabResults } from "../mould-lab-results";

async function pdfText(data: Parameters<typeof generateIICRCReportPDF>[0]): Promise<string> {
  const bytes = await generateIICRCReportPDF(data, {});
  const parser = new PDFParse({ data: bytes });
  return (await parser.getText()).text;
}

const rows = (a: Parameters<typeof mouldLabResultRows>[0]) => Object.fromEntries(mouldLabResultRows(a));

describe("mould lab result rows (RA-7686)", () => {
  it("prints Not tested for every empty field, never zero or blank", () => {
    for (const v of Object.values(rows({}))) expect(v).toBe(NOT_TESTED);
  });

  it("computes the indoor/outdoor ratio and labels it as context only", () => {
    const r = rows({ sporeCountPreRemediation: 4200, sporeCountPostRemediation: 350, outdoorBaselineCount: 700 });
    expect(r["Indoor/outdoor ratio, before:"]).toBe("6.00 (context only, not a health threshold)");
    expect(r["Indoor/outdoor ratio, after:"]).toBe("0.50 (context only, not a health threshold)");
  });

  it("will not divide by a zero or missing outdoor baseline", () => {
    expect(rows({ sporeCountPreRemediation: 10, outdoorBaselineCount: 0 })["Indoor/outdoor ratio, before:"]).toBe(NOT_TESTED);
    expect(rows({ sporeCountPreRemediation: 10 })["Indoor/outdoor ratio, before:"]).toBe(NOT_TESTED);
  });

  it("keeps a recorded zero count as zero, not Not tested", () => {
    expect(rows({ sporeCountPostRemediation: 0 })["Indoor count, after:"]).toBe("0 spores/m3");
  });

  it("never prints an automatic pass or fail against the criterion", () => {
    const all = mouldLabResultRows({
      clearanceCriterion: "Indoor below outdoor, same genera",
      sporeCountPostRemediation: 1,
      outdoorBaselineCount: 1000,
    })
      .map(([, v]) => v)
      .join(" ");
    expect(all).not.toMatch(/\b(PASS|FAIL|passed|failed|safe)\b/i);
    expect(all).toContain("Indoor below outdoor, same genera (as recorded;");
  });

  it("spells comparison operators out so the PDF font cannot drop them", () => {
    expect(rows({ clearanceCriterion: "Indoor ≤ 500 spores/m3" })["Clearance criterion:"]).toMatch(/^Indoor <= 500 spores\/m3 /);
    expect(rows({ clearanceCriterion: "Ratio ≥ 1" })["Clearance criterion:"]).toMatch(/^Ratio >= 1 /);
    expect(rows({ clearanceCriterion: "Indoor < outdoor" })["Clearance criterion:"]).toMatch(/^Indoor < outdoor /);
  });

  it("prints only for mould jobs", () => {
    expect(shouldPrintMouldLabResults(null, "WATER")).toBe(false);
    expect(shouldPrintMouldLabResults(undefined, null)).toBe(false);
    expect(shouldPrintMouldLabResults(null, "mould")).toBe(true);
    expect(shouldPrintMouldLabResults({ labName: "X" }, "WATER")).toBe(true);
  });
});

describe("report PDF section 6A (RA-7686 acceptance)", () => {
  it("prints the heading and the lab name on a mould job", async () => {
    const text = await pdfText({
      id: "mould-fixture",
      claimType: "MOULD",
      mouldAssessment: { labName: "Harbour Test Laboratory", sporeCountPreRemediation: 4200, outdoorBaselineCount: 700 },
    });
    expect(text).toContain("Sampling & laboratory results");
    expect(text).toContain("Harbour Test Laboratory");
    expect(text).toContain("Not tested");
  }, 30_000);

  it("keeps a ≤ criterion meaning-preserving in the PDF text", async () => {
    const text = await pdfText({
      id: "mould-criterion-fixture",
      claimType: "MOULD",
      mouldAssessment: { clearanceCriterion: "Indoor ≤ 500 spores/m3" },
    });
    expect(text).toContain("Indoor <= 500 spores/m3");
    expect(text).not.toMatch(/Indoor\s+500 spores/);
  }, 30_000);

  it("prints no such section on a water-only job (negative control)", async () => {
    const text = await pdfText({ id: "water-fixture", claimType: "WATER", mouldAssessment: null });
    expect(text).not.toContain("Sampling & laboratory results");
  }, 30_000);
});
