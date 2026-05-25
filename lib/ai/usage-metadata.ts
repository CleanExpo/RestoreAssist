import {
  getAiTaskPolicy,
  type AiLatencyClass,
  type AiTaskClass,
} from "@/lib/ai/task-policy";

type KnownAiTaskClass = Exclude<AiTaskClass, "unknown">;

export type AiUsageTenantContextStatus =
  | "present"
  | "not_required"
  | "unavailable";

export interface AiUsageTenantContext {
  workspaceId?: string;
  organizationId?: string;
  memberId?: string;
  userId?: string;
  unavailableReason?: string;
}

export interface AiUsageTokenMetadata {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}

export interface AiUsageMetadataInput {
  taskClass: AiTaskClass;
  providerFamily?: string;
  model?: string;
  tenantContext?: AiUsageTenantContext;
  tokenUsage?: AiUsageTokenMetadata;
  latencyClass?: AiLatencyClass;
  executionMode?: "synchronous" | "queued" | "background" | "unknown";
}

export interface BlockedAiUsageMetadata {
  blocked: true;
  reason: "missing_task_policy";
  taskClass: AiTaskClass;
}

export interface AiUsageMetadata {
  blocked: false;
  taskClass: KnownAiTaskClass;
  providerFamily?: string;
  model?: string;
  dataClass: string;
  latencyClass: AiLatencyClass;
  executionMode: "synchronous" | "queued" | "background" | "unknown";
  maxEstimatedCostUsd: number;
  estimatedCostUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  requiresUsageLogging: boolean;
  requiresBudgetCheck: boolean;
  allowsFallback: boolean;
  tenantContextRequired: boolean;
  tenantContextStatus: AiUsageTenantContextStatus;
  tenantContextUnavailableReason?: string;
  tenantContext?: AiUsageTenantContext;
  maxInputTokens?: number;
  maxOutputTokens?: number;
}

export type AiUsageMetadataResult =
  | AiUsageMetadata
  | BlockedAiUsageMetadata;

function hasTenantContext(context: AiUsageTenantContext | undefined): boolean {
  return Boolean(
    context?.workspaceId ||
      context?.organizationId ||
      context?.memberId ||
      context?.userId,
  );
}

function tenantContextStatus(
  requiresTenantContext: boolean,
  context: AiUsageTenantContext | undefined,
): AiUsageTenantContextStatus {
  if (!requiresTenantContext) return "not_required";
  if (hasTenantContext(context)) return "present";
  return "unavailable";
}

export function buildAiUsageMetadata(
  input: AiUsageMetadataInput,
): AiUsageMetadataResult {
  const policy = getAiTaskPolicy(input.taskClass);
  if (!policy) {
    return {
      blocked: true,
      reason: "missing_task_policy",
      taskClass: input.taskClass,
    };
  }

  const contextStatus = tenantContextStatus(
    policy.requiresTenantContext,
    input.tenantContext,
  );

  return {
    blocked: false,
    taskClass: policy.taskClass as KnownAiTaskClass,
    providerFamily: input.providerFamily,
    model: input.model,
    dataClass: policy.dataClass,
    latencyClass: input.latencyClass ?? policy.defaultLatencyClass,
    executionMode: input.executionMode ?? "unknown",
    maxEstimatedCostUsd: policy.maxEstimatedCostUsd,
    estimatedCostUsd: input.tokenUsage?.estimatedCostUsd,
    inputTokens: input.tokenUsage?.inputTokens,
    outputTokens: input.tokenUsage?.outputTokens,
    requiresUsageLogging: policy.requiresUsageLogging,
    requiresBudgetCheck: policy.requiresBudgetCheck,
    allowsFallback: policy.allowsFallback,
    tenantContextRequired: policy.requiresTenantContext,
    tenantContextStatus: contextStatus,
    tenantContextUnavailableReason:
      contextStatus === "unavailable"
        ? input.tenantContext?.unavailableReason ?? "tenant context not supplied"
        : undefined,
    tenantContext: input.tenantContext,
    maxInputTokens: policy.maxInputTokens,
    maxOutputTokens: policy.maxOutputTokens,
  };
}
