/**
 * RA-414: Workspace-Aware BYOK Dispatch
 *
 * Higher-level dispatch layer that:
 *   1. Resolves the workspace's encrypted API key from ProviderConnection
 *   2. Determines the correct provider from the requested model
 *   3. Calls byokDispatch (the primitive) with the decrypted key
 *   4. Fires logAiUsage (fire-and-forget) after every call — success or failure
 *
 * This replaces ad-hoc "pass the API key as a string" patterns throughout the
 * codebase. All AI calls that need workspace-level key management should go
 * through workspaceByokDispatch or workspaceRouteAiRequest.
 *
 * BYOK allowlist remains IMMUTABLE — enforced inside byokDispatch.
 */

import { byokDispatch, type ByokRequest, type ByokResponse, type AllowedModel } from "./byok-client";
import { routeAiRequest, type RoutedAiRequest, type RoutedAiResponse, type RouterConfig } from "./model-router";
import { logAiUsage, estimateCostUsd, type AiProvider as LogAiProvider } from "../usage/log-usage";
import { getProviderApiKey, type AiProvider as ConnectionAiProvider } from "../workspace/provider-connections";

// ─── Provider Mapping ────────────────────────────────────────────────────────

/**
 * Map a BYOK model name to its ProviderConnection AiProvider enum value.
 */
function modelToConnectionProvider(model: AllowedModel): ConnectionAiProvider {
  if (model.startsWith("claude-")) return "ANTHROPIC";
  if (model.startsWith("gemini-")) return "GOOGLE";
  if (model.startsWith("gpt-")) return "OPENAI";
  throw new Error(`Cannot determine provider for model: ${model}`);
}

/**
 * Map a ProviderConnection AiProvider to the log-usage AiProvider type.
 * They share the same values — this cast ensures type safety across modules.
 */
function connectionProviderToLogProvider(p: ConnectionAiProvider): LogAiProvider {
  return p as LogAiProvider;
}

// ─── Error Classification ────────────────────────────────────────────────────

/** Classify an error string into a terse error type for usage logging. */
function classifyError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes("401") || msg.includes("invalid") && msg.includes("key")) return "auth";
  if (msg.includes("429") || msg.includes("rate_limit") || msg.includes("rate limit")) return "rate_limit";
  if (msg.includes("context_length") || msg.includes("max_tokens") || msg.includes("too long")) return "context_length";
  if (msg.includes("timeout") || msg.includes("aborted")) return "timeout";
  if (msg.includes("500") || msg.includes("502") || msg.includes("503")) return "provider_error";
  return "unknown";
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WorkspaceByokRequest extends Omit<ByokRequest, "apiKey"> {
  /** Workspace to resolve the API key from */
  workspaceId: string;
  /** Optional: WorkspaceMember.id for per-member usage attribution */
  memberId?: string;
  /** Optional: task type for usage log annotation (from AiTaskType) */
  taskType?: string;
}

export interface WorkspaceByokResponse extends ByokResponse {
  /** Estimated cost in USD based on token usage */
  estimatedCostUsd: number;
}

// ─── Core Dispatch ───────────────────────────────────────────────────────────

/**
 * Workspace-aware BYOK dispatch.
 *
 * Resolves the encrypted API key from ProviderConnection for the given workspace
 * and model, then dispatches via byokDispatch. Fires logAiUsage fire-and-forget
 * regardless of success/failure.
 *
 * Throws if no ACTIVE API key is configured for the required provider.
 */
export async function workspaceByokDispatch(
  req: WorkspaceByokRequest,
): Promise<WorkspaceByokResponse> {
  const { workspaceId, memberId, taskType, ...byokFields } = req;
  const provider = modelToConnectionProvider(req.model);

  // 1. Resolve encrypted API key
  const apiKey = await getProviderApiKey(workspaceId, provider);
  if (!apiKey) {
    throw new Error(
      `No active ${provider} API key configured for workspace ${workspaceId}. ` +
      `Please add your API key in Workspace Settings → AI Providers.`,
    );
  }

  // 2. Dispatch via the primitive (allowlist enforced inside)
  const start = Date.now();
  let response: ByokResponse | undefined;
  let dispatchError: unknown;

  try {
    response = await byokDispatch({ ...byokFields, apiKey });
  } catch (err) {
    dispatchError = err;
  }

  const latencyMs = Date.now() - start;
  const success = response !== undefined;

  // 3. Fire-and-forget usage log
  const inputTokens = response?.usage?.inputTokens ?? 0;
  const outputTokens = response?.usage?.outputTokens ?? 0;
  const logProvider = connectionProviderToLogProvider(provider);
  const estimatedCostUsd = estimateCostUsd(logProvider, req.model, inputTokens, outputTokens);

  logAiUsage({
    workspaceId,
    memberId,
    provider: logProvider,
    model: req.model,
    taskType: taskType ?? "unknown",
    inputTokens,
    outputTokens,
    estimatedCostUsd,
    latencyMs,
    success,
    errorType: dispatchError ? classifyError(dispatchError) : undefined,
    metadata: { workspaceId },
  });

  // 4. Re-throw on failure
  if (dispatchError) {
    throw dispatchError;
  }

  return {
    ...response!,
    estimatedCostUsd,
  };
}

