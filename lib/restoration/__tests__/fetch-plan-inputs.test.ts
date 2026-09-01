import { describe, expect, it } from "vitest";
import { planInputsFromRow } from "../fetch-plan-inputs";

describe("planInputsFromRow", () => {
  it("reads both inputs off a joined row", () => {
    expect(
      planInputsFromRow({
        powerCircuits: 3,
        powerCircuitRatingA: 16,
        powerDeratePct: 0.7,
        report: { hazardType: "mould remediation" },
      }),
    ).toEqual({
      mouldActive: true,
      powerAssessment: { circuits: 3, circuitRatingA: 16, deratePct: 0.7 },
    });
  });

  /**
   * The asymmetry is the point, and it is the only safe one.
   *
   * No power assessment means an assumed budget, clearly labelled. No Report row
   * means no mould signal — which is true, not a guess.
   */
  it("fails open on power and closed on mould for a bare row", () => {
    expect(planInputsFromRow({})).toEqual({
      mouldActive: false,
      powerAssessment: undefined,
    });
    expect(planInputsFromRow(null)).toEqual({
      mouldActive: false,
      powerAssessment: undefined,
    });
  });

  /**
   * Every signal the report reads must survive the join. This is the exact gap
   * CodeRabbit found on #2149 in the Margot tool: the row was selected without
   * `technicianFieldReport` and `tier1Responses`, so a job whose ONLY mould
   * signal was the technician's prose or the tier-1 checklist came back
   * mouldActive: false and allowed Phase 1 air movers — while the report for
   * that same job classified it mould-active.
   */
  it.each([
    ["the biological flag", { biologicalMouldDetected: true }],
    ["a recorded condition", { biologicalMouldCategory: "Condition 2" }],
    ["the hazard type", { hazardType: "mould remediation" }],
    [
      "the technician narrative alone",
      { technicianFieldReport: "Visible mould behind the vanity." },
    ],
    [
      "the tier-1 checklist alone",
      { tier1Responses: JSON.stringify({ T1_Q7_hazards: ["visible mould"] }) },
    ],
    [
      "a free-text tier-1 answer under another key",
      { tier1Responses: JSON.stringify({ T1_Q11_notes: "suspected mold" }) },
    ],
  ])("derives mouldActive from %s", (_label, report) => {
    expect(planInputsFromRow({ report }).mouldActive).toBe(true);
  });

  it("is false when the report carries no mould signal at all", () => {
    expect(
      planInputsFromRow({
        report: {
          biologicalMouldDetected: false,
          biologicalMouldCategory: null,
          hazardType: "water damage",
          technicianFieldReport: "Burst flexi hose under the vanity.",
          tier1Responses: JSON.stringify({ T1_Q7_hazards: ["slip hazard"] }),
        },
      }).mouldActive,
    ).toBe(false);
  });

  // Half an assessment is not an assessment; inventing the missing half would
  // produce a budget that reads as measured.
  it("treats a half-filled power assessment as none", () => {
    expect(
      planInputsFromRow({ powerCircuits: 2, powerCircuitRatingA: null })
        .powerAssessment,
    ).toBeUndefined();
  });
});
