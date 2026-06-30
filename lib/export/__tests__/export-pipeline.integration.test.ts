/**
 * Full-chain RIA demo-path integration test.
 *
 * Runs a realistic multi-floor sketch through the ENTIRE export pipeline —
 * structured contract + scope narrative + PDF — for both AU and NZ, asserting the
 * whole ANSI/IICRC S500:2021 DoD chain composes end to end. This is the demo path;
 * if any cross-module wiring breaks, this fails.
 */
import { describe, expect, it } from "vitest";
import { buildScopeExport, type ScopeMaterialInfo } from "../scope-contract";
import { buildScopeNarrative } from "../scope-narrative";
import { generateSketchPdf } from "@/lib/generate-sketch-pdf";

// 1×1 transparent PNG — enough for pdf-lib embedPng in the floor image slot.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

const MATERIALS: ScopeMaterialInfo[] = [
  {
    slug: "fibro",
    name: "Fibro (fibrous-cement / AC sheet)",
    isPotentialAcm: true,
  },
  { slug: "gyprock", name: "Gyprock (plasterboard)", isPotentialAcm: false },
];

const room = (
  label: string,
  material: string,
  waterCategory: string | undefined,
  size = 400,
) => ({
  type: "polygon",
  stroke: "#3b82f6",
  points: [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: size },
    { x: 0, y: size },
  ],
  data: {
    type: "room",
    material,
    label,
    ...(waterCategory ? { waterCategory } : {}),
  },
});

const FLOORS = [
  {
    label: "Ground Floor",
    pngDataUrl: PNG,
    fabricJson: {
      scaleConfig: { pxPerMetre: 100 },
      objects: [
        room("Bathroom", "fibro", "cat3"),
        room("Lounge", "gyprock", "cat1"),
        {
          type: "rect",
          width: 500,
          height: 20,
          data: { type: "wall", material: "fibro" },
        },
      ],
    },
  },
  {
    label: "First Floor",
    pngDataUrl: PNG,
    fabricJson: { objects: [room("Bedroom", "gyprock", undefined)] },
  },
];

const MOISTURE = [
  { wme: 30, material: "timber_floor", note: "near skirting" }, // not yet dry
  { wme: 8, material: "timber_floor" }, // dry
];

const isPdf = (bytes: Uint8Array) =>
  String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";

describe("export pipeline — AU end to end", () => {
  const structured = buildScopeExport({
    floors: FLOORS,
    materials: MATERIALS,
    propertyAddress: "1 Demo St, Brisbane QLD",
    reportNumber: "RA-DEMO",
    moisturePins: MOISTURE,
    country: "AU",
  });

  it("structured contract carries the full DoD chain", () => {
    expect(structured.schemaVersion).toBe("1.0");
    expect(structured.floors).toHaveLength(2);
    expect(structured.totalFloorAreaM2).toBeGreaterThan(0);
    expect(structured.compliance.acmElements).toContain("Bathroom"); // fibro → ACM
    expect(
      structured.compliance.waterCategories.map((c) => c.category),
    ).toEqual(["cat1", "cat3"]);
    expect(structured.compliance.dryingLog).toHaveLength(2);
    expect(structured.dryingEquipment.dehumidifier).toBeGreaterThanOrEqual(1);
    expect(structured.compliance.nccReferences.length).toBeGreaterThan(0);
    expect(structured.compliance.nhcover).toBeNull();
  });

  it("narrative renders every section", () => {
    const md = buildScopeNarrative(structured);
    for (const needle of [
      "# Scope of Works",
      "ANSI/IICRC S500:2021",
      "SUSPECTED ASBESTOS",
      "Category 3",
      "NOT YET DRY",
      "Drying equipment",
      "NCC 2022",
    ]) {
      expect(md, `narrative missing: ${needle}`).toContain(needle);
    }
  });

  it("PDF generates a real multi-page document", async () => {
    const bytes = await generateSketchPdf({
      floors: FLOORS,
      materials: MATERIALS,
      moisturePins: MOISTURE,
      country: "AU",
      propertyAddress: "1 Demo St, Brisbane QLD",
    });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(isPdf(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(2000); // 2 floors + compliance annex
  });
});

describe("export pipeline — NZ end to end", () => {
  it("routes NHCover across structured + narrative + PDF", async () => {
    const structured = buildScopeExport({
      floors: FLOORS,
      materials: MATERIALS,
      propertyAddress: "1 Demo St, Auckland",
      moisturePins: MOISTURE,
      country: "NZ",
      nhCause: "flood",
    });
    expect(structured.compliance.nhcover?.buildingCapNzd).toBe(300_000);
    expect(structured.compliance.nccReferences).toEqual([]);

    const md = buildScopeNarrative(structured);
    expect(md).toContain("NHCover");
    expect(md).toContain("NZ$300,000");

    const bytes = await generateSketchPdf({
      floors: FLOORS,
      materials: MATERIALS,
      moisturePins: MOISTURE,
      country: "NZ",
      nhCause: "flood",
    });
    expect(isPdf(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(2000);
  });
});

describe("export pipeline — PDF survives hostile user text", () => {
  it("does not throw on emoji / arrows / smart punctuation in user fields", async () => {
    const floors = [
      {
        label: "Ground 🏠 → wing",
        pngDataUrl: PNG,
        fabricJson: {
          objects: [room("Café “wet” room → ✓", "fibro", "cat3")],
        },
      },
    ];
    const bytes = await generateSketchPdf({
      floors,
      materials: MATERIALS,
      moisturePins: [
        { wme: 30, material: "timber_floor", note: "tap → wall 🚿" },
      ],
      country: "AU",
      propertyAddress: "1 Café St → unit ½ 🏠",
    });
    expect(isPdf(bytes)).toBe(true);
  });
});
