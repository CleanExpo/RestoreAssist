/**
 * RA-8547 — the rendered forensic report PDF must not invent moisture rows.
 * Row-builder cases live in lib/reports/__tests__/forensic-moisture-rows.test.ts;
 * this suite checks the printed page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PDFParse } from "pdf-parse";
import { generateForensicReportPDF } from "../generate-forensic-report-pdf";

function baseData(extra: Record<string, unknown> = {}) {
  return {
    report: { reportNumber: "RPT-1" },
    analysis: {},
    tier1: {},
    tier2: {},
    tier3: {},
    stateInfo: {},
    businessInfo: { businessName: "Acme", businessLogo: "" },
    ...extra,
  };
}

async function pdfText(data: ReturnType<typeof baseData>): Promise<string> {
  const bytes = await generateForensicReportPDF(data as never);
  const result = await new PDFParse({ data: bytes }).getText();
  return result.text.replace(/\s+/g, " ");
}

function moistureSection(text: string): string {
  const start = text.indexOf("3. Material Moisture Readings");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = text.indexOf("4. Psychrometric", start);
  return text.slice(start, end === -1 ? start + 600 : end);
}

describe("generateForensicReportPDF — moisture readings (RA-8547)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says no readings were recorded, with no placeholder row or verdict", async () => {
    const section = moistureSection(await pdfText(baseData()));
    expect(section).toContain(
      "No moisture readings were recorded for this job.",
    );
    expect(section).not.toContain("Sample Location");
    expect(section).not.toContain("12%");
    expect(section).not.toMatch(/\bDRY\b|\bWET\b/);
  });

  it("prints no rows from AI scope areas", async () => {
    const section = moistureSection(
      await pdfText(
        baseData({
          scopeAreas: [{ name: "Lounge", materials: ["Carpet"], moisture: 35 }],
        }),
      ),
    );
    expect(section).toContain(
      "No moisture readings were recorded for this job.",
    );
    expect(section).not.toContain("Lounge");
    expect(section).not.toMatch(/\bDRY\b|\bWET\b/);
  });

  it("prints 'Not recorded' for a missing dry standard and status", async () => {
    const section = moistureSection(
      await pdfText(
        baseData({
          tier2: {
            T2_Q1_moistureReadings: [
              { location: "Laundry", material: "Plasterboard", reading: 45 },
            ],
          },
        }),
      ),
    );
    expect(section).toContain("Laundry");
    expect(section).toContain("Not recorded");
    expect(section).not.toContain("12%");
    expect(section).not.toMatch(/\bDRY\b|\bWET\b/);
  });

  it("prints every saved reading, or says how many are not shown (8 readings)", async () => {
    const locations = Array.from({ length: 8 }, (_, i) => `Bay ${i + 1}x`);
    const section = moistureSection(
      await pdfText(
        baseData({
          tier2: {
            T2_Q1_moistureReadings: locations.map((location, i) => ({
              location,
              material: "Plasterboard",
              reading: 30 + i,
            })),
          },
        }),
      ),
    );
    const missing = locations.filter((loc) => !section.includes(loc));
    if (missing.length > 0) {
      expect(section).toContain(
        `${missing.length} further saved moisture readings are not shown in this table.`,
      );
    }
  });
});

function psychrometricSection(text: string): string {
  const start = text.indexOf("4. Psychrometric Data");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = text.indexOf("5. Project Timeline", start);
  return text.slice(start, end === -1 ? start + 600 : end);
}

describe("generateForensicReportPDF — saved-readings reader (RA-8548)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prints a reading saved in the NIR envelope (initial-entry / nir-data writer)", async () => {
    const section = moistureSection(
      await pdfText(
        baseData({
          report: {
            reportNumber: "RPT-1",
            moistureReadings: JSON.stringify({
              moistureReadings: [
                {
                  location: "Envelope Kitchen",
                  surfaceType: "Plasterboard",
                  moistureLevel: 28,
                  depth: "Surface",
                },
              ],
              affectedAreas: [{ roomZoneId: "Kitchen", affectedAreaSqm: 12 }],
              scopeItems: [],
              photos: [],
            }),
          },
        }),
      ),
    );
    expect(section).toContain("Envelope Kitchen");
    expect(section).toContain("28");
    expect(section).not.toContain("No moisture readings were recorded");
  });

  it("prints the tier 2 free-text moisture answer when no rows exist", async () => {
    const section = moistureSection(
      await pdfText(
        baseData({
          tier2: { T2_Q1_moistureReadings: "Ensuite tile subfloor 18% MC" },
        }),
      ),
    );
    expect(section).toContain("Ensuite tile subfloor 18% MC");
    expect(section).not.toContain(
      "No moisture readings were recorded for this job.",
    );
  });

  it("keeps the tier 2 free-text answer when report rows exist", async () => {
    const section = moistureSection(
      await pdfText(
        baseData({
          report: {
            reportNumber: "RPT-1",
            moistureReadings: JSON.stringify([
              {
                location: "Row Hall",
                material: "Timber",
                moistureContent: "22",
              },
            ]),
          },
          tier2: { T2_Q1_moistureReadings: "Ensuite tile subfloor 18% MC" },
        }),
      ),
    );
    expect(section).toContain("Row Hall");
    expect(section).toContain("Ensuite tile subfloor 18% MC");
  });

  it("prints grainsPoundDry and dew point from the saved assessment", async () => {
    const section = psychrometricSection(
      await pdfText(
        baseData({
          psychrometricAssessment: {
            waterClass: "Class 2",
            temperature: 26.4,
            humidity: 72,
            dewPoint: 21.1,
            grainsPoundDry: 98.2,
            grainsTarget: 52,
            systemType: "LGR Dehumidification",
          },
        }),
      ),
    );
    expect(section).toContain("98.2");
    expect(section).toContain("21.1");
    expect(section).not.toContain("52");
  });

  it("prints no psychrometric row from water class and system type alone", async () => {
    const section = psychrometricSection(
      await pdfText(
        baseData({
          psychrometricAssessment: { waterClass: 3, systemType: "open" },
        }),
      ),
    );
    expect(section).toContain(
      "No psychrometric readings were recorded for this job.",
    );
    expect(section).not.toContain("N/A");
    expect(section).not.toContain("Ambient");
  });

  it("invents no psychrometric row when nothing was saved", async () => {
    const section = psychrometricSection(await pdfText(baseData()));
    expect(section).toContain(
      "No psychrometric readings were recorded for this job.",
    );
    expect(section).not.toContain("N/A");
  });

  it("prints seed psychrometric names (indoorTempC, indoorRH, dewPointC, grainsPP)", async () => {
    const section = psychrometricSection(
      await pdfText(
        baseData({
          report: {
            reportNumber: "RPT-1",
            psychrometricReadings: JSON.stringify([
              {
                day: 1,
                indoorTempC: 22.5,
                indoorRH: 68.5,
                dewPointC: 15.8,
                grainsPP: 72.4,
                status: "ABOVE_TARGET",
              },
            ]),
          },
        }),
      ),
    );
    expect(section).toContain("22.5");
    expect(section).toContain("68.5");
    expect(section).toContain("15.8");
    expect(section).toContain("72.4");
  });
});

describe("generateForensicReportPDF — scope items (RA-8547 follow-up)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("states no saturation or removal finding from an AI area's moisture figure", async () => {
    const text = await pdfText(
      baseData({
        scopeAreas: [{ name: "Lounge", materials: ["Carpet"], moisture: 25 }],
      }),
    );
    expect(text).toContain("Lounge");
    expect(text).not.toMatch(/saturation requiring removal/i);
    expect(text).not.toMatch(/indicates saturation/i);
  });
});
