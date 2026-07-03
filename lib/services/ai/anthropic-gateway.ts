/**
 * Structured-result Anthropic platform-key gateway.
 *
 * Returns ServiceResult<Anthropic.Message, AnthropicReason> so route handlers
 * map reasons to HTTP status codes without try/catch ladders. Composes
 * `getAnthropicApiKey(userId)` from lib/ai-provider.ts — this gateway is for
 * the platform-key-with-per-user-override flow, NOT BYOK
 * (lib/ai/byok-client.ts handles user-supplied keys separately).
 *
 * Reasons:
 *  - KEY_MISSING        — no usable Anthropic key for this user
 *  - KEY_INVALID        — SDK returned 401 (bad/expired BYOK key)
 *  - RATE_LIMITED       — SDK returned 429
 *  - MODEL_OVERLOADED   — SDK returned 529 / overloaded
 *  - API_ERROR          — any other SDK failure (5xx, network, parse)
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
import type { MessageStreamParams } from "@anthropic-ai/sdk/resources/messages/messages";
import type { MessageStream } from "@anthropic-ai/sdk/lib/MessageStream";
import { getAnthropicApiKey } from "@/lib/ai-provider";
import {
  tryClaudeModels,
  type ModelConfig,
} from "@/lib/anthropic-models";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";

export type AnthropicReason =
  | "KEY_MISSING"
  | "KEY_INVALID"
  | "RATE_LIMITED"
  | "MODEL_OVERLOADED"
  | "API_ERROR";

export interface AnthropicGatewayRequest {
  userId: string;
  /** Optional platform-key override. When provided, bypasses
   *  getAnthropicApiKey(userId) — used by admin/cron flows that
   *  billing-wise are platform-owned, not user-owned. */
  apiKey?: string;
  request: MessageCreateParams;
}

export async function callAnthropic(
  args: AnthropicGatewayRequest,
): Promise<ServiceResult<Anthropic.Message, AnthropicReason>> {
  let apiKey: string;
  if (args.apiKey) {
    apiKey = args.apiKey;
  } else {
    try {
      apiKey = await getAnthropicApiKey(args.userId);
    } catch (err) {
      return fail("KEY_MISSING", {
        detail: err instanceof Error ? err.message : String(err),
        cause: err,
      });
    }
  }

  if (!apiKey) {
    return fail("KEY_MISSING", {
      detail: `No Anthropic key resolved for user ${args.userId}`,
    });
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create(args.request);
    return ok(message as Anthropic.Message);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return fail("KEY_INVALID", {
        detail:
          "Anthropic API key is invalid or expired. Re-add it in Workspace Settings → AI Providers.",
        cause: err,
      });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return fail("RATE_LIMITED", {
        detail: err.message,
        retryAfterMs: 30000,
        cause: err,
      });
    }
    if (err instanceof Anthropic.APIError && err.status === 529) {
      return fail("MODEL_OVERLOADED", {
        detail: err.message,
        retryAfterMs: 10000,
        cause: err,
      });
    }
    return fail("API_ERROR", {
      detail: err instanceof Error ? err.message : String(err),
      cause: err,
    });
  }
}

export interface AnthropicFallbackRequest {
  userId: string;
  /** Optional platform-key override. Same semantics as callAnthropic. */
  apiKey?: string;
  /** Same shape `tryClaudeModels` accepts — system, messages, max_tokens,
   *  and optional sampling params. The wrapper does not constrain it
   *  further so existing call sites can migrate without re-shaping. */
  request: {
    system?: MessageCreateParams["system"];
    messages: MessageCreateParams["messages"];
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    top_k?: number;
  };
  /** Override the default model chain. Omit to use `getClaudeModels()`. */
  models?: ModelConfig[];
  /** Optional agent-name tag for cache-metrics logging. */
  agentName?: string;
  /** Enable cache-metrics extraction on successful response. */
  enableCacheMetrics?: boolean;
}

