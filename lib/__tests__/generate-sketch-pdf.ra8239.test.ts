/**
 * RA-8239 — the clean structured floor-plan PDF, from saved geometry.
 *
 * Acceptance: a PDF from a saved downstairs square (9 m²) and an upstairs
 * L-room (12 m²) is non-blank and prints each room name once with its
 * measured area. Unconfirmed AI suggestions, imported-plan reference rooms
 * and raw free text a technician did not put on the plan as a room never
 * appear. Labels here stay under the legend's 14-character cut, so a
 * "not printed" check cannot pass just because a long label was shortened.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { generateSketchPdf } from "@/lib/generate-sketch-pdf";

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  let raw = "";
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      try {
        raw += Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1");
      } catch {
        // An embedded image, not text.
      }
    }
  }
  return Array.from(raw.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g))
    .map((m) => Buffer.from(m[1], "hex").toString("latin1"))
    .join("\n");
}

const count = (haystack: string, needle: string) =>
  haystack.split(needle).length - 1;

/** 100 px per metre. */
const scale = { scaleConfig: { pxPerMetre: 100 } };

const lounge = {
  type: "polygon",
  points: [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 300 },
    { x: 0, y: 300 },
  ],
  data: {
    type: "room",
    id: "room-lounge",
    label: "Lounge",
    provenance: "operator_measured",
  },
};

/** 4 m x 4 m less a 2 m x 2 m notch = 12 m². */
const bedroom = {
  type: "polygon",
  points: [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 200 },
    { x: 200, y: 200 },
    { x: 200, y: 400 },
    { x: 0, y: 400 },
  ],
  data: {
    type: "room",
    id: "room-bed",
    label: "Main Bedroom",
    provenance: "operator_measured",
  },
};

const aiSuggestion = {
  type: "polygon",
  points: [
    { x: 500, y: 0 },
    { x: 800, y: 0 },
    { x: 800, y: 300 },
    { x: 500, y: 300 },
  ],
  data: {
    type: "room",
    id: "room-ai",
    label: "AI Study",
    provenance: "ai_suggested",
  },
};

const underlayRoom = {
  type: "polygon",
  points: [
    { x: 900, y: 0 },
    { x: 1100, y: 0 },
    { x: 1100, y: 200 },
    { x: 900, y: 200 },
  ],
  data: {
    type: "room",
    id: "room-src",
    label: "Src Room",
    provenance: "underlay_reference",
  },
};

const rawNote = {
  type: "textbox",
  text: "Private note",
  data: { type: "note" },
};

async function buildPdf() {
  return generateSketchPdf({
    floors: [
      {
        label: "Ground Floor",
        pngDataUrl: PNG_1PX,
        fabricJson: { ...scale, objects: [lounge] },
      },
      {
        label: "Upper Floor",
        pngDataUrl: PNG_1PX,
        fabricJson: {
          ...scale,
          objects: [bedroom, aiSuggestion, underlayRoom, rawNote],
        },
      },
    ],
    propertyAddress: "1 Test St",
    reportNumber: "NIR-8239",
  });
}

describe("RA-8239 clean structured floor-plan PDF", () => {
  it("is a non-blank PDF with a page per floor", async () => {
    const bytes = await buildPdf();
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    const text = await pdfText(bytes);
    expect(text).toContain("Ground Floor");
    expect(text).toContain("Upper Floor");
  });

  it("prints each measured room name once, with its measured area", async () => {
    const text = await pdfText(await buildPdf());
    expect(count(text, "Lounge")).toBe(1);
    expect(count(text, "Main Bedroom")).toBe(1);
    expect(text).toContain("Total measured area: 9.0 m²");
    // The unconfirmed 3 m x 3 m suggestion upstairs adds nothing to the total.
    expect(text).toContain("Total measured area: 12.0 m²");
  });

  it("never prints an unconfirmed suggestion, a reference room or raw free text", async () => {
    const text = await pdfText(await buildPdf());
    expect(text).not.toContain("AI Study");
    expect(text).not.toContain("Src Room");
    expect(text).not.toContain("Private note");
  });
});
