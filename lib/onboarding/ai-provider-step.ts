/**
 * Canonical `ai_provider` onboarding step. The status route and its tests
 * share this builder so "is BYOK required?" cannot drift from the copy.
 */

import { formatDate } from "@/lib/locale/format";
import type { OnboardingApiStep } from "@/lib/onboarding/steps";
import {
  PAID_AI_KEY_REQUIRED_BODY,
  PLATFORM_KEY_MISSING_BODY,
  PLATFORM_KEY_MISSING_TITLE,
} from "@/lib/signup-pricing-honesty";

export const AI_PROVIDER_ROUTE = "/dashboard/settings/ai-providers";
export const AI_PROVIDER_QUERY_PARAM = "provider";

const PROVIDER_LABELS: Record<string, string> = {
  ANTHROPIC: "Anthropic",
  OPENAI: "OpenAI",
  GOOGLE: "Google",
  OPENROUTER: "OpenRouter",
};

const SETTINGS_PROVIDERS = [
  "ANTHROPIC",
  "OPENAI",
  "GOOGLE",
  "GEMMA",
  "OPENROUTER",
] as const;

export function labelForAiProvider(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/** Settings path that lands on a specific provider row, open. */
export function aiProviderSettingsHref(provider?: string): string {
  if (!provider) return AI_PROVIDER_ROUTE;
  return `${AI_PROVIDER_ROUTE}?${AI_PROVIDER_QUERY_PARAM}=${encodeURIComponent(provider)}`;
}

/** Read `?provider=` from the AI-providers settings URL. */
export function parseAiProviderQueryParam(
  value: string | null | undefined,
): (typeof SETTINGS_PROVIDERS)[number] | null {
  if (!value) return null;
  const normalised = value.trim().toUpperCase();
  return SETTINGS_PROVIDERS.find((id) => id === normalised) ?? null;
}

export function buildAiProviderOnboardingStep(input: {
  hasByokKey: boolean;
  canUsePlatformTrial: boolean;
  /** In-date TRIAL with credits — platform should supply even if env key is missing. */
  fundedTrial?: boolean;
  rejectedKey?: { provider: string; rejectedAt: Date } | null;
}): OnboardingApiStep {
  const { hasByokKey, canUsePlatformTrial, fundedTrial, rejectedKey } = input;

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

  // RA-7569: the owner is on a funded trial, so the platform should supply
  // the key. A missing env key is a platform fail — never "add your key".
  if (fundedTrial) {
    return {
      completed: false,
      required: false,
      title: PLATFORM_KEY_MISSING_TITLE,
      description: PLATFORM_KEY_MISSING_BODY,
      route: AI_PROVIDER_ROUTE,
    };
  }

  // RA-7428: a stored key that failed validation is not "missing". Say it
  // was rejected, with the date, and send the user to replace it.
  if (rejectedKey) {
    const label = labelForAiProvider(rejectedKey.provider);
    const rejectedOn = formatDate(rejectedKey.rejectedAt, "AU");
    return {
      completed: false,
      required: true,
      title: `Your ${label} key was rejected on ${rejectedOn}`,
      description:
        "The stored key failed validation. Replace it to generate reports.",
      route: aiProviderSettingsHref(rejectedKey.provider),
      rejectedKey: {
        provider: rejectedKey.provider,
        rejectedAt: rejectedKey.rejectedAt.toISOString(),
      },
    };
  }

  return {
    completed: false,
    required: true,
    title: "Add your Anthropic or OpenAI API key",
    description: PAID_AI_KEY_REQUIRED_BODY,
    route: AI_PROVIDER_ROUTE,
  };
}
