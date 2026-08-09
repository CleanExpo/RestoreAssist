import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  appendFloorPlanPagesWithDisclosure,
  appendSketchPages,
  floorPlanDisclosureLines,
} from "../append-sketch-pages";

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

describe("appendFloorPlanPagesWithDisclosure", () => {
  it("preserves good floors and discloses a named unembeddable floor", async () => {
    const base = await basePdf(1);
    const result = await appendFloorPlanPagesWithDisclosure(
      base,
      [
        {
          status: {
            label: "Ground Floor",
            source: "rendered_sketch",
            status: "included",
          },
          floor: {
            label: "Ground Floor",
            pngDataUrl: PNG_1x1,
            fabricJson: null,
          },
        },
        {
          status: {
            label: "Level 1",
            source: "rendered_sketch",
            status: "included",
          },
          floor: {
            label: "Level 1",
            pngDataUrl: "data:image/png;base64,bm90LWEtcG5n",
            fabricJson: null,
          },
        },
      ],
      { reportNumber: "RPT-1" },
    );

    const doc = await PDFDocument.load(result.pdfBytes);
    expect(doc.getPageCount()).toBe(3); // base + good floor + disclosure
    expect(result.floorPlans[0].status.status).toBe("included");
    expect(result.floorPlans[1]).toMatchObject({
      floor: null,
      status: {
        label: "Level 1",
        status: "unavailable",
        reason:
          "The stored floor-plan image could not be embedded at report generation time.",
      },
    });
  });

  it("formats unavailable floor names and statuses for the disclosure page", () => {
    expect(
      floorPlanDisclosureLines([
        {
          label: "Ground Floor",
          source: "rendered_sketch",
          status: "unavailable",
          reason: "No render was saved.",
        },
        {
          label: "Level 1",
          source: "rendered_sketch",
          status: "included",
        },
      ]),
    ).toEqual(["Ground Floor: unavailable", "No render was saved."]);
  });
});
