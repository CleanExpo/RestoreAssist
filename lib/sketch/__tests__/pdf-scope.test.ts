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
