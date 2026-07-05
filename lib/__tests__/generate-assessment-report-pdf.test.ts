import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAssessmentReportPDF } from "../generate-assessment-report-pdf";

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
