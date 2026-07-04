import { describe, it, expect } from "vitest";
import {
  safe,
  dataUrlToBytes,
  formatFloorMeta,
  parseHexColor,
  resolveSketchBranding,
  generateSketchPdf,
} from "../generate-sketch-pdf";

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

// RA-6851 [A8]: white-label the sketch report header with the inspection
// owner's business name + logo. `parseHexColor` and `resolveSketchBranding`
// are the pure, DB-free helpers behind that — the resolver is a pure function
// of its per-inspection input so branding can never bleed across workspaces.

describe("parseHexColor", () => {
  it("parses a 6-digit hex to 0–1 rgb components", () => {
    const c = parseHexColor("#1C2E47");
    expect(c).not.toBeNull();
    expect(c!.r).toBeCloseTo(0x1c / 255, 5);
    expect(c!.g).toBeCloseTo(0x2e / 255, 5);
    expect(c!.b).toBeCloseTo(0x47 / 255, 5);
  });

  it("expands a 3-digit shorthand hex", () => {
    const c = parseHexColor("#fff");
    expect(c).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("tolerates a missing leading # and surrounding whitespace", () => {
    expect(parseHexColor("  00BAD4 ")).not.toBeNull();
  });

  it("returns null for invalid / empty input", () => {
    expect(parseHexColor("")).toBeNull();
    expect(parseHexColor("nope")).toBeNull();
    expect(parseHexColor("#12")).toBeNull();
    expect(parseHexColor("#12345")).toBeNull();
    // @ts-expect-error — exercising the nullish guard
    expect(parseHexColor(null)).toBeNull();
  });
});

describe("resolveSketchBranding", () => {
  it("falls back to the RestoreAssist default for empty input", () => {
    const b = resolveSketchBranding(undefined);
    expect(b).toEqual({
      businessName: "RestoreAssist",
      logoUrl: null,
      primaryColorHex: null,
      showLogo: true,
      showCompanyName: true,
      logoPosition: "left",
    });
  });

  it("uses the trimmed business name and treats whitespace-only as absent", () => {
    expect(resolveSketchBranding({ businessName: "  Acme Restoration  " }).businessName).toBe(
      "Acme Restoration",
    );
    expect(resolveSketchBranding({ businessName: "   " }).businessName).toBe(
      "RestoreAssist",
    );
  });

  it("accepts an https logo URL and rejects non-https", () => {
    expect(
      resolveSketchBranding({ businessLogo: "https://res.cloudinary.com/x/logo.png" }).logoUrl,
    ).toBe("https://res.cloudinary.com/x/logo.png");
    expect(
      resolveSketchBranding({ businessLogo: "http://insecure/logo.png" }).logoUrl,
    ).toBeNull();
    expect(resolveSketchBranding({ businessLogo: "not a url" }).logoUrl).toBeNull();
  });

  it("drops the logo when showLogo is false even if a URL is present", () => {
    expect(
      resolveSketchBranding({
        businessLogo: "https://res.cloudinary.com/x/logo.png",
        showLogo: false,
      }).logoUrl,
    ).toBeNull();
  });

  it("keeps a valid primaryColor and discards an invalid one", () => {
    expect(resolveSketchBranding({ primaryColor: "#123456" }).primaryColorHex).toBe(
      "#123456",
    );
    expect(resolveSketchBranding({ primaryColor: "teal" }).primaryColorHex).toBeNull();
  });

  it("clamps logoPosition to left/center/right", () => {
    expect(resolveSketchBranding({ logoPosition: "center" }).logoPosition).toBe("center");
    expect(resolveSketchBranding({ logoPosition: "somewhere" }).logoPosition).toBe("left");
  });

  it("returns a fresh object per call (no shared default singleton) — tenant isolation guard", () => {
    const a = resolveSketchBranding({ businessName: "Tenant A" });
    const b = resolveSketchBranding({ businessName: "Tenant B" });
    expect(a).not.toBe(b);
    expect(a.businessName).toBe("Tenant A");
    expect(b.businessName).toBe("Tenant B");
    // Mutating one resolved object must not affect a later default resolution.
    a.businessName = "MUTATED";
    expect(resolveSketchBranding(undefined).businessName).toBe("RestoreAssist");
  });
});

// A 1×1 transparent PNG data URL — enough to embed without a network fetch.
const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("generateSketchPdf — branding is threaded into the export (RA-6851)", () => {
  it("produces a valid PDF and threads the resolved business name into the output", async () => {
    const bytesAcme = await generateSketchPdf({
      floors: [{ label: "Ground", pngDataUrl: PNG_1PX }],
      branding: { businessName: "Acme Restoration" },
    });
    expect(bytesAcme).toBeInstanceOf(Uint8Array);
    // PDF magic header.
    expect(Buffer.from(bytesAcme.slice(0, 5)).toString("latin1")).toBe("%PDF-");

    // Two different tenants must not produce byte-identical exports — proof the
    // per-inspection branding actually reaches the rendered header.
    const bytesOther = await generateSketchPdf({
      floors: [{ label: "Ground", pngDataUrl: PNG_1PX }],
      branding: { businessName: "Different Co" },
    });
    expect(Buffer.from(bytesOther).equals(Buffer.from(bytesAcme))).toBe(false);
  });

  it("renders the RestoreAssist default header when no branding is supplied", async () => {
    const bytes = await generateSketchPdf({
      floors: [{ label: "Ground", pngDataUrl: PNG_1PX }],
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});
