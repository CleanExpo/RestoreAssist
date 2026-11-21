/**
 * RA-8239 — the floor-plan PDF header stays legible on any tenant colour.
 *
 * The header band takes the workspace's primary colour. Its text used to be
 * white (with a cyan accent) whatever the band, so a pale brand colour gave
 * an unreadable header, in colour and on a greyscale print. WCAG contrast is
 * a luminance ratio, so meeting it also holds once the page is greyscale.
 */
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  generateSketchPdf,
  headerTextColours,
} from "@/lib/generate-sketch-pdf";

const DEFAULT_BAND = { r: 0.11, g: 0.18, b: 0.28 };
const WHITE = { r: 1, g: 1, b: 1 };
const CYAN = { r: 0, g: 0.73, b: 0.83 };
const hex = (h: string) => ({
  r: parseInt(h.slice(0, 2), 16) / 255,
  g: parseInt(h.slice(2, 4), 16) / 255,
  b: parseInt(h.slice(4, 6), 16) / 255,
});

describe("RA-8239 header ink", () => {
  it("keeps the default look: white text and the cyan accent on the default band", () => {
    expect(headerTextColours(DEFAULT_BAND)).toEqual({
      text: WHITE,
      accent: CYAN,
    });
  });

  it("switches to dark text on a pale brand colour", () => {
    const yellow = hex("FFE000");
    const ink = headerTextColours(yellow);
    expect(ink.text).not.toEqual(WHITE);
    expect(contrastRatio(ink.text, yellow)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(ink.accent, yellow)).toBeGreaterThanOrEqual(4.5);
  });

  it("reaches 4.5:1 for text and accent on every 12-bit band colour", () => {
    let worst = Infinity;
    for (let r = 0; r < 16; r++)
      for (let g = 0; g < 16; g++)
        for (let b = 0; b < 16; b++) {
          const band = { r: r / 15, g: g / 15, b: b / 15 };
          const ink = headerTextColours(band);
          worst = Math.min(
            worst,
            contrastRatio(ink.text, band),
            contrastRatio(ink.accent, band),
          );
        }
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });

  it("still renders a PDF with a pale tenant colour", async () => {
    const PNG_1PX =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const bytes = await generateSketchPdf({
      floors: [
        { label: "Ground Floor", pngDataUrl: PNG_1PX, fabricJson: null },
      ],
      branding: { businessName: "Sunny Restorations", primaryColor: "#FFE000" },
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
