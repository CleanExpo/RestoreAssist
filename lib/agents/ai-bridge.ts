/**
 * AI Bridge — connects the agent framework to the existing AI provider
 * infrastructure (lib/ai-provider.ts, lib/anthropic-models.ts).
 *
 * Wraps existing functions without modifying them.
 */

import Anthropic from "@anthropic-ai/sdk";
import { resolveWorkspaceAiKey } from "@/lib/ai/resolve-workspace-ai-key";
import { tryClaudeModels, getClaudeModels } from "@/lib/anthropic-models";
import { createCachedSystemPrompt } from "@/lib/anthropic/features/prompt-cache";
import type { AgentSlug, AIProviderType } from "./types";

export interface AIBridgeParams {
  userId: string;
  agentSlug: AgentSlug;
  systemPrompt: string;
  userPrompt: string;
  overrides?: {
    provider?: AIProviderType;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  };
  /** The agent's executor timeout; the SDK request timeout is 5 s less. */
  timeoutMs?: number;
  /** The executor's abort signal; aborting it cancels the request. */
  signal?: AbortSignal;
}

/** Used when a caller does not pass its agent's timeoutMs. */
const DEFAULT_AGENT_TIMEOUT_MS = 60_000;
/** The SDK request gives up this long before the executor's own timeout. */
const SDK_TIMEOUT_HEADROOM_MS = 5_000;
const MIN_SDK_TIMEOUT_MS = 1_000;

export interface AIBridgeResult {
  text: string;
  tokensUsed: number;
  provider: string;
  model: string;
  cost: number;
}

/**
 * Call an AI provider with agent-specific configuration.
 * Currently supports Anthropic (primary) via the existing tryClaudeModels pattern.
 */
export async function callAI(params: AIBridgeParams): Promise<AIBridgeResult> {
  const { userId, systemPrompt, userPrompt, overrides } = params;
  const provider = overrides?.provider ?? "anthropic";
  const maxTokens = overrides?.maxTokens ?? 8000;

  if (provider === "local") {
    throw new Error("Local agents do not use the AI bridge");
  }

  // RA-6971 (BYOK, P1) — resolve the owning workspace's own Anthropic key.
  // This is a customer-reachable agent workload (POST
  // /api/agents/workflows/[id]/execute), so it must NEVER spend the platform
  // ANTHROPIC_API_KEY. resolveWorkspaceAiKey throws NoWorkspaceKeyError when the
  // workspace has no key; we let it propagate so the executor fails the task
  // (fail-closed) instead of silently billing the platform.
  const { apiKey } = await resolveWorkspaceAiKey(userId, "ANTHROPIC");
  // RA-7999: exactly one retry layer. The executor owns retries (one request
  // per attempt, gated by the lease), so the SDK must not retry on its own.
  const timeout = Math.max(
    (params.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS) - SDK_TIMEOUT_HEADROOM_MS,
    MIN_SDK_TIMEOUT_MS,
  );
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout });

  const models = overrides?.model
    ? [{ name: overrides.model, maxTokens }]
    : getClaudeModels(maxTokens);

  // Use prompt caching for cost optimization (90% savings on cache hits)
  const response = await tryClaudeModels(
    client,
    {
      system: [createCachedSystemPrompt(systemPrompt)],
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: maxTokens,
    },
    models,
    {
      agentName: `Agent-${params.agentSlug}`,
      enableCacheMetrics: true,
      fallbackOn: "notFound",
      signal: params.signal,
    },
  );

  const text =
    response.content?.[0]?.type === "text"
      ? (response.content[0] as { type: "text"; text: string }).text
      : "";

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const totalTokens = inputTokens + outputTokens;

  // Rough cost estimate (Claude 3 Sonnet pricing)
  const cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

  return {
    text,
    tokensUsed: totalTokens,
    provider: "anthropic",
    model: response.model ?? models[0].name,
    cost,
  };
}
