import { describe, expect, it } from "vitest";
import {
  buildScopeExport,
  SCOPE_SCHEMA_VERSION,
  type ScopeMaterialInfo,
} from "../scope-contract";

const MATERIALS: ScopeMaterialInfo[] = [
  {
    slug: "fibro",
    name: "Fibro (fibrous-cement / AC sheet)",
    isPotentialAcm: true,
  },
];

// A 3m x 4m room polygon at 100px/m carrying both the fabric type (for room
// extraction) and data.type (for the compliance annex).
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

describe("buildScopeExport — versioned ANZ scope contract", () => {
  it("stamps an explicit schema version", () => {
    const out = buildScopeExport({ floors: [FLOOR], materials: MATERIALS });
    expect(out.schemaVersion).toBe(SCOPE_SCHEMA_VERSION);
    expect(out.schemaVersion).toBe("1.0");
  });

  it("serialises rooms + geometry per floor with metric areas", () => {
    const out = buildScopeExport({
      floors: [FLOOR],
      materials: MATERIALS,
      propertyAddress: "1 Test St, Brisbane",
      reportNumber: "RA-0001",
    });
    expect(out.property).toEqual({
      address: "1 Test St, Brisbane",
      reportNumber: "RA-0001",
    });
    expect(out.floors).toHaveLength(1);
    expect(out.floors[0].rooms).toHaveLength(1);
    expect(out.floors[0].rooms[0].areaM2).toBeCloseTo(12, 5);
    expect(out.floors[0].totalFloorAreaM2).toBeCloseTo(12, 5);
    expect(out.totalFloorAreaM2).toBeCloseTo(12, 5);
  });

  it("carries the same compliance annex the PDF uses (materials + ACM)", () => {
    const out = buildScopeExport({ floors: [FLOOR], materials: MATERIALS });
    const bathroom = out.compliance.rows.find(
      (r) => r.roomLabel === "Bathroom",
    );
    expect(bathroom?.isPotentialAcm).toBe(true);
    expect(out.compliance.acmElements).toContain("Bathroom");
  });

  it("AU jurisdiction carries NCC references, no NHCover block", () => {
    const out = buildScopeExport({ floors: [FLOOR], materials: MATERIALS });
    expect(out.jurisdiction).toBe("AU");
    expect(out.compliance.nhcover).toBeNull();
    expect(out.compliance.nccReferences.length).toBeGreaterThan(0);
  });

  it("NZ jurisdiction swaps to the NHCover block", () => {
    const out = buildScopeExport({
      floors: [FLOOR],
      materials: MATERIALS,
      country: "NZ",
    });
    expect(out.jurisdiction).toBe("NZ");
    expect(out.compliance.nccReferences).toEqual([]);
    expect(out.compliance.nhcover?.buildingCapNzd).toBe(300_000);
  });

  it("defaults property fields to empty strings", () => {
    const out = buildScopeExport({ floors: [], materials: MATERIALS });
    expect(out.property).toEqual({ address: "", reportNumber: "" });
    expect(out.floors).toEqual([]);
    expect(out.totalFloorAreaM2).toBe(0);
    expect(out.dryingEquipment.dehumidifier).toBe(0);
  });

  it("recommends S500 §8.3 drying equipment from the affected area", () => {
    const out = buildScopeExport({ floors: [FLOOR], materials: MATERIALS });
    // 12 m²: 1 dehu (/40), 1 air mover (/15), 1 air scrubber (/100)
    expect(out.dryingEquipment.dehumidifier).toBe(1);
    expect(out.dryingEquipment.airMover).toBe(1);
    expect(out.dryingEquipment.airScrubber).toBe(1);
  });
});
