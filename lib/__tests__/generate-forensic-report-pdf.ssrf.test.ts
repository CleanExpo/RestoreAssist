import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import dns from "node:dns";
import { generateForensicReportPDF } from "../generate-forensic-report-pdf";

// Regression: businessInfo.businessLogo is user-controlled. The generator must
// NOT perform a server-side fetch on private/loopback/non-http hosts (SSRF).
// The logo is silently skipped on validation failure; the PDF still renders.

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

describe("generateForensicReportPDF — logo SSRF guard", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/", // cloud metadata
    "http://127.0.0.1:8080/admin", // loopback
    "http://10.0.0.1/internal", // RFC1918
    "http://localhost/logo.png", // loopback host
    "file:///etc/passwd", // non-http scheme
  ])("never fetches the private/unsafe logo URL %s", async (url) => {
    const pdf = await generateForensicReportPDF(baseData(url));
    expect(fetchSpy).not.toHaveBeenCalled();
    // PDF still produced despite the skipped logo.
    expect(pdf.length).toBeGreaterThan(0);
  });

  it("fetches a public https logo URL", async () => {
    // Resolve the host to a public address so the SSRF gate passes
    // deterministically (no real DNS in CI).
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
    await generateForensicReportPDF(
      baseData("https://res.cloudinary.com/x/acme.png"),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://res.cloudinary.com/x/acme.png",
    );
  });
});
