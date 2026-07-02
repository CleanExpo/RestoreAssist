import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { appendPhotoPages } from "../append-photo-pages";
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
});
