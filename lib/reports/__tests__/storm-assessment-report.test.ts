import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { generateIICRCReportPDF } from "@/lib/generate-iicrc-report-pdf";

// RA-8592: a saved StormDamageAssessment must reach the report the insurer
// receives. Asbestos risk and engineer clearance go in the site safety
// section, not only in the findings rows.

async function pdfText(data: Parameters<typeof generateIICRCReportPDF>[0]): Promise<string> {
  const bytes = await generateIICRCReportPDF(data, {});
  const parser = new PDFParse({ data: bytes });
  return (await parser.getText()).text;
}

const FILLED = {
  bomEventReference: "BOM-QLD-2026-114",
  windSpeedKmh: 118,
  eventType: "HAIL",
  eventTimestamp: "2026-11-02T05:30:00.000Z",
  roofMaterialType: "TERRACOTTA",
  roofDamageAreaM2: 42.5,
  damagePenetration: "PARTIAL",
  waterIngressPoints: "Ridge capping above bedroom 2",
  engineerClearanceRequired: true,
  emergencyTarpingCompleted: true,
  emergencyTarpingM2: 30,
  emergencyTarpingTimestamp: "2026-11-02T09:00:00.000Z",
  waterCategory: "CAT_2",
  asbestosRiskFlag: true,
};

describe("report PDF storm assessment (RA-8592)", () => {
  it("prints the saved storm values", async () => {
    const text = await pdfText({ id: "storm-fixture", claimType: "STORM", stormAssessment: FILLED });
    expect(text).toContain("Storm assessment");
    expect(text).toContain("BOM-QLD-2026-114");
    expect(text).toContain("118 km/h");
    expect(text).toContain("Hail");
    expect(text).toContain("Terracotta");
    expect(text).toContain("42.5 m2");
    expect(text).toContain("Ridge capping above bedroom 2");
    expect(text).toContain("30 m2");
    expect(text).toContain("Category 2");
  }, 30_000);

  it("puts asbestos risk and engineer clearance under the site safety heading", async () => {
    const text = await pdfText({ id: "storm-safety-fixture", claimType: "STORM", stormAssessment: FILLED });
    const safety = text.indexOf("Site safety");
    expect(safety).toBeGreaterThan(-1);
    const after = text.slice(safety);
    expect(after).toMatch(/Asbestos risk:\s*Flagged/);
    expect(after).toMatch(/Structural engineer clearance:\s*Required/);
  }, 30_000);

  it("never prints a 'No' for an unticked safety flag (default false is not an answer)", async () => {
    const text = await pdfText({
      id: "storm-unflagged-fixture",
      claimType: "STORM",
      stormAssessment: { ...FILLED, asbestosRiskFlag: false, engineerClearanceRequired: false },
    });
    expect(text).not.toContain("Asbestos risk:");
    expect(text).not.toContain("Structural engineer clearance:");
    expect(text).not.toContain("Site safety");
  }, 30_000);

  it("prints only the fields that were filled, with no N/A rows", async () => {
    const text = await pdfText({
      id: "storm-partial-fixture",
      claimType: "STORM",
      stormAssessment: { windSpeedKmh: 90 },
    });
    expect(text).toContain("90 km/h");
    expect(text).not.toContain("BOM event reference");
    expect(text).not.toMatch(/\bN\/A\b/);
  }, 30_000);

  it("prints no storm or safety section when there is no record (negative control)", async () => {
    const text = await pdfText({ id: "storm-empty-fixture", claimType: "STORM", stormAssessment: null });
    expect(text).not.toContain("Storm assessment");
    expect(text).not.toContain("Site safety");
  }, 30_000);
});
