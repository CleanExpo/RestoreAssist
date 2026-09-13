/**
 * Canonical `ai_provider` onboarding step. The status route and its tests
 * share this builder so "is BYOK required?" cannot drift from the copy.
 */

import type { OnboardingApiStep } from "@/lib/onboarding/steps";

export const AI_PROVIDER_ROUTE = "/dashboard/settings/ai-providers";

export function buildAiProviderOnboardingStep(input: {
  hasByokKey: boolean;
  canUsePlatformTrial: boolean;
}): OnboardingApiStep {
  const { hasByokKey, canUsePlatformTrial } = input;

  if (hasByokKey) {
    return {
      completed: true,
      required: false,
      title: "AI provider key configured",
      description:
        "An Anthropic or OpenAI API key is configured — AI report generation is active.",
      route: AI_PROVIDER_ROUTE,
    };
  }

  // RA-6801: funded trial — BYOK is an optional upgrade, not a hard gate.
  if (canUsePlatformTrial) {
    return {
      completed: true,
      required: false,
      title: "Trial credits ready — add your own key anytime",
      description:
        "Platform trial credits power report generation. Add your own Anthropic or OpenAI key anytime as an optional upgrade — you pay the provider directly.",
      route: AI_PROVIDER_ROUTE,
    };
  }

  return {
    completed: false,
    required: true,
    title: "Add your Anthropic or OpenAI API key",
    description:
      "An Anthropic or OpenAI API key is required to operate RestoreAssist. You pay providers directly, at cost. Add it in Settings → AI Providers.",
    route: AI_PROVIDER_ROUTE,
  };
}
