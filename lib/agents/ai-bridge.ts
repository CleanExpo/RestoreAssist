/**
 * AI Bridge — connects the agent framework to the existing AI provider
 * infrastructure (lib/ai-provider.ts, lib/anthropic-models.ts).
 *
 * Wraps existing functions without modifying them.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  NoWorkspaceKeyError,
  resolveWorkspaceAiKey,
  type ResolvedWorkspaceAiKey,
} from "@/lib/ai/resolve-workspace-ai-key";
import { readPlatformTrialApiKey } from "@/lib/ai/platform-trial-credential";
import { tryClaudeModels, getClaudeModels } from "@/lib/anthropic-models";
import { createCachedSystemPrompt } from "@/lib/anthropic/features/prompt-cache";
import type { AgentSlug, AIProviderType } from "./types";

/**
 * RA-8001: whose key a call may spend. "byok-only" (every agent) refuses
 * anything but the workspace's own key; "platform-allowed" (field-assist
 * only) may use the D-022 funded-trial platform key.
 */
export type AgentKeyPolicy = "byok-only" | "platform-allowed";

/**
 * Agents whose task calls the provider under "byok-only". Workflow create and
 * execute preflight the key when a template or workflow holds one of these.
 */
export const BYOK_ONLY_AGENT_SLUGS: readonly AgentSlug[] = ["report-analysis"];

export const PLATFORM_KEY_REFUSED_CODE = "AI_PLATFORM_KEY_REFUSED" as const;

/** One message whatever the cause: the customer's action is the same. */
const PLATFORM_KEY_REFUSED_MESSAGE =
  "Agent workflows run only on your own Anthropic API key. Add it in Workspace Settings -> AI Providers, then resume the workflow.";

/**
 * A byok-only call that would have spent the platform key, or that has no
 * key of the workspace's own. Thrown before any client is constructed, so a
 * refusal makes zero provider requests. Carries no key material.
 */
export class PlatformKeyRefusedError extends Error {
  readonly code = PLATFORM_KEY_REFUSED_CODE;
  constructor(
    public readonly userId: string | null = null,
    public readonly workspaceId: string | null = null,
    public readonly source: string | null = null,
  ) {
    super(PLATFORM_KEY_REFUSED_MESSAGE);
    this.name = "PlatformKeyRefusedError";
  }
}

/**
 * The one refusal predicate, shared by callAI and the route preflight so the
 * two cannot drift. Written `!== "platform-allowed"` and `!== "byok"` so a
 * missing policy or a missing source refuses. A key labelled BYOK that is the
 * platform key is still the platform key.
 */
export function isPlatformKeyRefused(
  keyPolicy: AgentKeyPolicy | undefined,
  resolved: Pick<ResolvedWorkspaceAiKey, "apiKey"> & { source?: string },
): boolean {
  if (keyPolicy === "platform-allowed") return false;
  return (
    resolved.source !== "byok" || resolved.apiKey === readPlatformTrialApiKey()
  );
}

/**
 * Resolve the workspace's Anthropic key and apply the predicate. Under any
 * policy but "platform-allowed", a NoWorkspaceKeyError of either reason
 * becomes PlatformKeyRefusedError. Other errors (a failed DB read) propagate.
 */
export async function resolveAgentAiKey(
  userId: string,
  keyPolicy: AgentKeyPolicy | undefined,
): Promise<ResolvedWorkspaceAiKey> {
  let resolved: ResolvedWorkspaceAiKey;
  try {
    resolved = await resolveWorkspaceAiKey(userId, "ANTHROPIC");
  } catch (err) {
    if (keyPolicy !== "platform-allowed" && err instanceof NoWorkspaceKeyError) {
      throw new PlatformKeyRefusedError(userId);
    }
    throw err;
  }
  if (isPlatformKeyRefused(keyPolicy, resolved)) {
    throw new PlatformKeyRefusedError(
      userId,
      resolved.workspaceId ?? null,
      typeof resolved.source === "string" ? resolved.source : null,
    );
  }
  return resolved;
}

export interface AIBridgeParams {
  userId: string;
  agentSlug: AgentSlug;
  systemPrompt: string;
  userPrompt: string;
  /** Required, no default (RA-8001). Checked again at runtime. */
  keyPolicy: AgentKeyPolicy;
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

  // RA-8001: resolveWorkspaceAiKey hands a funded trial the PLATFORM key, so
  // resolving is not enough. Agents run "byok-only": the shared predicate
  // refuses any key whose source is not "byok" (or that equals the platform
  // key) before a client exists, so a refusal makes zero provider requests.
  // Field-assist alone passes "platform-allowed" (funded trial, until 1d-ii).
  const { apiKey } = await resolveAgentAiKey(userId, params.keyPolicy);
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
