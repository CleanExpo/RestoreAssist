/**
 * RA-1208: Period-over-period analytics narrative for /dashboard/analytics.
 *
 * Composes lib/services/ai/anthropic-gateway.ts. The action layer
 * (app/api/analytics/narrative/route.ts) computes the deltas + handles caching
 * and maps result.reason to HTTP.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { callAnthropic } from "./anthropic-gateway";
import type { AnthropicReason } from "./anthropic-gateway";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";

const SYSTEM_PROMPT = [
  "You are analysing a water-damage restoration business in Australia.",
  "Write 2-3 sentences in plain Australian English explaining what changed this period.",
  "Focus on the 2-3 largest drivers (job types, suburbs, insurers, clients).",
  "No speculation — only state what the numbers show.",
  "Currency is AUD. Use $ and round to nearest $100 or 'K' (e.g. '$12.4K').",
  "Do not use bullet points. Write as flowing prose.",
].join(" ");

export type AnalyticsNarrativeReason = AnthropicReason | "PARSE_FAILED";

export interface AnalyticsNarrativeInput {
  period: "month" | "quarter" | "year";
  deltas: Record<string, unknown>;
}

export interface AnalyticsNarrativeResult {
  narrative: string;
}

export async function generateAnalyticsNarrative(args: {
  apiKey: string;
  input: AnalyticsNarrativeInput;
}): Promise<ServiceResult<AnalyticsNarrativeResult, AnalyticsNarrativeReason>> {
  const gatewayResult = await callAnthropic({
    // Platform-key flow: the route already resolved the per-user key via
    // getAnthropicApiKey + the 424 onboarding affordance, so we pass it
    // through as an override and skip the gateway's own lookup.
    userId: "",
    apiKey: args.apiKey,
    request: {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Period-over-period deltas (current vs previous ${args.input.period}):\n\n${JSON.stringify(args.input.deltas, null, 2)}`,
        },
      ],
    },
  });

  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  const textBlock = gatewayResult.data.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return fail("PARSE_FAILED", {
      detail: "Anthropic response contained no text block",
    });
  }

  const raw = textBlock.text.trim();
  // Tolerant: strip ```json fences if the model added them despite prose-only
  // instructions in the system prompt.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  if (cleaned.length === 0) {
    return fail("PARSE_FAILED", {
      detail: "Model returned an empty narrative",
    });
  }

  return ok({ narrative: cleaned });
}
