/**
 * RA-7665 / RA-8282: a report names the IICRC standard its claim type is
 * aligned to, as a reference, and never claims compliance.
 *
 * The PDF half generates a real report PDF and searches its text, which is
 * the RA-7665 verifier ("a text search of the sample PDF for 'Compliant with
 * IICRC' finds 0").
 */
import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";
import {
  alignedStandardForClaimType,
  reportAlignedStandard,
  standardCite,
  standardDesignation,
} from "../nir-standards-mapping";
import {
  generateIICRCReportPDF,
  reportPdfFooterLine,
  reportPdfHeaderStrap,
} from "../generate-iicrc-report-pdf";

async function pdfText(bytes: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  const result = await parser.getText();
  return result.text;
}

describe("alignedStandardForClaimType", () => {
  it.each([
    ["WATER", "S500"],
    ["Water Damage", "S500"],
    ["MOULD", "S520"],
    ["Mould", "S520"],
    ["FIRE", "S700"],
    ["FIRE_SMOKE", "S700"],
    ["BIOHAZARD", "S540"],
  ] as const)("%s -> %s", (claimType, std) => {
    expect(alignedStandardForClaimType(claimType)).toBe(std);
  });

  it.each(["STORM", "CONTENTS", "ODOUR", "CARPET", "HVAC", "ASBESTOS", ""])(
    "%s has no single standard, so none is named",
    (claimType) => {
      expect(alignedStandardForClaimType(claimType)).toBeNull();
    },
  );
});

describe("reportAlignedStandard", () => {
  it("prefers the inspection claim type over the report hazard label", () => {
    expect(reportAlignedStandard("FIRE", "Water")).toBe("S700");
  });
  it("falls back to the hazard label", () => {
    expect(reportAlignedStandard(null, "Mould")).toBe("S520");
  });
  it("keeps S500 for a legacy report with neither", () => {
    expect(reportAlignedStandard(null, null)).toBe("S500");
  });
  it("names no standard for a storm report", () => {
    expect(reportAlignedStandard("STORM", null)).toBeNull();
  });
});

describe("PDF header and footer wording", () => {
  it("references the registry edition and never says compliant", () => {
    for (const std of ["S500", "S520", "S700", "S540"] as const) {
      const header = reportPdfHeaderStrap(std);
      const footer = reportPdfFooterLine(std);
      expect(header).toContain(standardCite(std));
      expect(footer).toContain(standardDesignation(std));
      expect(`${header} ${footer}`).not.toMatch(/complian|complies/i);
    }
    expect(reportPdfHeaderStrap(null)).not.toMatch(/IICRC|S\d{3}/);
    expect(reportPdfFooterLine(null)).not.toMatch(/IICRC|S\d{3}/);
  });
});

describe("generated report PDF (RA-7665 verifier)", () => {
  it("a water report references S500 and claims no compliance", async () => {
    const text = await pdfText(
      await generateIICRCReportPDF({ id: "ra7665-water", claimType: "WATER" }),
    );
    expect(text).toContain(`Aligned to IICRC ${standardCite("S500")}`);
    expect(text).toContain(`References ${standardDesignation("S500")}`);
    expect(text).not.toMatch(/Compliant with IICRC/i);
    expect(text).not.toMatch(/S500[^\n]{0,12}compliant/i);
  });

  it("a mould report references S520, not S500", async () => {
    const text = await pdfText(
      await generateIICRCReportPDF({ id: "ra8282-mould", claimType: "MOULD" }),
    );
    expect(text).toContain(`Aligned to IICRC ${standardCite("S520")}`);
    expect(text).not.toContain(`Aligned to IICRC ${standardCite("S500")}`);
    expect(text).not.toMatch(/complian/i);
  });

  it("a fire report references S700", async () => {
    const text = await pdfText(
      await generateIICRCReportPDF({ id: "ra8282-fire", claimType: "FIRE" }),
    );
    expect(text).toContain(`Aligned to IICRC ${standardCite("S700")}`);
    expect(text).not.toContain(`Aligned to IICRC ${standardCite("S500")}`);
  });
});