// ─── Workspace-Aware Router Config ───────────────────────────────────────────

/**
 * Build a RouterConfig for workspaceRouteAiRequest by resolving BYOK keys
 * for the preferred (or first available) ANTHROPIC/OPENAI/GOOGLE provider.
 *
 * Priority order: ANTHROPIC → OPENAI → GOOGLE
 * Falls back to the first ACTIVE provider found.
 */
export async function resolveWorkspaceRouterConfig(
  workspaceId: string,
  preferredModel?: AllowedModel,
): Promise<RouterConfig | null> {
  // If a preferred model is specified, try its provider first
  if (preferredModel) {
    const provider = modelToConnectionProvider(preferredModel);
    const apiKey = await getProviderApiKey(workspaceId, provider);
    if (apiKey) {
      return { byokModel: preferredModel, byokApiKey: apiKey };
    }
  }

  // Try providers in priority order
  const fallbacks: Array<{ provider: ConnectionAiProvider; model: AllowedModel }> = [
    { provider: "ANTHROPIC", model: "claude-sonnet-4-6" },
    { provider: "OPENAI", model: "gpt-5.4-mini" },
    { provider: "GOOGLE", model: "gemini-3.1-flash" },
  ];

  for (const { provider, model } of fallbacks) {
    const apiKey = await getProviderApiKey(workspaceId, provider);
    if (apiKey) {
      return { byokModel: model, byokApiKey: apiKey };
    }
  }

  return null; // No active providers configured
}

/**
 * Workspace-aware version of routeAiRequest.
 *
 * Resolves the workspace's BYOK key, then calls routeAiRequest which handles
 * basic/premium tier routing (RestoreAssist AI vs BYOK).
 * Fires logAiUsage fire-and-forget on completion.
 *
 * Throws if no ACTIVE API key is configured for any provider.
 */
export async function workspaceRouteAiRequest(
  workspaceId: string,
  req: RoutedAiRequest,
  options?: {
    memberId?: string;
    preferredModel?: AllowedModel;
  },
): Promise<RoutedAiResponse> {
  const config = await resolveWorkspaceRouterConfig(
    workspaceId,
    options?.preferredModel,
  );

  if (!config) {
    throw new Error(
      `No active AI provider configured for workspace ${workspaceId}. ` +
      `Please add at least one API key in Workspace Settings → AI Providers.`,
    );
  }

  const start = Date.now();
  let response: RoutedAiResponse | undefined;
  let routeError: unknown;

  try {
    response = await routeAiRequest(req, config);
  } catch (err) {
    routeError = err;
  }

  const latencyMs = Date.now() - start;
  const success = response !== undefined;

  // Determine provider from model used
  const modelUsed = (response?.model ?? config.byokModel) as AllowedModel;
  let logProvider: LogAiProvider;
  try {
    logProvider = connectionProviderToLogProvider(modelToConnectionProvider(modelUsed));
  } catch {
    logProvider = "GEMMA"; // self-hosted fallback
  }

  const inputTokens = response?.usage?.inputTokens ?? 0;
  const outputTokens = response?.usage?.outputTokens ?? 0;
  const estimatedCostUsd =
    response?.estimatedCostUsd ??
    estimateCostUsd(logProvider, modelUsed, inputTokens, outputTokens);

  logAiUsage({
    workspaceId,
    memberId: options?.memberId,
    provider: logProvider,
    model: modelUsed,
    taskType: req.taskType,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
    latencyMs,
    success,
    errorType: routeError ? classifyError(routeError) : undefined,
    metadata: { workspaceId, tier: response?.tier, fellBack: response?.fellBack },
  });

  if (routeError) {
    throw routeError;
  }

  return response!;
}
