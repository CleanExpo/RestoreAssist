/**
 * Map Integrations UI AI-key picks ↔ ProviderConnection AiProvider enum.
 * GOOGLE in the BYOK store is Gemini (Generative Language API), not Drive OAuth.
 */

import type { AiProvider } from "@/lib/workspace/provider-connections";
import type { AIProvider } from "@/lib/ai-provider";

export type UiAiKeyType = "anthropic" | "openai" | "gemini";

export function uiAiKeyTypeToProvider(keyType: UiAiKeyType): AiProvider {
  switch (keyType) {
    case "anthropic":
      return "ANTHROPIC";
    case "openai":
      return "OPENAI";
    case "gemini":
      return "GOOGLE";
  }
}

/** Map BYOK AiProvider → callAIProvider lowercase switch keys. */
export function aiProviderToCallProvider(
  provider: AiProvider,
): AIProvider | null {
  switch (provider) {
    case "ANTHROPIC":
      return "anthropic";
    case "OPENAI":
      return "openai";
    case "GOOGLE":
      return "gemini";
    case "OPENROUTER":
      return "openrouter";
    default:
      return null;
  }
}
