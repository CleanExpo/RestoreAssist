/**
 * Anthropic Claude Model Selection Utility
 *
 * This utility provides a function to try multiple Claude models with fallback logic.
 * It attempts models in order until one succeeds, handling deprecated/404 errors gracefully.
 *
 * Supports prompt caching for cost optimization (90% savings on cache hits).
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  extractCacheMetrics,
  logCacheMetrics,
} from "./anthropic/features/prompt-cache";

export interface ModelConfig {
  name: string;
  maxTokens: number;
}

/**
 * Opus 4.7 rejects any non-default `temperature`, `top_p`, `top_k`
 * with a 400 error — the model's adaptive-thinking mode is the only
 * sampling path supported. `tryClaudeModels()` strips these params
 * when the target model is Opus 4.7 so callers tuning sampling don't
 * hard-fail on the newest flagship while the same params still apply
 * on Sonnet / Haiku / Opus 4.6.
 *
 * Keep in sync with Anthropic's breaking-change list:
 * https://docs.anthropic.com/en/docs/about-claude/models/whats-new-claude-4-7
 */
function modelRejectsSamplingParams(model: string): boolean {
  // Forward-compatible — matches opus-4-7 and any later 4.x opus.
  return /^claude-opus-4-(7|8|9|1\d)/.test(model);
}

/**
 * Get list of Claude models to try, ordered by preference.
 *
 * Ordering philosophy — start with the strongest model the task is
 * likely to benefit from, then step down to cheaper / faster
 * fallbacks that are still in active support. We deliberately avoid
 * Claude 3.x sunset models — the June-15 and earlier retirements
 * mean any 404 from 3.5 Sonnet cascades into the 3.0 Opus fallback,
 * which is either itself retired or soon will be.
 *
 * Refreshed 2026-04-22 after Anthropic's Opus 4.7 GA:
 *   - Opus 4.7 is the new flagship (agentic, 1M ctx).
 *   - Sonnet 4.6 remains the value/reasoning workhorse.
 *   - Haiku 4.5 is the cheap/fast path.
 *   - Opus 4.6 retained as a cool-off fallback in case 4.7 has an
 *     availability blip; removed once a week clean.
 */
export function getClaudeModels(maxTokens: number = 8000): ModelConfig[] {
  return [
    { name: "claude-opus-4-7", maxTokens }, // Flagship — 1M ctx, agentic
    { name: "claude-sonnet-4-6", maxTokens }, // Value workhorse
    { name: "claude-haiku-4-5-20251001", maxTokens }, // Fast + cheap
    { name: "claude-opus-4-6", maxTokens }, // Legacy-only fallback
  ];
}

/**
 * Try multiple Claude models until one succeeds
 * @param anthropicClient - Initialized Anthropic client
 * @param requestConfig - Request configuration (system, messages, max_tokens)
 * @param models - Optional list of models to try (defaults to getClaudeModels())
 * @param options - Optional configuration (agentName for metrics, enableCacheMetrics)
 * @returns The successful response
 * @throws Error if all models fail
 */
export async function tryClaudeModels(
  anthropicClient: any,
  requestConfig: {
    system?: string | Anthropic.Messages.TextBlockParam[];
    messages: any[];
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    top_k?: number;
  },
  models?: ModelConfig[],
  options?: {
    agentName?: string;
    enableCacheMetrics?: boolean;
  },
): Promise<any> {
  const modelsToTry =
    models || getClaudeModels(requestConfig.max_tokens || 8000);
  let lastError: any = null;

  for (const modelConfig of modelsToTry) {
    try {
      const createParams: Anthropic.Messages.MessageCreateParams = {
        model: modelConfig.name,
        max_tokens: modelConfig.maxTokens,
        system: requestConfig.system,
        messages: requestConfig.messages,
      };

      // Opus 4.7+ guard — drop sampling params the model would 400 on.
      const stripSampling = modelRejectsSamplingParams(modelConfig.name);
      const hasSampling =
        requestConfig.temperature !== undefined ||
        requestConfig.top_p !== undefined ||
        requestConfig.top_k !== undefined;

      if (!stripSampling) {
        if (requestConfig.temperature !== undefined) {
          createParams.temperature = requestConfig.temperature;
        }
        if (requestConfig.top_p !== undefined) {
          createParams.top_p = requestConfig.top_p;
        }
        if (requestConfig.top_k !== undefined) {
          createParams.top_k = requestConfig.top_k;
        }
      } else if (hasSampling) {
        console.info(
          "[claude-models] stripped sampling params for",
          modelConfig.name,
          "(Opus 4.7+ adaptive-thinking only)",
        );
      }

      const response = await anthropicClient.messages.create(createParams);

      // Log cache metrics if enabled
      if (options?.enableCacheMetrics && options?.agentName) {
        const metrics = extractCacheMetrics(response);
        logCacheMetrics(options.agentName, metrics, response.id);
      }

      return response;
    } catch (error: any) {
      lastError = error;
      const errorType = error.error?.type || error.status;
      const errorMessage = error.error?.message || error.message || "";

      // If it's a 404/not_found, try next model
      if (error.status === 404 || errorType === "not_found_error") {
        continue;
      }

      // If it's a deprecation warning but still works, log and continue
      if (error.message?.includes("deprecated")) {
        continue;
      }

      // If it's an API usage limit error, throw immediately with clear message
      if (
        errorType === "invalid_request_error" &&
        (errorMessage.includes("API usage limits") ||
          errorMessage.includes("usage limits") ||
          errorMessage.includes("rate limit"))
      ) {
        throw new Error(
          `API Usage Limit Reached: ${errorMessage}. Please check your Anthropic API account limits or try again later.`,
        );
      }

      // If it's a credit balance error, throw immediately with clear message
      if (
        errorType === "invalid_request_error" &&
        (errorMessage.includes("credit balance") ||
          errorMessage.includes("too low") ||
          errorMessage.includes("upgrade or purchase credits"))
      ) {
        throw new Error(
          `Insufficient API Credits: ${errorMessage}. Please go to Plans & Billing in your Anthropic account to upgrade or purchase credits.`,
        );
      }

      // If it's a rate limit error (429), throw with clear message
      if (error.status === 429 || errorType === "rate_limit_error") {
        throw new Error(
          `Rate limit exceeded. Please wait a moment and try again.`,
        );
      }

      // For other errors, still try next model
      continue;
    }
  }

  // All models failed - format error message better
  const lastErrorMessage =
    lastError?.error?.message || lastError?.message || "Unknown error";
  const lastErrorType =
    lastError?.error?.type || lastError?.status || "unknown";

  // If we have a structured error, include it
  if (lastError?.error) {
    throw new Error(
      `All Claude models failed. Last error: ${lastErrorType} - ${lastErrorMessage}`,
    );
  }

  throw new Error(`All Claude models failed. Last error: ${lastErrorMessage}`);
}
