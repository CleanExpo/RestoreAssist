/**
 * RA-6998 — Margot's reasoning provider: the most intelligent FREE open model
 * via OpenRouter.
 *
 * Margot is Phill's single shared internal ops assistant (admin-gated, not a
 * per-client workload), so she runs on ONE platform OpenRouter key
 * (`OPENROUTER_API_KEY`, set in the Vercel environment) rather than a BYOK key.
 * The zero-platform-cost model (RA-6998) is preserved by PINNING the model to a
 * `:free` OpenRouter variant — a free model can never incur spend on the
 * platform key. This module is the single place that enforces that pin, so the
 * platform key is provably safe.
 *
 * OpenRouter is OpenAI-API-compatible at https://openrouter.ai/api/v1, so we
 * build the provider with the AI SDK's OpenAI provider (`createOpenAI`) pointed
 * at that base URL and force the Chat Completions endpoint (`.chat(...)`) — the
 * OpenAI Responses API is not supported by third-party compatible endpoints.
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Default Margot model — reviewed 2026-07-06 against OpenRouter's live free-model
 * list (openrouter.ai/collections/free-models, "updated July 2026" + costgoat
 * free-models table dated 2026-07-05).
 *
 * NVIDIA Nemotron 3 Super (120B MoE, 12B active, 1M-token context) is an open
 * frontier reasoning + orchestration model purpose-built for agentic workflows
 * — agent orchestration, deep research, multi-step tool use — which is exactly
 * what Margot does (she calls deep_research, Linear, and image tools). It scores
 * Quality 60 and sits at #12 popularity on the free tier (proven capacity), with
 * a 1M context window that comfortably holds the injected Nexus context bundle.
 *
 * The free-model landscape shifts weekly; REVIEW this default periodically.
 * Alternatives worth considering: `google/gemma-4-31b-it:free` (Quality 65, the
 * single highest generic-quality free model, Vision+Tools, 262K) and
 * `nvidia/nemotron-3-ultra-550b-a55b:free` (larger, 1M). Override without a
 * deploy via the `MARGOT_MODEL` env var — but it MUST be a `:free` variant or it
 * is rejected (see `resolveMargotModelId`) so the platform key stays at $0.
 */
export const DEFAULT_MARGOT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

/** True when the model id is a zero-cost OpenRouter `:free` variant. */
export function isFreeModel(modelId: string): boolean {
  return modelId.trim().endsWith(":free");
}

/**
 * Resolve the Margot model id from `MARGOT_MODEL`, falling back to
 * `DEFAULT_MARGOT_MODEL`. ENFORCES the zero-platform-cost invariant: a configured
 * model that is NOT a `:free` variant is rejected (warn + fall back to the free
 * default) so the shared platform OpenRouter key can never incur spend.
 */
export function resolveMargotModelId(): string {
  const configured = process.env.MARGOT_MODEL?.trim();
  if (!configured) return DEFAULT_MARGOT_MODEL;
  if (!isFreeModel(configured)) {
    console.warn(
      `[margot/openrouter] MARGOT_MODEL="${configured}" is not a :free variant — ` +
        `ignoring it and using ${DEFAULT_MARGOT_MODEL} to keep the platform key at $0 cost.`,
    );
    return DEFAULT_MARGOT_MODEL;
  }
  return configured;
}

/** The platform OpenRouter API key, or null when unset (fail-closed). */
export function getOpenRouterApiKey(): string | null {
  return process.env.OPENROUTER_API_KEY?.trim() || null;
}

/**
 * RA-7026 — build the Margot model backed by a CALLER-SUPPLIED (BYOK) OpenRouter
 * key rather than the shared platform key. The contractor-facing assistant must
 * spend the calling workspace's own key (RA-6921 P0), never the platform's. The
 * `:free` model pin still applies via `resolveMargotModelId`, so a BYOK key also
 * stays at $0 unless the workspace deliberately overrides the model.
 */
export function createMargotModelWithKey(
  apiKey: string,
  modelId = resolveMargotModelId(),
): LanguageModel {
  if (!apiKey) {
    throw new Error("createMargotModelWithKey requires a non-empty apiKey");
  }
  const openrouter = createOpenAI({
    name: "openrouter",
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
  });
  return openrouter.chat(modelId);
}

/**
 * Build the Margot language model backed by the platform OpenRouter key. Uses
 * the Chat Completions endpoint (`.chat`) for OpenAI-compatibility. Throws if
 * the platform key is unset — callers must gate on `getOpenRouterApiKey()` first
 * and return a fail-closed offline response. ADMIN-ONLY surfaces (personal
 * Margot); client-facing routes must use `createMargotModelWithKey` with a BYOK
 * key instead.
 */
export function createMargotModel(modelId = resolveMargotModelId()): LanguageModel {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }
  return createMargotModelWithKey(apiKey, modelId);
}
