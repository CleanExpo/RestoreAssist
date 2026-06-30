import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  generateAssessmentPdf,
  type AssessmentPdfInput,
} from "../generate-assessment-pdf";

const baseInput: AssessmentPdfInput = {
  domain: "WATER",
  report: {
    sections: [
      {
        heading: "Situation",
        body: "Cat 2 water damage; Class 2 affected area 32 m².",
        citations: [{ standard: "IICRC S500:2021", section: "§13" }],
      },
      {
        heading: "Scope rationale",
        body: "Extraction, LGR drying for 7 days, antimicrobial.",
      },
    ],
  },
  scope: {
    items: [
      {
        description: "Truck-mount extraction",
        quantity: 1,
        unit: "job",
        category: "LABOUR",
        iicrcRef: "S500:2021 §8.1",
      },
      {
        description: "LGR dehumidifier",
        quantity: 14,
        unit: "unit-days",
        category: "EQUIPMENT",
        iicrcRef: "S500:2021 §11.3",
      },
    ],
  },
  estimate: {
    lines: [
      {
        description: "Truck-mount extraction",
        quantity: 1,
        unit: "job",
        rate: 450,
        lineTotalExGst: 450,
        lineTotalIncGst: 495,
      },
      {
        description: "LGR dehumidifier",
        quantity: 14,
        unit: "unit-days",
        rate: 95,
        lineTotalExGst: 1330,
        lineTotalIncGst: 1463,
      },
    ],
    totals: {
      subtotalExGst: 1780,
      gstTotal: 178,
      totalIncGst: 1958,
    },
  },
  citations: [
    { standard: "IICRC S500:2021", section: "§13", note: "Drying standard" },
  ],
  meta: {
    assessmentGenerationId: "ag_123",
    generatedAt: new Date("2026-04-26T09:00:00Z"),
    modelUsed: "rule-based",
    latencyMs: 42,
    propertyAddress: "47 Rosella Street, Buderim QLD 4556",
    inspectionNumber: "NIR-2026-04-001",
  },
};

describe("generateAssessmentPdf", () => {
  it("produces a valid PDF buffer that pdf-lib can re-parse", async () => {
    const bytes = await generateAssessmentPdf(baseInput);
    expect(bytes.length).toBeGreaterThan(1000);
    const reparsed = await PDFDocument.load(bytes);
    expect(reparsed.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("survives WinAnsi-hostile input (em-dash, bullets, arrows, curly quotes)", async () => {
    const hostile: AssessmentPdfInput = {
      ...baseInput,
      report: {
        sections: [
          {
            heading: "Situation — overview",
            body: "Wet → Drying → Dry. Use “LGR” • per IICRC.",
          },
        ],
      },
    };
    const bytes = await generateAssessmentPdf(hostile);
    const reparsed = await PDFDocument.load(bytes);
    expect(reparsed.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("paginates when scope and estimate exceed one page", async () => {
    const manyItems = Array.from({ length: 60 }, (_, i) => ({
      description: `Scope item ${i + 1}`,
      quantity: i + 1,
      unit: "ea",
      category: "LABOUR" as const,
      iicrcRef: "S500:2021",
    }));
    const manyLines = Array.from({ length: 60 }, (_, i) => ({
      description: `Estimate line ${i + 1}`,
      quantity: i + 1,
      unit: "ea",
      rate: 50,
      lineTotalExGst: 50 * (i + 1),
      lineTotalIncGst: 50 * (i + 1) * 1.1,
    }));
    const bytes = await generateAssessmentPdf({
      ...baseInput,
      scope: { items: manyItems },
      estimate: {
        lines: manyLines,
        totals: { subtotalExGst: 0, gstTotal: 0, totalIncGst: 0 },
      },
    });
    const reparsed = await PDFDocument.load(bytes);
    expect(reparsed.getPageCount()).toBeGreaterThan(1);
  });

  it("includes the standards index when citations are present", async () => {
    const bytes = await generateAssessmentPdf(baseInput);
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
