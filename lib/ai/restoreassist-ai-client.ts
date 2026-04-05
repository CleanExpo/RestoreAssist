/**
 * [RA-403] RestoreAssist AI Client — Self-hosted Gemma-4-31B-IT
 * Apache 2.0 licensed, vision+audio capable, self-hosted on A10G.
 * $0.14/$0.40 per 1M tokens (input/output).
 *
 * This is a SEPARATE tier from BYOK — RestoreAssist hosts this model
 * as a free/included AI option. Falls back to BYOK if unavailable.
 *
 * BYOK allowlist is IMMUTABLE and NOT modified by this file.
 */

import type {
  VisionInput,
  ByokResponse,
  S500StructuredOutput,
  ByokRequest,
} from "./byok-client";
import {
  byokDispatch,
  parseS500Output,
  S500_VISION_SYSTEM_PROMPT,
} from "./byok-client";

// ━━━ RestoreAssist AI Configuration ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Self-hosted model identifier */
export const RESTOREASSIST_AI_MODEL = "gemma-4-31b-it" as const;

/** Display name shown in UI */
export const RESTOREASSIST_AI_DISPLAY_NAME = "RestoreAssist AI";

/** Self-hosted inference endpoint (A10G) */
const RESTOREASSIST_AI_ENDPOINT =
  process.env.RESTOREASSIST_AI_ENDPOINT ?? "https://ai.restoreassist.com.au/v1";

/** Internal API key for self-hosted endpoint */
const RESTOREASSIST_AI_API_KEY = process.env.RESTOREASSIST_AI_API_KEY ?? "";

/** Cost per 1M tokens (USD) — used for usage metering */
export const RESTOREASSIST_AI_PRICING = {
  inputPer1M: 0.14,
  outputPer1M: 0.4,
} as const;

/** Health check timeout in ms */
const HEALTH_CHECK_TIMEOUT_MS = 5000;

/** Request timeout in ms */
const DEFAULT_TIMEOUT_MS = 90000;

// ━━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AiTier = "restoreassist" | "byok";

export interface RestoreAssistAiRequest {
  /** System prompt */
  systemPrompt: string;
  /** User text prompt */
  userPrompt: string;
  /** Optional vision inputs */
  visionInputs?: VisionInput[];
  /** Temperature (0.0–1.0). Default 0.3 */
  temperature?: number;
  /** Max output tokens. Default 4096 */
  maxTokens?: number;
  /** Request timeout in ms. Default 90000 */
  timeoutMs?: number;
}

export interface RestoreAssistAiResponse {
  /** The generated text response */
  text: string;
  /** Which model generated the response */
  model: string;
  /** Which tier was used */
  tier: AiTier;
  /** Token usage if available */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Estimated cost in USD */
  estimatedCostUsd?: number;
  /** Request duration in ms */
  durationMs: number;
  /** Whether this was a fallback to BYOK */
  fellBackToBYOK: boolean;
}

// ━━━ Health Check ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Cached health status to avoid repeated checks */
let lastHealthCheck: { healthy: boolean; checkedAt: number } | null = null;
const HEALTH_CACHE_TTL_MS = 60_000; // Re-check every 60s

/**
 * Check if the self-hosted RestoreAssist AI endpoint is available.
 * Caches result for 60 seconds to avoid hammering the endpoint.
 */
