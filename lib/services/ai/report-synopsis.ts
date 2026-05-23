/**
 * One-line synopsis generator for restoration reports.
 *
 * Composes lib/services/ai/anthropic-gateway.ts via callAnthropic with the
 * Haiku model. Returns ServiceResult<string, AnthropicReason | "EMPTY_OUTPUT">.
 *
 * The route at app/api/reports/[id]/synopsis/route.ts owns:
 *   - auth, subscription gate, rate-limit, ownership-check
 *   - 24h cache lookup + persistence
 *   - HYBRID KEY FLOW: tries getAnthropicApiKey(userId), falls back to
 *     process.env.ANTHROPIC_API_KEY. Pre-resolved key is passed to this
 *     service via the apiKey arg.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { callAnthropic } from "./anthropic-gateway";
import type { AnthropicReason } from "./anthropic-gateway";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 60;
const TEMPERATURE = 0.3;
const MAX_SYNOPSIS_CHARS = 280;

export type SynopsisReason = AnthropicReason | "EMPTY_OUTPUT";

export interface SynopsisFacts {
  waterCategory: string | null;
  waterClass: string | null;
  hazardType: string | null;
  affectedArea: number | null;
  estimatedDryingTime: number | null;
  totalCost: number | null;
  propertyAddress: string | null;
}

function buildFactsBlock(f: SynopsisFacts): string {
  return [
    f.waterCategory ? `Water ${f.waterCategory}` : null,
    f.waterClass ? `Class ${f.waterClass}` : null,
    f.hazardType ? `Hazard: ${f.hazardType}` : null,
    f.affectedArea != null ? `Affected area: ${f.affectedArea} m²` : null,
    f.estimatedDryingTime != null
      ? `Drying: ${f.estimatedDryingTime} hours`
      : null,
    f.totalCost != null
      ? `Total: AUD $${Number(f.totalCost).toLocaleString()}`
      : null,
    f.propertyAddress ? `Property: ${f.propertyAddress}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateReportSynopsis(args: {
  apiKey: string;
  facts: SynopsisFacts;
}): Promise<ServiceResult<string, SynopsisReason>> {
  const factsBlock = buildFactsBlock(args.facts);
  const prompt = `Summarise this water damage restoration report in ONE sentence (max 20 words). Include water category, affected area, drying duration, and total cost. Australian English. Plain text, no quotes.\n\n${factsBlock}`;

  const gatewayResult = await callAnthropic({
    userId: "system",
    apiKey: args.apiKey,
    request: {
      model: HAIKU_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      messages: [{ role: "user", content: prompt }],
    },
  });

  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  const first = gatewayResult.data.content[0];
  if (!first || first.type !== "text") {
    return fail("EMPTY_OUTPUT", {
      detail: "Model returned no text content",
    });
  }

  const cleaned = first.text
    .trim()
    .replace(/^["']|["']$/g, "")
    .slice(0, MAX_SYNOPSIS_CHARS);

  return ok(cleaned);
}
