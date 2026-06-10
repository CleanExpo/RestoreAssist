import { describe, expect, it } from "vitest";
import {
  buildComplianceAnnex,
  buildDryingLog,
  type ScopeMaterialInfo,
} from "../pdf-scope";

const MATERIALS: ScopeMaterialInfo[] = [
  {
    slug: "fibro",
    name: "Fibro (fibrous-cement / AC sheet)",
    isPotentialAcm: true,
  },
  { slug: "timber-framing", name: "Timber framing", isPotentialAcm: false },
];

const FABRIC = {
  objects: [
    { data: { type: "room", material: "fibro", label: "Bathroom" } },
    { data: { type: "wall", material: "timber-framing" } },
    { data: {} }, // label/non-canonical → skipped
    { type: "i-text" }, // no data → skipped
  ],
};

describe("buildComplianceAnnex — S500 water category", () => {
  it("surfaces distinct categories present + their requirements", () => {
    const fabric = {
      objects: [
        { data: { type: "room", label: "Bathroom", waterCategory: "cat3" } },
        { data: { type: "room", label: "Lounge", waterCategory: "cat1" } },
        { data: { type: "room", label: "Hall", waterCategory: "cat1" } },
      ],
    };
    const annex = buildComplianceAnnex(fabric, MATERIALS);
    // distinct, ordered cat1 → cat3
    expect(annex.waterCategories.map((c) => c.category)).toEqual([
      "cat1",
      "cat3",
    ]);
    const cat3 = annex.waterCategories.find((c) => c.category === "cat3")!;
    expect(cat3.containmentRequired).toBe(true);
    expect(cat3.disposalAsContaminated).toBe(true);
    expect(cat3.porousMaterialsSalvageable).toBe(false);
    expect(
      annex.rows.find((r) => r.roomLabel === "Bathroom")?.waterCategory,
    ).toBe("cat3");
  });

  it("ignores invalid/absent categories", () => {
    const annex = buildComplianceAnnex(
      { objects: [{ data: { type: "room", waterCategory: "catX" } }] },
      MATERIALS,
    );
    expect(annex.waterCategories).toEqual([]);
    expect(annex.rows[0].waterCategory).toBeNull();
  });
});

describe("buildComplianceAnnex", () => {
  it("lists materials per element and flags suspected ACM", () => {
    const annex = buildComplianceAnnex(FABRIC, MATERIALS);
    expect(annex.rows).toHaveLength(2);
    const bathroom = annex.rows.find((r) => r.roomLabel === "Bathroom")!;
    expect(bathroom.materialName).toBe("Fibro (fibrous-cement / AC sheet)");
    expect(bathroom.isPotentialAcm).toBe(true);
    expect(annex.acmElements).toContain("Bathroom");
  });

  it("attaches NCC references derived from the materials present", () => {
    const annex = buildComplianceAnnex(FABRIC, MATERIALS);
    const topics = annex.nccReferences.map((r) => r.topic);
    // fibro → external wall cladding; timber-framing → structural timber
    expect(topics).toContain("External wall cladding & weatherproofing");
    expect(topics).toContain("Structural provisions (timber framing)");
    expect(annex.nccReferences.every((r) => r.edition === "NCC 2022")).toBe(
      true,
    );
  });

  it("honours a configured NCC edition", () => {
    const annex = buildComplianceAnnex(FABRIC, MATERIALS, {
      edition: "NCC 2025",
    });
    expect(annex.edition).toBe("NCC 2025");
    expect(annex.nccReferences.every((r) => r.edition === "NCC 2025")).toBe(
      true,
    );
  });

  it("handles unknown material slugs and empty input", () => {
    const annex = buildComplianceAnnex(
      { objects: [{ data: { type: "room", material: "unobtanium" } }] },
      MATERIALS,
    );
    expect(annex.rows[0].materialName).toBeNull();
    expect(annex.rows[0].isPotentialAcm).toBe(false);
    expect(buildComplianceAnnex(null, MATERIALS).rows).toEqual([]);
  });
});

describe("buildDryingLog / annex drying log", () => {
  it("computes dry/not-dry per pin from the material dry target", () => {
    const log = buildDryingLog([
      { wme: 10, material: "timber_floor" },
      { wme: 30, material: "timber_floor" },
    ]);
    expect(log[0].materialLabel).toBe("Timber Floor");
    expect(log[0].dryStandardMet).toBe(true);
    expect(log[1].dryStandardMet).toBe(false);
  });

  it("includes the drying log in the annex when pins are supplied", () => {
    const annex = buildComplianceAnnex(FABRIC, MATERIALS, {
      pins: [{ wme: 30, material: "plasterboard" }],
    });
    expect(annex.dryingLog).toHaveLength(1);
    expect(annex.dryingLog[0].dryStandardMet).toBe(false);
  });

  it("defaults to an empty drying log when no pins", () => {
    expect(buildComplianceAnnex(FABRIC, MATERIALS).dryingLog).toEqual([]);
  });
});

describe("NHCover (NZ) annex routing", () => {
  it("AU is the default — NCC references present, no NHCover block", () => {
    const annex = buildComplianceAnnex(FABRIC, MATERIALS);
    expect(annex.country).toBe("AU");
    expect(annex.nhcover).toBeNull();
    expect(annex.nccReferences.length).toBeGreaterThan(0);
  });

  it("NZ swaps NCC references for an NHCover block with cap + flat excess", () => {
    const annex = buildComplianceAnnex(FABRIC, MATERIALS, { country: "NZ" });
    expect(annex.country).toBe("NZ");
    expect(annex.nccReferences).toEqual([]);
    expect(annex.nhcover?.buildingCapNzd).toBe(300_000);
    expect(annex.nhcover?.flatExcessNzd).toBe(500);
  });

  it("routes a specific cause + estimate (earthquake over cap)", () => {
    const annex = buildComplianceAnnex(FABRIC, MATERIALS, {
      country: "NZ",
      nhCause: "earthquake",
      estimatedRepairNzd: 450_000,
    });
    expect(annex.nhcover?.routing?.building.covered).toBe(true);
    expect(annex.nhcover?.claim?.cappedAtNhcLimit).toBe(true);
  });

  it("flags building flood as private insurer, land as NHCover", () => {
    const annex = buildComplianceAnnex(FABRIC, MATERIALS, {
      country: "NZ",
      nhCause: "flood",
    });
    expect(annex.nhcover?.routing?.building.covered).toBe(false);
    expect(annex.nhcover?.routing?.land.covered).toBe(true);
  });
});
