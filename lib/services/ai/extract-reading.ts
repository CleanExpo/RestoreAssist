/**
 * Moisture-meter reading extractor (Claude Vision).
 *
 * Composes lib/services/ai/anthropic-gateway.ts (platform-key flow) with
 * the meter-extraction prompt + JSON parser from lib/vision/meter-prompts.ts.
 * Action layer (app/api/vision/extract-reading/route.ts) maps result.reason
 * to HTTP status codes.
 *
 * Uses the PLATFORM key (process.env.ANTHROPIC_API_KEY) — the action layer
 * reads the env and passes it via `apiKey`; the service stays env-agnostic
 * for testability.
 *
 * Reasons:
 *  - <AnthropicReason>          — bubbled from the gateway
 *  - PARSE_FAILED               — model output was not valid JSON / wrong shape
 *  - NO_READING_DETECTED        — model said it cannot read the display
 *                                 (valid JSON, readingValue null, confidence "low")
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { callAnthropic } from "./anthropic-gateway";
import type { AnthropicReason } from "./anthropic-gateway";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";
import {
  METER_EXTRACTION_SYSTEM_PROMPT,
  buildMeterExtractionMessages,
  parseMeterResponse,
  type MeterReadingResult,
} from "@/lib/vision/meter-prompts";

export type ExtractReadingReason =
  | AnthropicReason
  | "PARSE_FAILED"
  | "NO_READING_DETECTED";

export async function extractMeterReading(args: {
  apiKey: string;
  image: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}): Promise<ServiceResult<MeterReadingResult, ExtractReadingReason>> {
  const messages = buildMeterExtractionMessages(args.image, args.mediaType);

  const gatewayResult = await callAnthropic({
    userId: "system",
    apiKey: args.apiKey,
    request: {
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: METER_EXTRACTION_SYSTEM_PROMPT,
      messages,
    },
  });

  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  const textBlock = gatewayResult.data.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";

  const parsed = parseMeterResponse(raw);
  if (!parsed) {
    return fail("PARSE_FAILED", {
      detail: `Model output was not valid JSON: ${raw.slice(0, 200)}`,
    });
  }

  // Model parsed cleanly but explicitly says "no reading visible".
  if (parsed.readingValue === null && parsed.confidence === "low") {
    return fail("NO_READING_DETECTED", {
      detail:
        parsed.notes ??
        "Model could not read the meter display with sufficient confidence",
    });
  }

  return ok(parsed);
}
