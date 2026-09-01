import { describe, expect, it } from "vitest";
import { standardCite } from "@/lib/nir-standards-mapping";
import {
  buildScopeDryingPlan,
  deployableEquipment,
  dryingPlanLines,
  wrapPlain,
} from "../scope-drying-plan";

const clean = (over: Record<string, unknown> = {}) =>
  buildScopeDryingPlan({ totalAreaM2: 40, mouldActive: false, ...over });

describe("buildScopeDryingPlan", () => {
  it("plans one phase with air movers when there is no mould", () => {
    const plan = clean();

    expect(plan?.mouldActive).toBe(false);
    expect(plan?.phases).toHaveLength(1);
    expect(plan?.phases[0].airMoversAllowed).toBe(true);
    expect(plan?.phases[0].equipment.airMover).toBeGreaterThan(0);
    // No mould to contain, so no AFD. Area division always billed one per
    // 100 m² regardless, which is where the old numbers came from.
    expect(plan?.phases[0].equipment.airScrubber).toBe(0);
    expect(plan?.citation).toBe(standardCite("S500", "6"));
  });

  /**
   * THE LOAD-BEARING TEST for this module. `recommendedEquipment(totalM2)`
   * cannot produce this under any input — it never took a mould flag.
   */
  it("puts zero air movers in Phase 1 and defers them to Phase 2 when mould is active", () => {
    const plan = buildScopeDryingPlan({ totalAreaM2: 40, mouldActive: true });

    expect(plan?.phases).toHaveLength(2);
    expect(plan?.phases[0].airMoversAllowed).toBe(false);
    expect(plan?.phases[0].equipment.airMover).toBe(0);
    // Filtration and drying still run — withheld, not stopped.
    expect(plan?.phases[0].equipment.airScrubber).toBeGreaterThan(0);
    expect(plan?.phases[0].equipment.dehumidifier).toBeGreaterThan(0);
    expect(plan?.phases[1].airMoversAllowed).toBe(true);
    expect(plan?.phases[1].equipment.airMover).toBeGreaterThan(0);
    expect(plan?.citation).toBe(standardCite("S520"));
  });

  it("labels an assumed power budget and a measured one differently", () => {
    expect(clean()?.power).toMatchObject({
      circuits: 2,
      circuitRatingA: 20,
      assumed: true,
    });
    expect(
      clean({ powerAssessment: { circuits: 3, circuitRatingA: 16 } })?.power,
    ).toMatchObject({ circuits: 3, circuitRatingA: 16, assumed: false });
  });

  it("caps the count to the supply and says so", () => {
    const tight = buildScopeDryingPlan({
      totalAreaM2: 60,
      mouldActive: false,
      powerAssessment: { circuits: 1, circuitRatingA: 20 },
    });
    const generous = buildScopeDryingPlan({
      totalAreaM2: 60,
      mouldActive: false,
      powerAssessment: { circuits: 4, circuitRatingA: 20 },
    });

    expect(tight?.powerConstrained).toBe(true);
    expect(tight?.phases[0].equipment.airMover).toBeLessThan(
      generous!.phases[0].equipment.airMover,
    );
    expect(tight?.advisories.length).toBeGreaterThan(0);
  });

  // idealDehumidifiers floors at 1, so passing 0 m² straight through would put
  // one dehumidifier on the quote for a job with nothing to dry.
  it.each([0, -1, Number.NaN])("returns null for %s m² rather than sizing 1 of everything", (area) => {
    expect(buildScopeDryingPlan({ totalAreaM2: area, mouldActive: false })).toBeNull();
  });
});

describe("deployableEquipment", () => {
  it("reports Phase 1, which on a mould job is zero air movers", () => {
    const plan = buildScopeDryingPlan({ totalAreaM2: 40, mouldActive: true });

    expect(deployableEquipment(plan).airMover).toBe(0);
    // Phase 2 has them. Summing the phases, or reporting the last one, would put
    // the air movers back on the page the S520 sequence keeps them off.
    expect(plan?.phases[1].equipment.airMover).toBeGreaterThan(0);
  });

  it("is all zeros for no plan", () => {
    expect(deployableEquipment(null)).toEqual({
      dehumidifier: 0,
      airMover: 0,
      airScrubber: 0,
    });
  });
});

describe("dryingPlanLines", () => {
  it("states WHY a phase has no air movers, not just that it has none", () => {
    const text = dryingPlanLines(
      buildScopeDryingPlan({ totalAreaM2: 40, mouldActive: true }),
    )
      .map((l) => l.text)
      .join("\n");

    expect(text).toMatch(/Phase 1: .*Air movers: 0/);
    expect(text).toMatch(/NO air movers this phase/);
    expect(text).toMatch(/aerosolise spores/);
    expect(text).toContain("S520");
    // A bare "0" with no reason reads as an omission and gets "corrected".
    expect(text).toMatch(/Phase 2: .*Air movers: [1-9]/);
  });

  it("marks an assumed power budget in the warning tone, a measured one not", () => {
    const assumed = dryingPlanLines(clean()).find((l) =>
      l.text.startsWith("Power:"),
    );
    expect(assumed?.text).toContain("ASSUMED");
    expect(assumed?.tone).toBe("warn");

    const measured = dryingPlanLines(
      clean({ powerAssessment: { circuits: 4, circuitRatingA: 20 } }),
    ).find((l) => l.text.startsWith("Power:"));
    expect(measured?.text).not.toContain("ASSUMED");
    expect(measured?.tone).toBe("muted");
  });

  it("drops the phase prefix when there is only one phase", () => {
    const text = dryingPlanLines(clean())
      .map((l) => l.text)
      .join("\n");
    expect(text).not.toContain("Phase 1:");
    expect(text).toMatch(/Dehumidifiers: \d+/);
  });

  it("renders nothing at all for no plan", () => {
    expect(dryingPlanLines(null)).toEqual([]);
  });

  // pdf-lib neither wraps nor clips: an unwrapped advisory runs off the page
  // edge and is simply not in the document.
  it("wraps advisories to the renderer's width", () => {
    const lines = dryingPlanLines(
      buildScopeDryingPlan({
        totalAreaM2: 60,
        mouldActive: false,
        powerAssessment: { circuits: 1, circuitRatingA: 20 },
      }),
      60,
    );
    const advisories = lines.filter((l) => l.text.startsWith("  ") && !/NO air movers/.test(l.text));

    expect(advisories.length).toBeGreaterThan(1);
    for (const l of advisories) expect(l.text.length).toBeLessThanOrEqual(62);
  });
});

describe("wrapPlain", () => {
  it("breaks on word boundaries without losing or duplicating words", () => {
    const text = "run controlled sectional mitigation or bring alternative power";
    expect(wrapPlain(text, 20).join(" ")).toBe(text);
    for (const l of wrapPlain(text, 20)) expect(l.length).toBeLessThanOrEqual(20);
  });

  it("keeps a word longer than the width rather than dropping it", () => {
    expect(wrapPlain("supercalifragilistic", 5)).toEqual(["supercalifragilistic"]);
  });

  it("is empty for empty input", () => {
    expect(wrapPlain("   ", 10)).toEqual([]);
  });
});
