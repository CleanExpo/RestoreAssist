import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { inspection: { findUnique: vi.fn() } },
}));

import { standardCite } from "@/lib/nir-standards-mapping";
import { idealAirMovers } from "@/lib/restoration/equipment-planner";
import { prisma } from "@/lib/prisma";

import { recommendMethod } from "../recommend-method";

/** A classified 40 m² job; overrides layer the case under test on top. */
function inspection(over: Record<string, unknown> = {}) {
  return {
    id: "insp_1",
    powerCircuits: null,
    powerCircuitRatingA: null,
    powerDeratePct: null,
    classifications: [{ category: "2", class: "2" }],
    affectedAreas: [
      { affectedAreaSqm: 30, affectedSquareFootage: 322.9 },
      { affectedAreaSqm: null, affectedSquareFootage: 107.6 }, // legacy row: 10 m²
    ],
    report: {
      biologicalMouldDetected: false,
      biologicalMouldCategory: null,
      hazardType: "water damage",
    },
    ...over,
  } as never;
}

function airMoversIn(
  phases: Array<{ units: Array<{ kind: string; quantity: number }> }>,
  phase: number,
): number {
  const units = phases[phase - 1]?.units ?? [];
  return units
    .filter((u) => u.kind === "air_mover")
    .reduce((n, u) => n + u.quantity, 0);
}

describe("recommend_method", () => {
  beforeEach(() => {
    vi.mocked(prisma.inspection.findUnique).mockReset();
  });

  it("recommends a drying method and a cited equipment plan for a classified inspection", async () => {
    vi.mocked(prisma.inspection.findUnique).mockResolvedValue(inspection());

    const result = await recommendMethod({ inspectionId: "insp_1" });

    expect(result.available).toBe(true);
    if (!result.available) throw new Error("unreachable");
    expect(result.classification).toEqual({ category: "2", class: "2" });
    // 30 + 10 legacy-converted m² = 40 m² total drives the plan.
    expect(result.equipment.totalAreaM2).toBeCloseTo(40, 1);
    expect(result.equipment.citation).toBe(standardCite("S500", "6"));
    expect(result.method.citation).toBe(standardCite("S500", "10.4.3"));
    // No mould → a single phase that runs air movers and dehumidifiers together.
    expect(result.equipment.mouldActive).toBe(false);
    expect(result.equipment.phases).toHaveLength(1);
    expect(result.equipment.phases[0].airMoversAllowed).toBe(true);
    expect(airMoversIn(result.equipment.phases, 1)).toBeGreaterThan(0);
    // Cat 2 water → antimicrobial consideration must be surfaced, cited.
    expect(
      result.cautions.some((c) => c.citation === standardCite("S500", "7.1")),
    ).toBe(true);
  });

  /**
   * THE LOAD-BEARING TEST.
   *
   * The planner's own suite already proves planDrying() withholds air movers on
   * a mould job. It says nothing about whether MARGOT reaches that planner — and
   * for a long time it did not: this tool sized equipment by area division and
   * never read the mould flag at all. This asserts the rule at the tool
   * boundary, which is the surface a technician actually talks to.
   */
  it.each([
    ["the detected flag", { biologicalMouldDetected: true }],
    ["a recorded condition", { biologicalMouldCategory: "Condition 3" }],
    ["the hazard type", { hazardType: "mould remediation" }],
  ])(
    "withholds every air mover from Phase 1 when mould is signalled by %s",
    async (_label, reportOver) => {
      vi.mocked(prisma.inspection.findUnique).mockResolvedValue(
        inspection({
          report: {
            biologicalMouldDetected: false,
            biologicalMouldCategory: null,
            hazardType: "water damage",
            ...reportOver,
          },
        }),
      );

      const result = await recommendMethod({ inspectionId: "insp_1" });

      expect(result.available).toBe(true);
      if (!result.available) throw new Error("unreachable");
      expect(result.equipment.mouldActive).toBe(true);
      expect(result.equipment.phases).toHaveLength(2);
      expect(result.equipment.phases[0].airMoversAllowed).toBe(false);
      expect(airMoversIn(result.equipment.phases, 1)).toBe(0);
      // Air movers return only after clearance, in Phase 2.
      expect(result.equipment.phases[1].airMoversAllowed).toBe(true);
      // And the technician is told why, with the standard behind it.
      expect(
        result.cautions.some(
          (c) =>
            c.citation === standardCite("S520") && /air mover/i.test(c.text),
        ),
      ).toBe(true);
    },
  );

  it("caps air movers to the supply and says so when power is tight", async () => {
    vi.mocked(prisma.inspection.findUnique).mockResolvedValue(
      inspection({ powerCircuits: 1, powerCircuitRatingA: 20 }),
    );

    const result = await recommendMethod({ inspectionId: "insp_1" });

    expect(result.available).toBe(true);
    if (!result.available) throw new Error("unreachable");
    expect(result.equipment.power.assumed).toBe(false);
    expect(result.equipment.powerConstrained).toBe(true);
    expect(airMoversIn(result.equipment.phases, 1)).toBeLessThan(
      idealAirMovers({ affectedAreaM2: 40, mouldActive: false }),
    );
    expect(result.equipment.advisories.length).toBeGreaterThan(0);
  });

  // A plan built on a guessed supply must never read as one built on an
  // electrician's numbers.
  it("flags an assumed power budget when the site was never assessed", async () => {
    vi.mocked(prisma.inspection.findUnique).mockResolvedValue(inspection());

    const result = await recommendMethod({ inspectionId: "insp_1" });

    expect(result.available).toBe(true);
    if (!result.available) throw new Error("unreachable");
    expect(result.equipment.power.assumed).toBe(true);
    expect(result.equipment.power.circuits).toBe(2);
    expect(result.cautions.some((c) => /assumes/i.test(c.text))).toBe(true);
  });

  it("is explicit when classification is missing instead of guessing", async () => {
    vi.mocked(prisma.inspection.findUnique).mockResolvedValue(
      inspection({ classifications: [] }),
    );

    const result = await recommendMethod({ inspectionId: "insp_1" });

    expect(result.available).toBe(false);
    if (result.available) throw new Error("unreachable");
    expect(result.reason).toMatch(/classification/iu);
  });

  it("is explicit when classified but no affected areas are recorded (never sizes 0 equipment)", async () => {
    vi.mocked(prisma.inspection.findUnique).mockResolvedValue(
      inspection({ affectedAreas: [] }),
    );

    const result = await recommendMethod({ inspectionId: "insp_1" });

    expect(result.available).toBe(false);
    if (result.available) throw new Error("unreachable");
    expect(result.reason).toMatch(/affected areas/iu);
  });

  // A job with no Report row at all must not throw — it is simply a job with no
  // mould signal, and the plan still has to come back.
  it("treats a missing report as no mould rather than failing", async () => {
    vi.mocked(prisma.inspection.findUnique).mockResolvedValue(
      inspection({ report: null }),
    );

    const result = await recommendMethod({ inspectionId: "insp_1" });

    expect(result.available).toBe(true);
    if (!result.available) throw new Error("unreachable");
    expect(result.equipment.mouldActive).toBe(false);
  });

  it("is explicit when the inspection does not exist", async () => {
    vi.mocked(prisma.inspection.findUnique).mockResolvedValue(null);

    const result = await recommendMethod({ inspectionId: "nope" });

    expect(result.available).toBe(false);
  });
});
