import { describe, it, expect } from "vitest";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { appendSketchPages } from "../append-sketch-pages";

// A valid 1x1 transparent PNG — pdf-lib's embedPng must be able to parse it.
const PNG_1x1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** Distinctive 17×13 gold PNG — proves the embed is the sketch, not a blank page. */
const PNG_17x13 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABEAAAANCAIAAADAGxJNAAAAFklEQVR42mO4srSEVMQwqmdUDx31AABidKmpPSOQawAAAABJRU5ErkJggg==";

function pngIhdrSize(bytes: Uint8Array): { w: number; h: number } | null {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: view.getUint32(16), h: view.getUint32(20) };
}

async function embeddedPngSizes(
  pdfBytes: Uint8Array,
): Promise<Array<{ w: number; h: number }>> {
  const doc = await PDFDocument.load(pdfBytes);
  const sizes: Array<{ w: number; h: number }> = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    try {
      const size = pngIhdrSize(decodePDFRawStream(obj).decode());
      if (size) sizes.push(size);
    } catch {
      /* non-PNG stream */
    }
  }
  return sizes;
}

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

  it("embeds the floor-plan PNG on the appended page (not a blank/crop-empty page)", async () => {
    const base = await basePdf(1);
    const out = await appendSketchPages(
      base,
      [{ label: "Ground Floor", pngDataUrl: PNG_17x13, fabricJson: null }],
      { reportNumber: "RPT-1" },
    );
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(await embeddedPngSizes(out)).toContainEqual({ w: 17, h: 13 });
  });

  it("returns the original bytes unchanged when there are no floors", async () => {
    const base = await basePdf(2);
    const out = await appendSketchPages(base, [], {});
    expect(out).toBe(base);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
  });
});
