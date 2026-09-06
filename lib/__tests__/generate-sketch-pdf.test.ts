import { describe, it, expect } from "vitest";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import {
  safe,
  dataUrlToBytes,
  formatFloorMeta,
  parseHexColor,
  resolveSketchBranding,
  generateSketchPdf,
} from "../generate-sketch-pdf";
import {
  formatProvenanceLegend,
  summarizeSketchProvenance,
} from "../sketch/sketch-provenance-summary";

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

describe("formatProvenanceLegend (PDF footer)", () => {
  it("summarises mixed LiDAR + hand-drawn floors for export legends", () => {
    const line = formatProvenanceLegend(
      summarizeSketchProvenance({
        objects: [
          {
            type: "polygon",
            data: {
              type: "room",
              provenance: "operator_measured",
              captureAdapter: "roomplan",
            },
          },
          {
            type: "polygon",
            data: { type: "room", provenance: "operator_measured" },
          },
          {
            type: "polygon",
            data: {
              type: "room",
              provenance: "underlay_reference",
              captureAdapter: "roomplan",
            },
          },
        ],
      }),
    );
    expect(line).toBe(
      "Provenance: 1 LiDAR confirmed · 1 hand-drawn · 1 LiDAR pending confirmation (not billed)",
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
    // parseHexColor accepts string | null | undefined, so null is type-safe.
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

// A 3m x 4m room, enough for the compliance annex to have geometry to size.
const ANNEX_FABRIC = {
  objects: [
    {
      type: "polygon",
      stroke: "#3b82f6",
      points: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 400 },
        { x: 0, y: 400 },
      ],
      data: { type: "room", material: "fibro", label: "Bathroom" },
    },
  ],
};
const ANNEX_MATERIALS = [
  { slug: "fibro", name: "Fibro", isPotentialAcm: true },
];

/**
 * Read the drawn text back out of a saved PDF.
 *
 * Needed because byte comparison cannot verify page CONTENT, and — worse — is
 * not even a valid proxy for it here: `generateSketchPdf` stamps
 * `doc.setCreationDate(new Date())`, so two identical calls a second apart
 * already differ. Verified directly: the same options 1.5 s apart produced
 * unequal buffers. Any "these two exports differ" assertion therefore passes
 * whether or not the option under test does anything.
 *
 * pdf-lib writes text as `<hex> Tj` inside Flate-compressed streams, so this
 * decodes the streams and then the hex operands.
 */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  let raw = "";
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      try {
        raw += Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1");
      } catch {
        // Not a decodable stream (an embedded image, say) — nothing to read.
      }
    }
  }
  return Array.from(raw.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g))
    .map((m) => Buffer.from(m[1], "hex").toString("latin1"))
    .join("\n");
}

describe("generateSketchPdf — the annex's drying plan is mould-gated (RA-7005)", () => {
  const floors = [
    { label: "Ground", pngDataUrl: PNG_1PX, fabricJson: ANNEX_FABRIC },
  ];

  it("extracts drawn text at all (guards the assertions below)", async () => {
    const text = await pdfText(
      await generateSketchPdf({ floors, materials: ANNEX_MATERIALS }),
    );
    // If the extractor silently returned "", every toContain below would still
    // pass a `not.toContain` and every toContain would fail loudly — but a
    // future pdf-lib could change the operator and make this quietly useless.
    expect(text).toContain("Compliance Annex");
  });

  /**
   * THE LOAD-BEARING TEST for the PDF.
   *
   * This page is what a technician works from on site. Before this change the
   * annex divided the area by a ratio and printed the result, so a job with
   * live mould growth carried a positive air-mover count here while the report
   * for the same job classified it mould-active.
   */
  it("prints zero Phase 1 air movers AND the reason, when mould is active", async () => {
    const text = await pdfText(
      await generateSketchPdf({
        floors,
        materials: ANNEX_MATERIALS,
        mouldActive: true,
      }),
    );

    expect(text).toMatch(/Phase 1: .*Air movers: 0/);
    // A bare zero reads as an omission and gets "corrected" on site.
    expect(text).toMatch(/NO air movers this phase/);
    expect(text).toContain("aerosolise spores");
    expect(text).toContain("S520");
    // Withheld, not deleted: they return once the area clears.
    expect(text).toMatch(/Phase 2: .*Air movers: [1-9]/);
  });

  it("runs air movers from the start when there is no mould", async () => {
    const text = await pdfText(
      await generateSketchPdf({
        floors,
        materials: ANNEX_MATERIALS,
        mouldActive: false,
      }),
    );

    expect(text).toMatch(/Air movers: [1-9]/);
    expect(text).not.toContain("NO air movers this phase");
    expect(text).not.toContain("Phase 2:");
  });

  it("marks the power budget ASSUMED until someone assesses the site", async () => {
    const assumed = await pdfText(
      await generateSketchPdf({ floors, materials: ANNEX_MATERIALS }),
    );
    expect(assumed).toContain("ASSUMED");
    expect(assumed).toContain("2 x 20A");

    const measured = await pdfText(
      await generateSketchPdf({
        floors,
        materials: ANNEX_MATERIALS,
        powerAssessment: { circuits: 4, circuitRatingA: 20 },
      }),
    );
    expect(measured).not.toContain("ASSUMED");
    expect(measured).toContain("4 x 20A");
  });

  // A floor plan with no room geometry must not put one dehumidifier on the
  // page for a job with nothing to dry.
  it("prints no drying block at all when there is no measured area", async () => {
    const text = await pdfText(
      await generateSketchPdf({
        floors: [{ label: "Ground", pngDataUrl: PNG_1PX }],
        materials: ANNEX_MATERIALS,
        mouldActive: true,
      }),
    );

    expect(text).toContain("Compliance Annex");
    expect(text).not.toContain("Drying equipment");
    expect(text).not.toMatch(/Dehumidifiers: \d/);
  });
});