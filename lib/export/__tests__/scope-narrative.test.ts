import { describe, expect, it } from "vitest";
import { buildScopeExport, type ScopeMaterialInfo } from "../scope-contract";
import { buildScopeNarrative } from "../scope-narrative";

const MATERIALS: ScopeMaterialInfo[] = [
  {
    slug: "fibro",
    name: "Fibro (fibrous-cement / AC sheet)",
    isPotentialAcm: true,
  },
];

const FLOOR = {
  label: "Ground Floor",
  fabricJson: {
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
  },
};

const auScope = buildScopeExport({
  floors: [FLOOR],
  materials: MATERIALS,
  propertyAddress: "1 Test St, Brisbane",
  reportNumber: "RA-0001",
  moisturePins: [{ wme: 30, material: "timber_floor" }],
});

describe("buildScopeNarrative (AU)", () => {
  const md = buildScopeNarrative(auScope);

  it("renders a titled S500 scope-of-works grounded in contract data", () => {
    expect(md).toContain("# Scope of Works");
    expect(md).toContain("1 Test St, Brisbane");
    expect(md).toContain("RA-0001");
    expect(md).toContain("AS-IICRC S500:2025");
  });

  it("lists affected areas with metric areas + materials", () => {
    expect(md).toContain("Bathroom");
    expect(md).toContain("12"); // m²
    expect(md.toLowerCase()).toContain("fibro");
    expect(md).toContain("Total floor area");
  });

  it("surfaces the WHS suspected-ACM block", () => {
    expect(md).toMatch(/suspected asbestos|ACM/i);
    expect(md).toMatch(/WHS pathway/i);
  });

  it("includes the S500 drying scope with dry/not-dry status", () => {
    expect(md).toMatch(/NOT YET DRY/);
  });

  it("includes the AU NCC reinstatement references", () => {
    expect(md).toContain("NCC 2022");
  });

  it("includes the S500 drying-equipment recommendation", () => {
    expect(md).toContain("Drying equipment");
    expect(md).toMatch(/Dehumidifiers: \d+/);
    expect(md).toMatch(/Air movers: \d+/);
  });

  it("does not reference any foreign estimating format", () => {
    expect(md.toLowerCase()).not.toMatch(/xactimate|symbility|cotality|esx/);
  });
});

describe("buildScopeNarrative (NZ)", () => {
  it("renders the NHCover routing instead of NCC", () => {
    const nzScope = buildScopeExport({
      floors: [FLOOR],
      materials: MATERIALS,
      country: "NZ",
      nhCause: "flood",
    });
    const md = buildScopeNarrative(nzScope);
    expect(md).toContain("NHCover");
    expect(md).toContain("NZ$300,000");
    expect(md).not.toContain("NCC 2022");
  });
});
