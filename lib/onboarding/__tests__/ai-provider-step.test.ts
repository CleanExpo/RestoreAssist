import { describe, expect, it } from "vitest";
import {
  AI_PROVIDER_ROUTE,
  buildAiProviderOnboardingStep,
} from "../ai-provider-step";

describe("buildAiProviderOnboardingStep (RA-6801)", () => {
  it("does not require BYOK when a funded trial can use the platform key", () => {
    const step = buildAiProviderOnboardingStep({
      hasByokKey: false,
      canUsePlatformTrial: true,
    });
    expect(step.required).toBe(false);
    expect(step.completed).toBe(true);
    expect(step.title).toMatch(/trial credits/i);
    expect(step.route).toBe(AI_PROVIDER_ROUTE);
  });

  it("still hard-requires BYOK when there is no trial credential", () => {
    const step = buildAiProviderOnboardingStep({
      hasByokKey: false,
      canUsePlatformTrial: false,
    });
    expect(step.required).toBe(true);
    expect(step.completed).toBe(false);
    expect(step.title).toMatch(/add your anthropic or openai/i);
  });

  it("marks a personal key as complete and not required", () => {
    const step = buildAiProviderOnboardingStep({
      hasByokKey: true,
      canUsePlatformTrial: false,
    });
    expect(step.required).toBe(false);
    expect(step.completed).toBe(true);
    expect(step.title).toMatch(/configured/i);
  });
});
