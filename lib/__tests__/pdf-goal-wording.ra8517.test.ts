import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { generateIICRCReportPDF } from "@/lib/generate-iicrc-report-pdf";

// RA-8517 item 7 (remaining parts). The Section 4 footer was fixed in RA-8508;
// Section 9 still said "Replace it" after "The values above" and printed
// material names in lower case while Section 4 capitalises them.

async function pdfText(moistureReadings: unknown[]): Promise<string> {
  const bytes = await generateIICRCReportPDF(
    { id: "ra8517-7b", reportNumber: "RA8517-7B", moistureReadings } as never,
    {},
  );
  const parser = new PDFParse({ data: bytes });
  return (await parser.getText()).text.replace(/\s+/g, " ");
}

function section9(text: string): string {
  const start = text.indexOf("SECTION 9");
  const end = text.indexOf("SECTION 10");
  return text.slice(start, end > start ? end : undefined);
}

describe("PDF Section 9 wording (RA-8517 item 7)", () => {
  it("uses the plural when several guide values are shown and no reference was recorded", async () => {
    const s9 = section9(
      await pdfText([
        { location: "Kitchen", material: "Timber", surfaceType: "Timber", moistureLevel: 22, unit: null },
        { location: "Lounge", material: "Plasterboard", surfaceType: "Plasterboard", moistureLevel: 3, unit: null },
      ]),
    );
    expect(s9).toContain("The values above are a starting guide only");
    expect(s9).toContain("Replace them with reference readings");
    expect(s9).not.toContain("Replace it with");
  });

  it("capitalises material names as Section 4 does", async () => {
    const s9 = section9(
      await pdfText([
        { location: "Kitchen", material: "Timber", surfaceType: "Timber", moistureLevel: 22, unit: null },
      ]),
    );
    // The PDF font drops "≤" on extraction, so match the number only.
    expect(s9).toMatch(/Timber \S*19% MC/);
    expect(s9).not.toMatch(/\btimber \S*19% MC/);
  });

  it("with a reference reading, the reference row is capitalised and its wording unchanged", async () => {
    const s9 = section9(
      await pdfText([
        { location: "Spare room", material: "Timber", surfaceType: "Timber", moistureLevel: 12, unit: null, isBaseline: true },
        { location: "Kitchen", material: "Timber", surfaceType: "Timber", moistureLevel: 22, unit: null },
      ]),
    );
    expect(s9).toContain("Reference readings were taken on unaffected like material in the same building.");
    expect(s9).toMatch(/Timber \S*12% MC Reference reading/);
  });
});
