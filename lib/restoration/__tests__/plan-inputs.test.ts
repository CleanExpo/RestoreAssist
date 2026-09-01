import { describe, it, expect } from "vitest";
import {
  ASSUMED_POWER_ASSESSMENT,
  deriveMouldActive,
  powerAssessmentFromInspection,
  resolvePowerAssessment,
} from "../plan-inputs";

describe("powerAssessmentFromInspection", () => {
  it("reads a captured assessment, defaulting the derate to 80%", () => {
    expect(
      powerAssessmentFromInspection({
        powerCircuits: 3,
        powerCircuitRatingA: 16,
        powerDeratePct: null,
      }),
    ).toEqual({ circuits: 3, circuitRatingA: 16, deratePct: 0.8 });
  });

  it("keeps an explicit derate", () => {
    expect(
      powerAssessmentFromInspection({
        powerCircuits: 2,
        powerCircuitRatingA: 20,
        powerDeratePct: 0.7,
      })?.deratePct,
    ).toBe(0.7);
  });

  // Half an assessment is not an assessment. Inventing the missing half would
  // produce a budget that reads as measured.
  it.each([
    { powerCircuits: 2, powerCircuitRatingA: null },
    { powerCircuits: null, powerCircuitRatingA: 20 },
    { powerCircuits: 0, powerCircuitRatingA: 20 },
    {},
  ])("returns undefined for a half-filled assessment %j", (cols) => {
    expect(powerAssessmentFromInspection(cols)).toBeUndefined();
  });

  it("returns undefined for a missing inspection", () => {
    expect(powerAssessmentFromInspection(null)).toBeUndefined();
  });
});

describe("resolvePowerAssessment", () => {
  it("passes a real assessment through and reports it as measured", () => {
    const assessment = { circuits: 4, circuitRatingA: 20 };

    expect(resolvePowerAssessment(assessment)).toEqual({
      assessment,
      assumed: false,
    });
  });

  // The flag is the point: a caller that drops it produces a plan
  // indistinguishable from one built on an electrician's real numbers.
  it("falls back to 2x20A and flags it as assumed", () => {
    expect(resolvePowerAssessment(undefined)).toEqual({
      assessment: ASSUMED_POWER_ASSESSMENT,
      assumed: true,
    });
  });
});

describe("deriveMouldActive", () => {
  it("is false when nothing indicates mould", () => {
    expect(
      deriveMouldActive({
        biologicalMouldDetected: false,
        hazardType: "water damage",
        hazards: ["asbestos"],
      }),
    ).toBe(false);
    expect(deriveMouldActive(null)).toBe(false);
    expect(deriveMouldActive({})).toBe(false);
  });

  // Any one signal is enough. The outcomes are not symmetric: a false positive
  // costs a phased plan the job did not need; a false negative puts air movers
  // over live growth.
  it.each([
    ["the detected flag", { biologicalMouldDetected: true }],
    ["a recorded category", { biologicalMouldCategory: "Condition 2" }],
    ["the hazard type", { hazardType: "Mould remediation" }],
    ["a tier-1 hazard", { hazards: ["confined space", "visible mould"] }],
  ])("is true from %s alone", (_label, signals) => {
    expect(deriveMouldActive(signals)).toBe(true);
  });

  // hazardType previously matched only "mould" while the tier-1 list matched
  // both spellings, so an American-spelled hazardType slipped through. Both
  // fields now accept either.
  it("matches the American spelling in both free-text fields", () => {
    expect(deriveMouldActive({ hazardType: "mold growth" })).toBe(true);
    expect(deriveMouldActive({ hazards: ["black mold"] })).toBe(true);
  });
});
