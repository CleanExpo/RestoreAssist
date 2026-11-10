/**
 * RA-8276 defect 3: the FIRE_SMOKE completion step required MOISTURE_READING,
 * left over from the water template. A dry fire job could never pass
 * completion honestly. Water readings for a fire job with water present are
 * added by the Claim Pathway engine, not by the fire template.
 */
import { describe, it, expect } from "vitest";
import {
  buildWorkflowStepsData,
  getMandatoryEvidenceCount,
  getWorkflowTemplate,
} from "../workflow-definitions";
import { getStepGuidance } from "../adaptive-guidance";

describe("FIRE_SMOKE workflow completion", () => {
  const fire = getWorkflowTemplate("FIRE_SMOKE");
  const completion = fire.steps.find(
    (s) => s.stepKey === "completion_verification",
  );

  it("still has a completion step", () => {
    expect(completion).toBeDefined();
  });

  it("does not require moisture readings at any step", () => {
    const needing = fire.steps.filter((s) =>
      s.requiredEvidenceClasses.includes("MOISTURE_READING"),
    );
    expect(needing.map((s) => s.stepKey)).toEqual([]);
  });

  it("requires completion photos and client sign-off", () => {
    expect(completion?.requiredEvidenceClasses).toEqual(
      expect.arrayContaining(["PHOTO_COMPLETION", "AUTHORITY_FORM"]),
    );
  });

  it("does not change the water template's completion step", () => {
    const water = getWorkflowTemplate("WATER_DAMAGE").steps.find(
      (s) => s.stepKey === "completion_verification",
    );
    expect(water?.requiredEvidenceClasses).toContain("MOISTURE_READING");
  });
});

/**
 * RA-8276 review P1: the fire template reused water steps whose wording
 * (psychrometric baseline per S500, moisture boundaries, drying equipment)
 * is stored into every new fire workflow by buildWorkflowStepsData. A dry
 * fire job must not be instructed or cited as a water job.
 */
describe("FIRE_SMOKE workflow wording", () => {
  const WATER_WORDING =
    /S500|psychrometric|moisture|drying|dehumidif|air.?mover/i;

  it("no fire step description cites S500 or water drying", () => {
    const leaks = buildWorkflowStepsData("probe", "FIRE_SMOKE")
      .filter((s) =>
        WATER_WORDING.test(`${s.stepDescription} ${s.stepDescriptionShort}`),
      )
      .map((s) => s.stepKey);
    expect(leaks).toEqual([]);
  });

  it("keeps the same mandatory evidence count, so the submission gate is unchanged", () => {
    // 11 steps; value measured on main before the fire wording change.
    expect(getMandatoryEvidenceCount("FIRE_SMOKE")).toBe(20);
  });

  it("the fire site-conditions step has its own key and is not water-only", () => {
    const keys = getWorkflowTemplate("FIRE_SMOKE").steps.map((s) => s.stepKey);
    expect(keys).toContain("site_conditions");
    expect(keys).not.toContain("environmental_readings");
    const water = getWorkflowTemplate("WATER_DAMAGE").steps.find(
      (s) => s.stepKey === "environmental_readings",
    );
    expect(water?.waterOnly).toBe(true);
  });

  /**
   * Round 2 P1: guidance is looked up by stepKey, so a fire step that kept a
   * water key inherited "set up psychrometer" and "calculate dew point".
   * Every reader keyed on stepKey must see fire wording.
   */
  it("no fire step's guidance (looked up by key) carries water wording", () => {
    const GUIDANCE_WATER =
      /S500|psychromet|dew point|moisture|drying|dehumidif|air.?mover|grains/i;
    const leaks = getWorkflowTemplate("FIRE_SMOKE").steps.flatMap((step) => {
      const g = getStepGuidance(step.stepKey);
      const text = [
        ...g.subSteps.flatMap((x) => [x.label, x.detail ?? ""]),
        ...g.confirmingQuestions.map((q) => q.question),
        ...g.tips,
        ...g.commonMistakes,
        ...g.experiencedAlerts,
      ].join(" ");
      return GUIDANCE_WATER.test(text) ? [step.stepKey] : [];
    });
    expect(leaks).toEqual([]);
  });

  it("gives the site-conditions step real guidance", () => {
    expect(getStepGuidance("site_conditions").subSteps.length).toBeGreaterThan(
      0,
    );
  });
});
