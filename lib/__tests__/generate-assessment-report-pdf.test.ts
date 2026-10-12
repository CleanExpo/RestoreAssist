import { afterEach, describe, expect, it, vi } from "vitest";
import dns from "node:dns";
import { generateAssessmentReportPDF } from "../generate-assessment-report-pdf";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// SSRF regression: the assessment PDF embeds a tenant-controlled `businessLogo`
// URL. The generator must only server-side-fetch public http(s) URLs — a
// loopback / link-local / RFC1918 URL must be skipped (logo omitted) rather
// than fetched, so it can't be used to probe internal services (e.g. the cloud
// metadata endpoint). Fetch failures already fall back gracefully to no logo.

function baseData(businessLogo: string) {
  return {
    report: { id: "abc123def", reportNumber: "R-001" },
    analysis: {},
    tier1: {},
    tier2: {},
    tier3: {},
    stateInfo: {},
    businessInfo: { businessName: "Acme Restoration", businessLogo },
  };
}

describe("generateAssessmentReportPDF — logo SSRF guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1/logo.png",
    "http://localhost/logo.png",
    "http://10.0.0.5/logo.png",
    "http://192.168.1.10/logo.png",
    "file:///etc/passwd",
    "not-a-url",
  ])("does not fetch a non-public logo URL (%s)", async (logoUrl) => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network should not be reached"));

    const bytes = await generateAssessmentReportPDF(baseData(logoUrl) as any);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("does fetch a public https logo URL", async () => {
    // Resolve the host to a public address so the SSRF gate passes.
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      // Invalid image bytes — the embed will throw and be caught, but the
      // fetch itself must be attempted for a public URL.
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    const bytes = await generateAssessmentReportPDF(
      baseData("https://cdn.example.com/logo.png") as any,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("https://cdn.example.com/logo.png");
    expect(bytes).toBeInstanceOf(Uint8Array);
  });
});

describe("assessment PDF keeps unassessed hazards unknown", () => {
  async function pdfText(data: unknown) {
    const bytes = await generateAssessmentReportPDF(data as any);
    const loadingTask = getDocument({ data: bytes, useSystemFonts: true });
    const pdf = await loadingTask.promise;
    try {
      const page = await pdf.getPage(1);
      const content = await page.getTextContent();
      return content.items.map((item: any) => item.str).join(" ");
    } finally {
      await loadingTask.destroy();
    }
  }

  it("does not turn a suspected hazard into a positive screen or water Cat 3 into mould Cat 3", async () => {
    const data = baseData("");
    data.report = {
      ...data.report,
      waterCategory: "Category 3",
      biologicalMouldDetected: true,
    } as any;
    data.tier1 = { T1_Q7_hazards: ["Meth suspected"] };
    const text = await pdfText(data);
    expect(text).toContain("METH: Not assessed");
    expect(text).toContain("BIO/MOULD: POSITIVE");
    expect(text).not.toContain("BIO/MOULD: POSITIVE - CAT 3");
  });

  it("preserves an explicitly recorded negative screen", async () => {
    const data = baseData("");
    data.report = { ...data.report, methamphetamineScreen: "NEGATIVE" } as any;
    expect(await pdfText(data)).toContain("METH: NEGATIVE");
  });
});
