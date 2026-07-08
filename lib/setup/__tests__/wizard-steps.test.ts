import { describe, it, expect } from "vitest";
import {
  WIZARD_STEPS,
  computeWizardState,
  firstIncompleteRequiredIndex,
  type WizardStepDef,
} from "../wizard-steps";

const STEPS: WizardStepDef[] = [
  { key: "welcome", title: "Welcome", required: false },
  { key: "ai_key", title: "AI key", required: true },
  { key: "business", title: "Business", required: true },
  { key: "review", title: "Review", required: false },
];

describe("computeWizardState — locked one-step-at-a-time", () => {
  it("blocks advancing past a required step until it is complete", () => {
    const atAiKey = computeWizardState(1, {}, STEPS);
    expect(atAiKey.currentStep.key).toBe("ai_key");
    expect(atAiKey.canAdvance).toBe(false); // required + incomplete

    const done = computeWizardState(1, { ai_key: true }, STEPS);
    expect(done.canAdvance).toBe(true);
  });

  it("always allows advancing past an optional step", () => {
    const atWelcome = computeWizardState(0, {}, STEPS);
    expect(atWelcome.currentStep.required).toBe(false);
    expect(atWelcome.canAdvance).toBe(true);
  });

  it("reports allRequiredComplete only when every required step is done", () => {
    expect(computeWizardState(0, {}, STEPS).allRequiredComplete).toBe(false);
    expect(
      computeWizardState(0, { ai_key: true }, STEPS).allRequiredComplete,
    ).toBe(false);
    expect(
      computeWizardState(0, { ai_key: true, business: true }, STEPS)
        .allRequiredComplete,
    ).toBe(true);
  });

  it("marks first/last correctly and counts completed steps", () => {
    const first = computeWizardState(0, { welcome: true }, STEPS);
    expect(first.isFirstStep).toBe(true);
    expect(first.isLastStep).toBe(false);
    expect(first.completedCount).toBe(1);

    const last = computeWizardState(3, {}, STEPS);
    expect(last.isLastStep).toBe(true);
  });

  it("clamps an out-of-range index into bounds", () => {
    expect(computeWizardState(-5, {}, STEPS).currentIndex).toBe(0);
    expect(computeWizardState(99, {}, STEPS).currentIndex).toBe(
      STEPS.length - 1,
    );
  });
});

describe("firstIncompleteRequiredIndex", () => {
  it("returns the first incomplete required step", () => {
    expect(firstIncompleteRequiredIndex({}, STEPS)).toBe(1); // ai_key
    expect(firstIncompleteRequiredIndex({ ai_key: true }, STEPS)).toBe(2); // business
  });

  it("returns the last step (finish line) when all required are complete", () => {
    expect(
      firstIncompleteRequiredIndex({ ai_key: true, business: true }, STEPS),
    ).toBe(STEPS.length - 1);
  });
});

describe("WIZARD_STEPS canonical list", () => {
  it("starts at welcome, ends at first_report, and gates ai_key + business", () => {
    expect(WIZARD_STEPS[0].key).toBe("welcome");
    expect(WIZARD_STEPS[WIZARD_STEPS.length - 1].key).toBe("first_report");
    const required = WIZARD_STEPS.filter((s) => s.required).map((s) => s.key);
    expect(required).toEqual(["ai_key", "business"]);
  });
});
