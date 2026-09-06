import { describe, expect, it } from "vitest";
import { standardCite } from "@/lib/nir-standards-mapping";
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
    expect(out.schemaVersion).toBe("1.1");
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

  it("sizes drying equipment with the planner, not by dividing the area", () => {
    const out = buildScopeExport({ floors: [FLOOR], materials: MATERIALS });

    // 12 m², no mould. These are planDrying's numbers and they are NOT the old
    // ratios: area division gave 1 / 1 / 1 (per 40 / 15 / 100 m²). The planner
    // sizes air movers at S500's real ~1 per 4.5 m² adjusted for load, and puts
    // no AFD on a job with no mould to contain.
    expect(out.dryingEquipment).toEqual({
      dehumidifier: 1,
      airMover: 3,
      airScrubber: 0,
    });
    // One phase when there is no mould: everything runs together.
    expect(out.dryingPlan?.phases).toHaveLength(1);
    expect(out.dryingPlan?.phases[0].airMoversAllowed).toBe(true);
  });

  /**
   * THE LOAD-BEARING TEST.
   *
   * `recommendedEquipment(totalM2)` cannot produce this result under any input:
   * it never saw a mould flag. Restoring it turns this red, which is what makes
   * the assertion worth having.
   *
   * An insurer reads `dryingEquipment` off this contract. On a mould job it must
   * carry zero air movers, because running them over live growth blows spores
   * through an occupied building — `reconcile-pricing-safety.ts` calls a priced
   * Phase 1 air mover on a mould job "remediation negligence (S520)".
   */
  it("withholds every air mover from the deployable set when mould is active", () => {
    const out = buildScopeExport({
      floors: [FLOOR],
      materials: MATERIALS,
      mouldActive: true,
    });

    expect(out.dryingEquipment.airMover).toBe(0);
    // Containment filtration takes their place, and drying continues.
    expect(out.dryingEquipment.airScrubber).toBeGreaterThan(0);
    expect(out.dryingEquipment.dehumidifier).toBeGreaterThan(0);

    expect(out.dryingPlan?.mouldActive).toBe(true);
    expect(out.dryingPlan?.phases).toHaveLength(2);
    expect(out.dryingPlan?.phases[0].airMoversAllowed).toBe(false);
    expect(out.dryingPlan?.phases[0].equipment.airMover).toBe(0);
    // They return in Phase 2, after clearance — withheld, not deleted.
    expect(out.dryingPlan?.phases[1].airMoversAllowed).toBe(true);
    expect(out.dryingPlan?.phases[1].equipment.airMover).toBeGreaterThan(0);
    expect(out.dryingPlan?.citation).toBe(standardCite("S520"));
  });

  // A plan built on a guessed supply must never read as one built on an
  // electrician's numbers.
  it("flags the power budget as assumed when no assessment was passed", () => {
    const out = buildScopeExport({ floors: [FLOOR], materials: MATERIALS });

    expect(out.dryingPlan?.power.assumed).toBe(true);
    expect(out.dryingPlan?.power.circuits).toBe(2);
    expect(out.dryingPlan?.power.circuitRatingA).toBe(20);
  });

  it("uses a real assessment when one exists and caps the count to the supply", () => {
    // 60 m² is chosen so the two supplies actually differ: 3 dehumidifiers
    // (10.2 A) plus ~16 air movers (19.2 A) fits 4 circuits and does not fit 1.
    const big = { ...FLOOR, fabricJson: floorOfArea(60) };

    const generous = buildScopeExport({
      floors: [big],
      materials: MATERIALS,
      powerAssessment: { circuits: 4, circuitRatingA: 20 },
    });
    const tight = buildScopeExport({
      floors: [big],
      materials: MATERIALS,
      powerAssessment: { circuits: 1, circuitRatingA: 20 },
    });

    expect(tight.dryingPlan?.power.assumed).toBe(false);
    expect(tight.dryingPlan?.powerConstrained).toBe(true);
    expect(tight.dryingEquipment.airMover).toBeLessThan(
      generous.dryingEquipment.airMover,
    );
    expect(tight.dryingPlan?.advisories.length).toBeGreaterThan(0);
  });

  // idealDehumidifiers floors at 1, so a scope with no rooms would otherwise
  // arrive on the quote carrying one dehumidifier for nothing.
  it("sizes no equipment at all for an empty scope", () => {
    const out = buildScopeExport({ floors: [], materials: MATERIALS });

    expect(out.dryingPlan).toBeNull();
    expect(out.dryingEquipment).toEqual({
      dehumidifier: 0,
      airMover: 0,
      airScrubber: 0,
    });
  });
});

/** A square room of `m2` square metres at the fixture's 100 px/m scale. */
function floorOfArea(m2: number) {
  const px = Math.sqrt(m2) * 100;
  return {
    objects: [
      {
        type: "polygon",
        stroke: "#3b82f6",
        points: [
          { x: 0, y: 0 },
          { x: px, y: 0 },
          { x: px, y: px },
          { x: 0, y: px },
        ],
        data: { type: "room", material: "fibro", label: "Hall" },
      },
    ],
  };
}
