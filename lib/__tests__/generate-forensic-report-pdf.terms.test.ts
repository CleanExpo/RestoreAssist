import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PDFParse } from "pdf-parse";
import { generateForensicReportPDF } from "../generate-forensic-report-pdf";

// Same minimal fixture as generate-forensic-report-pdf.ssrf.test.ts.
function baseData(businessLogo: string) {
  return {
    report: { reportNumber: "RPT-1" },
    analysis: {},
    tier1: {},
    tier2: {},
    tier3: {},
    stateInfo: {},
    businessInfo: { businessName: "Acme", businessLogo },
  };
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  const result = await parser.getText();
  return result.text;
}

describe("generateForensicReportPDF — terms summary", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prints a referral line and none of the scrambled terms copy", async () => {
    const pdf = await generateForensicReportPDF(baseData(""));
    const text = await extractPdfText(pdf);

    expect(text).toContain("Terms of engagement are supplied separately");
    expect(text).not.toContain("paytritents");
    expect(text).not.toContain("stanlove");
    expect(text).not.toContain("Rensdialen");
  });
});
