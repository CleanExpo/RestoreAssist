import { describe, expect, it } from "vitest";
import {
  AI_PROVIDER_ROUTE,
  aiProviderSettingsHref,
  buildAiProviderOnboardingStep,
  parseAiProviderQueryParam,
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

  it("keeps the Settings → AI Providers upgrade path when trial credits cover generation", () => {
    const step = buildAiProviderOnboardingStep({
      hasByokKey: false,
      canUsePlatformTrial: true,
    });
    expect(step.route).toBe(AI_PROVIDER_ROUTE);
    expect(step.description).toMatch(/add your own/i);
  });

  it("still hard-requires BYOK when there is no trial credential", () => {
    const step = buildAiProviderOnboardingStep({
      hasByokKey: false,
      canUsePlatformTrial: false,
    });
    expect(step.required).toBe(true);
    expect(step.completed).toBe(false);
    expect(step.title).toMatch(/add your anthropic or openai/i);
    expect(step.description).toMatch(/after the trial/i);
    expect(step.description).not.toMatch(/required to operate/i);
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

  it("says the stored key was rejected, with the date, instead of asking to add a key (RA-7428)", () => {
    const step = buildAiProviderOnboardingStep({
      hasByokKey: false,
      canUsePlatformTrial: false,
      rejectedKey: {
        provider: "ANTHROPIC",
        rejectedAt: new Date("2026-08-25T00:00:00Z"),
      },
    });
    expect(step.required).toBe(true);
    expect(step.completed).toBe(false);
    expect(step.title).toMatch(/Your Anthropic key was rejected on/);
    expect(step.title).toMatch(/25/);
    expect(step.title).toMatch(/Aug/);
    expect(step.title).not.toMatch(/add/i);
    expect(step.description).toMatch(/failed validation/i);
    expect(step.description).not.toMatch(/add your/i);
    expect(step.route).toBe(
      "/dashboard/settings/ai-providers?provider=ANTHROPIC",
    );
    expect(step.rejectedKey).toEqual({
      provider: "ANTHROPIC",
      rejectedAt: "2026-08-25T00:00:00.000Z",
    });
  });

  it("does not treat a rejected key as missing when an active key exists", () => {
    const step = buildAiProviderOnboardingStep({
      hasByokKey: true,
      canUsePlatformTrial: false,
      rejectedKey: {
        provider: "ANTHROPIC",
        rejectedAt: new Date("2026-08-25T00:00:00Z"),
      },
    });
    expect(step.completed).toBe(true);
    expect(step.rejectedKey).toBeUndefined();
    expect(step.title).toMatch(/configured/i);
  });

  it("keeps trial-credits copy when platform credits cover generation", () => {
    const step = buildAiProviderOnboardingStep({
      hasByokKey: false,
      canUsePlatformTrial: true,
      rejectedKey: {
        provider: "ANTHROPIC",
        rejectedAt: new Date("2026-08-25T00:00:00Z"),
      },
    });
    expect(step.completed).toBe(true);
    expect(step.rejectedKey).toBeUndefined();
    expect(step.title).toMatch(/trial credits/i);
  });
});

describe("ai-provider settings deep-link (RA-7428)", () => {
  it("parses a provider query and ignores unknown values", () => {
    expect(parseAiProviderQueryParam("ANTHROPIC")).toBe("ANTHROPIC");
    expect(parseAiProviderQueryParam("anthropic")).toBe("ANTHROPIC");
    expect(parseAiProviderQueryParam("not-a-provider")).toBeNull();
    expect(parseAiProviderQueryParam(null)).toBeNull();
    expect(aiProviderSettingsHref("ANTHROPIC")).toBe(
      "/dashboard/settings/ai-providers?provider=ANTHROPIC",
    );
  });
});
