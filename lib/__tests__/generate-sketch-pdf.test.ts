import { describe, it, expect } from "vitest";
import { safe, dataUrlToBytes, formatFloorMeta } from "../generate-sketch-pdf";

// RA-6687: Focused unit tests for the PURE, DB-free helpers in the sketch PDF
// pipeline. `safe()` keeps user-supplied labels/notes encodable by pdf-lib's
// StandardFont (WinAnsi/CP-1252) so a stray emoji can never 500 the export.
// `dataUrlToBytes()` decodes the client-rendered PNG data URL into bytes for
// embedding.

describe("safe", () => {
  it("returns empty string for null / undefined", () => {
    // @ts-expect-error — exercising the nullish guard
    expect(safe(null)).toBe("");
    // @ts-expect-error — exercising the nullish guard
    expect(safe(undefined)).toBe("");
  });

  it("preserves printable ASCII", () => {
    expect(safe("Bedroom 1 (2.4m x 3.1m)")).toBe("Bedroom 1 (2.4m x 3.1m)");
  });

  it("preserves Latin-1 supplement characters", () => {
    expect(safe("Garçon café")).toBe("Garçon café");
  });

  it("preserves CP-1252 punctuation (e.g. smart quotes, en/em dash, ellipsis)", () => {
    // U+2019 right single quote, U+2014 em dash, U+2026 ellipsis are all in WINANSI_PUNCT.
    expect(safe("Owner’s notes — wet…")).toBe(
      "Owner’s notes — wet…",
    );
  });

  it("maps arrows to '->'", () => {
    // U+2192 rightwards arrow.
    expect(safe("kitchen → hall")).toBe("kitchen -> hall");
  });

  it("drops emoji and other non-encodable glyphs", () => {
    expect(safe("Water 🚰 here")).toBe("Water  here");
  });

  it("drops non-Latin scripts", () => {
    expect(safe("房间")).toBe("");
  });
});

describe("dataUrlToBytes", () => {
  it("decodes the base64 payload of a data URL into bytes", () => {
    // "Hi" -> base64 "SGk="
    const bytes = dataUrlToBytes("data:image/png;base64,SGk=");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual([72, 105]); // 'H', 'i'
  });

  it("round-trips arbitrary binary bytes", () => {
    const original = new Uint8Array([0, 255, 16, 128, 1]);
    const b64 = Buffer.from(original).toString("base64");
    const decoded = dataUrlToBytes(`data:image/png;base64,${b64}`);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("ignores the mime/header portion and only decodes after the comma", () => {
    const a = dataUrlToBytes("data:image/png;base64,SGk=");
    const b = dataUrlToBytes("data:application/octet-stream;base64,SGk=");
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

// RA-6846 [A7] / RA-6843 [A4]: the PDF floor sub-header shows total measured
// area + the calibrated scale. This is the pure formatter behind that line.
describe("formatFloorMeta", () => {
  it("includes total measured area (1dp) and scale when area > 0", () => {
    expect(formatFloorMeta({ totalAreaM2: 14.14, pxPerMetre: 100 })).toBe(
      "Total measured area: 14.1 m²   ·   Scale: 1 m = 100 px",
    );
  });

  it("omits the area clause when there is no measured geometry", () => {
    expect(formatFloorMeta({ totalAreaM2: 0, pxPerMetre: 100 })).toBe(
      "Scale: 1 m = 100 px",
    );
  });

  it("reflects a calibrated (non-default) scale and rounds px", () => {
    expect(formatFloorMeta({ totalAreaM2: 8, pxPerMetre: 128.4 })).toBe(
      "Total measured area: 8.0 m²   ·   Scale: 1 m = 128 px",
    );
  });
});
