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
