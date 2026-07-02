import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { appendSketchPages } from "../append-sketch-pages";

// A valid 1x1 transparent PNG — pdf-lib's embedPng must be able to parse it.
const PNG_1x1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function basePdf(pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return doc.save();
}

describe("appendSketchPages", () => {
  it("appends one page per floor to the report PDF", async () => {
    const base = await basePdf(1);
    const floors = [
      { label: "Ground Floor", pngDataUrl: PNG_1x1, fabricJson: null },
      { label: "Level 1", pngDataUrl: PNG_1x1, fabricJson: null },
    ];

    const out = await appendSketchPages(base, floors, {
      reportNumber: "RPT-1",
    });

    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
  });

  it("returns the original bytes unchanged when there are no floors", async () => {
    const base = await basePdf(2);
    const out = await appendSketchPages(base, [], {});
    expect(out).toBe(base);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
  });
});
