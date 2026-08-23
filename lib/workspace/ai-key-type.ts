/**
 * Map Integrations UI AI-key picks ↔ ProviderConnection AiProvider enum.
 * GOOGLE in the BYOK store is Gemini (Generative Language API), not Drive OAuth.
 */

import type { AiProvider } from "@/lib/workspace/provider-connections";
import type { AIProvider } from "@/lib/ai-provider";

export type UiAiKeyType = "anthropic" | "openai" | "gemini" | "openrouter";

/** Every UI key type, in the order the pickers offer them. */
export const UI_AI_KEY_TYPES: readonly UiAiKeyType[] = [
  "anthropic",
  "openai",
  "gemini",
  "openrouter",
] as const;

/**
 * Narrow an untrusted value — a persisted `config.apiKeyType`, a `<select>`
 * value — to a UiAiKeyType.
 *
 * Deliberately a list membership test, not `value in SOME_RECORD`: `in` walks
 * the prototype chain, so `"toString"` and `"constructor"` would pass and the
 * caller would then index a record with them and read `undefined` copy.
 */
export function isUiAiKeyType(value: unknown): value is UiAiKeyType {
  return (
    typeof value === "string" &&
    (UI_AI_KEY_TYPES as readonly string[]).includes(value)
  );
}

export function uiAiKeyTypeToProvider(keyType: UiAiKeyType): AiProvider {
  switch (keyType) {
    case "anthropic":
      return "ANTHROPIC";
    case "openai":
      return "OPENAI";
    case "gemini":
      return "GOOGLE";
    case "openrouter":
      return "OPENROUTER";
  }
}

/**
 * The vendor a pasted credential's prefix implies, or null when the format is
 * unrecognised.
 *
 * This is the ONE prefix table in the codebase. `providerForKey`
 * (lib/ai-provider.ts) delegates here rather than keeping a second copy — two
 * tables would be free to drift, and the server one decides which vendor a key
 * is actually sent to. It lives in this module because the Integrations page is
 * a client component and cannot import lib/ai-provider.ts (Prisma + vendor
 * SDKs); this module is pure and type-only at its edges.
 *
 *   Anthropic:  sk-ant-…
 *   OpenRouter: sk-or-…  (checked before OpenAI — an OpenRouter key also starts
 *               with the generic `sk-` prefix, so order is load-bearing here)
 *   Gemini:     AIza…
 *   OpenAI:     sk-… / sk-proj-…
 */
export function uiAiKeyTypeForKey(
  apiKey: string | null | undefined,
): UiAiKeyType | null {
  if (!apiKey) return null;
  const k = apiKey.trim();
  if (k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("sk-or-")) return "openrouter";
  if (k.startsWith("AIza")) return "gemini";
  if (k.startsWith("sk-")) return "openai";
  return null;
}

/**
 * The vendor a key's prefix says it belongs to, when that CONTRADICTS the
 * provider the operator picked — otherwise null.
 *
 * Saving a key under the wrong provider is silent at save time and only
 * surfaces later as an opaque upstream auth failure during report generation,
 * because the BYOK dispatch path routes on the stored enum
 * (`aiProviderToCallProvider`), not on the key. It is an easy mistake to make:
 * an OpenRouter key and an OpenAI key both begin `sk-`.
 *
 * An unrecognised prefix returns null — never block a format this table has
 * simply not seen (a proxy key, a future prefix). Only a positive, confident
 * disagreement is worth refusing.
 */
export function mismatchedKeyType(
  selected: UiAiKeyType,
  apiKey: string | null | undefined,
): UiAiKeyType | null {
  const implied = uiAiKeyTypeForKey(apiKey);
  if (!implied || implied === selected) return null;
  return implied;
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
