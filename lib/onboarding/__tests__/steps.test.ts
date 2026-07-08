import { describe, it, expect } from "vitest";
import {
  toOnboardingDisplaySteps,
  completedGuideStepNumbers,
  ONBOARDING_STEP_TIME,
  type OnboardingApiStep,
} from "../steps";

function step(overrides: Partial<OnboardingApiStep> = {}): OnboardingApiStep {
  return {
    completed: false,
    required: false,
    title: "Title",
    description: "Desc",
    route: "/dashboard",
    ...overrides,
  };
}

// A representative slice of the server's canonical steps map.
const apiSteps: Record<string, OnboardingApiStep> = {
  ai_provider: step({ title: "Add your key", route: "/dashboard/settings/ai-providers", completed: true }),
  business_profile: step({ title: "Settings & Profile", route: "/dashboard/settings", required: true }),
  pricing_config: step({ title: "Pricing Configuration", route: "/dashboard/pricing-config", required: true }),
  first_report: step({ title: "Generate your first report", route: "/dashboard/reports/new" }),
  property_data: step({ title: "Connect Property Data", route: "/dashboard/integrations" }),
};

describe("toOnboardingDisplaySteps", () => {
  it("maps every server step to a display step, preserving order and never adding extras", () => {
    const display = toOnboardingDisplaySteps(apiSteps);
    expect(display.map((s) => s.id)).toEqual([
      "ai_provider",
      "business_profile",
      "pricing_config",
      "first_report",
      "property_data",
    ]);
    // route → href, and the count is exactly the server's — no client injection.
    expect(display).toHaveLength(5);
    expect(display[2]).toMatchObject({
      id: "pricing_config",
      title: "Pricing Configuration",
      href: "/dashboard/pricing-config",
      required: true,
      completed: false,
    });
  });

  it("does NOT produce a duplicate pricing row (the old FALLBACK_STEPS merge bug)", () => {
    const display = toOnboardingDisplaySteps(apiSteps);
    const pricingRows = display.filter((s) =>
      /pricing/i.test(s.title) || s.href === "/dashboard/pricing-config",
    );
    expect(pricingRows).toHaveLength(1);
    // The stale fallback ids must never appear.
    expect(display.some((s) => s.id === "pricing")).toBe(false);
    expect(display.some((s) => s.id === "integration")).toBe(false);
  });

  it("applies the canonical time estimate, defaulting for unknown ids", () => {
    const display = toOnboardingDisplaySteps({
      pricing_config: step(),
      mystery_step: step(),
    });
    expect(display.find((s) => s.id === "pricing_config")!.time).toBe(
      ONBOARDING_STEP_TIME.pricing_config,
    );
    expect(display.find((s) => s.id === "mystery_step")!.time).toBe("~5 min");
  });

  it("returns [] for null/undefined/empty input", () => {
    expect(toOnboardingDisplaySteps(null)).toEqual([]);
    expect(toOnboardingDisplaySteps(undefined)).toEqual([]);
    expect(toOnboardingDisplaySteps({})).toEqual([]);
  });
});

describe("completedGuideStepNumbers", () => {
  it("maps completed API keys to the guide's numeric positions", () => {
    const nums = completedGuideStepNumbers({
      business_profile: step({ completed: true }),
      pricing_config: step({ completed: true }),
      first_report: step({ completed: false }),
      ai_provider: step({ completed: true }), // not a guide step → ignored
    });
    expect(nums.sort()).toEqual([0, 1]);
  });

  it("never returns NaN (regression: the old parseInt(key.split('_')[1]) bug)", () => {
    const nums = completedGuideStepNumbers({
      ai_provider: step({ completed: true }),
      first_inspection: step({ completed: true }),
    });
    // Neither maps to a guide position, so the result is empty — and crucially
    // contains no NaN entries as the old implementation would have.
    expect(nums).toEqual([]);
    expect(nums.some((n) => Number.isNaN(n))).toBe(false);
  });

  it("returns [] for null/undefined", () => {
    expect(completedGuideStepNumbers(null)).toEqual([]);
    expect(completedGuideStepNumbers(undefined)).toEqual([]);
  });
});
