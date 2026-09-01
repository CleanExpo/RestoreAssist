import { describe, it, expect } from "vitest";
import { deriveHazardProfile } from "../build-structured-report";
import { deriveMouldActive } from "@/lib/restoration/plan-inputs";

/**
 * The two mould determinations must agree on every job.
 *
 * `deriveHazardProfile` decides the hazard profile's `mouldCondition`;
 * `deriveMouldActive` decides what `planDrying` is told. When they disagreed,
 * one report could be classified mould-active AND have air movers planned into
 * Phase 1 — the contradiction #2149 and #2150 exist to remove.
 *
 * `deriveHazardProfile` now delegates its boolean determination to
 * `deriveMouldActive`, so agreement holds by construction. These lock that in:
 * un-doing the delegation, or widening one signal set without the other, turns
 * them red.
 *
 * Note `mouldCondition` is a 0-3 scale, not a boolean: a recorded
 * `biologicalMouldCategory` sets the specific condition, and any other signal
 * sets 3. So the invariant asserted is `mouldCondition > 0` <=> `mouldActive`,
 * not equality of the numbers.
 */
const CASES: Array<{
  name: string;
  report: Record<string, unknown>;
  tier1: Record<string, unknown>;
  /** What BOTH determinations must say. Absolute, not relative — see below. */
  expected: boolean;
}> = [
  {
    name: "nothing indicating mould",
    expected: false,
    report: { hazardType: "water damage", technicianFieldReport: "Burst hose." },
    tier1: { T1_Q7_hazards: ["slip hazard"] },
  },
  {
    name: "the biological flag alone",
    expected: true,
    report: { biologicalMouldDetected: true },
    tier1: {},
  },
  {
    name: "a recorded condition alone",
    expected: true,
    report: { biologicalMouldCategory: "Condition 2" },
    tier1: {},
  },
  {
    name: "the hazard type alone",
    expected: true,
    report: { hazardType: "mould remediation" },
    tier1: {},
  },
  // The two CodeRabbit found on #2149. Both were caught by the hazard profile
  // and missed by the drying plan.
  {
    name: "the technician narrative alone",
    expected: true,
    report: { technicianFieldReport: "Visible mould behind the vanity." },
    tier1: {},
  },
  {
    name: "the tier-1 hazard checklist alone",
    expected: true,
    report: {},
    tier1: { T1_Q7_hazards: ["visible mould growth"] },
  },
  {
    name: "a free-text tier-1 answer under some other key",
    expected: true,
    report: {},
    tier1: { T1_Q11_notes: "suspected mold in the wall cavity" },
  },
  {
    name: "the American spelling in the narrative",
    expected: true,
    report: { technicianFieldReport: "black mold on the plasterboard" },
    tier1: {},
  },
];

describe("mould signal parity — hazard profile vs drying plan", () => {
  it.each(CASES)(
    "both flag $name as mould=$expected",
    ({ report, tier1, expected }) => {
      const mouldActive = deriveMouldActive({
        biologicalMouldDetected: report.biologicalMouldDetected as boolean,
        biologicalMouldCategory: report.biologicalMouldCategory as string,
        hazardType: report.hazardType as string,
        hazards: (tier1 as { T1_Q7_hazards?: string[] }).T1_Q7_hazards,
        technicianFieldReport: report.technicianFieldReport as string,
        tier1,
      });

      // Third argument deliberately omitted: this asserts the hazard profile
      // reaches the same answer ON ITS OWN. Passing mouldActive in would make
      // the OR trivially true and the test vacuous.
      const profile = deriveHazardProfile(report, tier1);

      // ABSOLUTE, not relative. Asserting only that the two AGREE is close to
      // vacuous now that deriveHazardProfile delegates to deriveMouldActive:
      // narrowing the shared helper narrows both sides equally and they go on
      // agreeing — on being wrong. Verified by trying it: with the free-text
      // sweep removed from deriveMouldActive, an agreement-only assertion still
      // passed all nine cases. Pinning the expected answer is what catches it.
      expect(mouldActive).toBe(expected);
      expect(profile.mouldCondition > 0).toBe(expected);
    },
  );

  it("keeps the specific condition when one is recorded, rather than flattening to 3", () => {
    const profile = deriveHazardProfile(
      { biologicalMouldCategory: "Condition 2" },
      {},
    );

    expect(profile.mouldCondition).toBe(2);
  });
});