export async function isRestoreAssistAiHealthy(): Promise<boolean> {
  // Return cached result if fresh
  if (
    lastHealthCheck &&
    Date.now() - lastHealthCheck.checkedAt < HEALTH_CACHE_TTL_MS
  ) {
    return lastHealthCheck.healthy;
  }

  // No endpoint configured
  if (!RESTOREASSIST_AI_ENDPOINT || !RESTOREASSIST_AI_API_KEY) {
    lastHealthCheck = { healthy: false, checkedAt: Date.now() };
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

  try {
    const res = await fetch(`${RESTOREASSIST_AI_ENDPOINT}/health`, {
      method: "GET",
      headers: { Authorization: `Bearer ${RESTOREASSIST_AI_API_KEY}` },
      signal: controller.signal,
    });

    const healthy = res.ok;
    lastHealthCheck = { healthy, checkedAt: Date.now() };
    return healthy;
  } catch {
    lastHealthCheck = { healthy: false, checkedAt: Date.now() };
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** Reset health cache (useful for testing or after config change) */
export function resetHealthCache(): void {
  lastHealthCheck = null;
}

// ━━━ Self-hosted Dispatch ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Call the self-hosted Gemma-4-31B-IT endpoint.
 * Uses OpenAI-compatible API format (vLLM / TGI standard).
 */
async function callRestoreAssistAi(
  req: RestoreAssistAiRequest,
): Promise<RestoreAssistAiResponse> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Format messages — OpenAI-compatible format (vLLM/TGI standard)
    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: req.systemPrompt },
    ];

    // Build user message content
    const userContent: Array<Record<string, unknown>> = [];

    if (req.visionInputs?.length) {
      for (const input of req.visionInputs) {
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${input.mediaType};base64,${input.data}`,
          },
        });
      }
    }

    userContent.push({ type: "text", text: req.userPrompt });
    messages.push({ role: "user", content: userContent });

    const res = await fetch(`${RESTOREASSIST_AI_ENDPOINT}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESTOREASSIST_AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: RESTOREASSIST_AI_MODEL,
        messages,
        temperature: req.temperature ?? 0.3,
        max_tokens: req.maxTokens ?? 4096,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `RestoreAssist AI ${res.status}: ${errBody.slice(0, 200)}`,
      );
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content ?? "";
    const durationMs = Date.now() - start;

    // Calculate estimated cost
    const inputTokens = json.usage?.prompt_tokens ?? 0;
    const outputTokens = json.usage?.completion_tokens ?? 0;
    const estimatedCostUsd =
      (inputTokens * RESTOREASSIST_AI_PRICING.inputPer1M) / 1_000_000 +
      (outputTokens * RESTOREASSIST_AI_PRICING.outputPer1M) / 1_000_000;

    return {
      text,
      model: RESTOREASSIST_AI_MODEL,
      tier: "restoreassist",
      usage: json.usage ? { inputTokens, outputTokens } : undefined,
      estimatedCostUsd,
      durationMs,
      fellBackToBYOK: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ━━━ Public API ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Dispatch a request to RestoreAssist AI (self-hosted Gemma).
 * If the self-hosted endpoint is unhealthy, falls back to BYOK using
 * the provided fallback model and API key.
 *
 * @param req - The AI request
 * @param fallback - Optional BYOK fallback configuration
 * @returns Response with tier indication and fallback status
 */
export async function restoreAssistAiDispatch(
  req: RestoreAssistAiRequest,
  fallback?: {
    model: ByokRequest["model"];
    apiKey: string;
  },
): Promise<RestoreAssistAiResponse> {
  // Try self-hosted first
  const healthy = await isRestoreAssistAiHealthy();

  if (healthy) {
    try {
      return await callRestoreAssistAi(req);
    } catch (error) {
      // Self-hosted failed at runtime — invalidate cache and try fallback
      resetHealthCache();

      if (!fallback) {
        throw error;
      }
      // Fall through to BYOK fallback
    }
  }

  // Fallback to BYOK
  if (!fallback) {
    throw new Error(
      "RestoreAssist AI is unavailable and no BYOK fallback was provided. " +
        "Either configure RESTOREASSIST_AI_ENDPOINT and RESTOREASSIST_AI_API_KEY, " +
        "or provide a BYOK fallback model and API key.",
    );
  }

  const byokResponse = await byokDispatch({
    model: fallback.model,
    apiKey: fallback.apiKey,
    systemPrompt: req.systemPrompt,
    userPrompt: req.userPrompt,
    visionInputs: req.visionInputs,
    temperature: req.temperature,
    maxTokens: req.maxTokens,
    timeoutMs: req.timeoutMs,
  });

  return {
    text: byokResponse.text,
    model: byokResponse.model,
    tier: "byok",
    usage: byokResponse.usage,
    durationMs: byokResponse.durationMs,
    fellBackToBYOK: true,
  };
}

/**
 * Analyze inspection photos using RestoreAssist AI with S500:2025 output.
 * Falls back to BYOK if self-hosted is unavailable.
 */
export async function analyzeInspectionPhotosRA(
  images: VisionInput[],
  additionalContext?: string,
  fallback?: {
    model: ByokRequest["model"];
    apiKey: string;
  },
): Promise<{
  structured: S500StructuredOutput | null;
  raw: RestoreAssistAiResponse;
}> {
  const userPrompt = additionalContext
    ? `Analyze these ${images.length} inspection photo(s). Additional context: ${additionalContext}`
    : `Analyze these ${images.length} inspection photo(s) for water damage assessment.`;

  const response = await restoreAssistAiDispatch(
    {
      systemPrompt: S500_VISION_SYSTEM_PROMPT,
      userPrompt,
      visionInputs: images,
      temperature: 0.2,
      maxTokens: 4096,
    },
    fallback,
  );

  const structured = parseS500Output(response.text);

  return { structured, raw: response };
}

/**
 * Estimate cost for a RestoreAssist AI request.
 * Returns estimated cost in USD.
 */
export function estimateRestoreAssistAiCost(
  imageCount: number,
  estimatedOutputTokens: number = 2000,
): number {
  const tokensPerImage = 1500;
  const inputTokens = imageCount * tokensPerImage + 500;

  return (
    (inputTokens * RESTOREASSIST_AI_PRICING.inputPer1M) / 1_000_000 +
    (estimatedOutputTokens * RESTOREASSIST_AI_PRICING.outputPer1M) / 1_000_000
  );
}
