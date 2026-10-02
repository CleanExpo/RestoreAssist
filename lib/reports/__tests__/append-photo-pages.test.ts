import { describe, it, expect, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import { appendPhotoPages, missingPhotosNotice } from "../append-photo-pages";
import type { ReportPhoto } from "../inspection-photos-to-images";

const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
// Minimal valid 1x1 baseline JPEG.
const JPG_1x1 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==";

function b(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function photo(isPng: boolean, caption: string): ReportPhoto {
  return { bytes: b(isPng ? PNG_1x1 : JPG_1x1), isPng, caption };
}

async function basePdf(pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return doc.save();
}

describe("appendPhotoPages", () => {
  it("adds ceil(photos / 6) grid pages (mixed PNG + JPG)", async () => {
    const base = await basePdf(1);
    const photos = Array.from({ length: 7 }, (_, i) =>
      photo(i % 2 === 0, `Photo ${i}`),
    );

    const out = await appendPhotoPages(base, photos, { reportNumber: "RPT-1" });

    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1 + 2); // 7 photos → 2 grid pages
  });

  it("returns the original bytes unchanged when there are no photos", async () => {
    const base = await basePdf(2);
    const out = await appendPhotoPages(base, [], {});
    expect(out).toBe(base);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it("skips an un-embeddable photo without throwing", async () => {
    const base = await basePdf(1);
    const photos: ReportPhoto[] = [
      photo(true, "good"),
      { bytes: new Uint8Array([1, 2, 3, 4]), isPng: true, caption: "corrupt" },
    ];

    const out = await appendPhotoPages(base, photos, {});

    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2); // base + 1 grid page, no crash
  });

  // Review 35e2911a P1: a photo that could not be included must be stated in
  // the PDF, never dropped silently, including when none could be included.
  it("adds a notice page when every photo was missing", async () => {
    const base = await basePdf(1);
    const out = await appendPhotoPages(base, [], { missingCount: 3 });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  // Cursor re-review of 5b812a99 (P0): the notice was only pinned when every
  // photo was missing. The common case is some photos embed and some do not.
  it("prints the notice when some photos embed and some are missing", async () => {
    const drawn: string[] = [];
    const spy = vi
      .spyOn(PDFPage.prototype, "drawText")
      .mockImplementation(function (this: PDFPage, text: string) {
        drawn.push(text);
      });
    const base = await basePdf(1);
    await appendPhotoPages(
      base,
      [
        photo(true, "good"),
        { bytes: new Uint8Array([1, 2, 3, 4]), isPng: true, caption: "corrupt" },
      ],
      { missingCount: 2 },
    );
    spy.mockRestore();
    expect(drawn).toContain(missingPhotosNotice(3));
  });

  it("states how many photos are missing, counting un-embeddable ones", () => {
    expect(missingPhotosNotice(0)).toBeNull();
    expect(missingPhotosNotice(1)).toBe(
      "1 photo could not be included in this PDF. The originals remain on the inspection record.",
    );
    expect(missingPhotosNotice(4)).toBe(
      "4 photos could not be included in this PDF. The originals remain on the inspection record.",
    );
  });
});