/**
 * Multi-model-fallback sibling of callAnthropic. Wraps `tryClaudeModels`
 * with the same ServiceResult envelope so services that need fallback
 * stop calling `tryClaudeModels` directly and instead consume this gateway.
 *
 * Error mapping mirrors callAnthropic:
 *   - status 429 → RATE_LIMITED
 *   - status 529 → MODEL_OVERLOADED
 *   - all other throws (including the "API Usage Limit" / "credit balance"
 *     pre-formatted errors from tryClaudeModels) → API_ERROR
 *
 * @see .claude/STANDARDS.md "Multi-model fallback routes"
 */
export async function callAnthropicWithFallback(
  args: AnthropicFallbackRequest,
): Promise<ServiceResult<Anthropic.Message, AnthropicReason>> {
  let apiKey: string;
  if (args.apiKey) {
    apiKey = args.apiKey;
  } else {
    try {
      apiKey = await getAnthropicApiKey(args.userId);
    } catch (err) {
      return fail("KEY_MISSING", {
        detail: err instanceof Error ? err.message : String(err),
        cause: err,
      });
    }
  }

  if (!apiKey) {
    return fail("KEY_MISSING", {
      detail: `No Anthropic key resolved for user ${args.userId}`,
    });
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await tryClaudeModels(
      client,
      args.request,
      args.models,
      {
        agentName: args.agentName,
        enableCacheMetrics: args.enableCacheMetrics,
      },
    );
    return ok(message as Anthropic.Message);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return fail("KEY_INVALID", {
        detail:
          "Anthropic API key is invalid or expired. Re-add it in Workspace Settings → AI Providers.",
        cause: err,
      });
    }
    const status =
      err instanceof Anthropic.APIError ? err.status : (err as any)?.status;
    if (status === 429) {
      return fail("RATE_LIMITED", {
        detail: err instanceof Error ? err.message : String(err),
        retryAfterMs: 30000,
        cause: err,
      });
    }
    if (status === 529) {
      return fail("MODEL_OVERLOADED", {
        detail: err instanceof Error ? err.message : String(err),
        retryAfterMs: 10000,
        cause: err,
      });
    }
    return fail("API_ERROR", {
      detail: err instanceof Error ? err.message : String(err),
      cause: err,
    });
  }
}

export interface AnthropicStreamRequest {
  userId: string;
  request: MessageStreamParams;
  /** Optional platform-key override. Same semantics as callAnthropic. */
  apiKey?: string;
}

/**
 * Streaming sibling of callAnthropic. Returns the SDK's MessageStream inside
 * a ServiceResult so callers map pre-stream failures (KEY_MISSING / immediate
 * 429 / 5xx) to HTTP status codes BEFORE opening the SSE/ReadableStream to
 * the client.
 *
 * Mid-stream errors are not this gateway's concern — consumers attach
 * `stream.on("error", handler)` or watch the AsyncIterable for thrown values.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */
export async function callAnthropicStream(
  args: AnthropicStreamRequest,
): Promise<ServiceResult<MessageStream, AnthropicReason>> {
  let apiKey: string;
  if (args.apiKey) {
    apiKey = args.apiKey;
  } else {
    try {
      apiKey = await getAnthropicApiKey(args.userId);
    } catch (err) {
      return fail("KEY_MISSING", {
        detail: err instanceof Error ? err.message : String(err),
        cause: err,
      });
    }
  }

  if (!apiKey) {
    return fail("KEY_MISSING", {
      detail: `No Anthropic key resolved for user ${args.userId}`,
    });
  }

  const client = new Anthropic({ apiKey });

  try {
    const stream = client.messages.stream(args.request);
    return ok(stream);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return fail("KEY_INVALID", {
        detail:
          "Anthropic API key is invalid or expired. Re-add it in Workspace Settings → AI Providers.",
        cause: err,
      });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return fail("RATE_LIMITED", {
        detail: err.message,
        retryAfterMs: 30000,
        cause: err,
      });
    }
    if (err instanceof Anthropic.APIError && err.status === 529) {
      return fail("MODEL_OVERLOADED", {
        detail: err.message,
        retryAfterMs: 10000,
        cause: err,
      });
    }
    return fail("API_ERROR", {
      detail: err instanceof Error ? err.message : String(err),
      cause: err,
    });
  }
}
