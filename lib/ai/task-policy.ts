export type AiTaskClass =
  | "fast_classification"
  | "support_response_draft"
  | "support_ticket_analysis"
  | "ocr_image_understanding"
  | "report_drafting"
  | "standards_rag_lookup"
  | "voice_realtime"
  | "workflow_automation"
  | "embeddings"
  | "unknown";

export type AiDataClass =
  | "low_risk"
  | "customer_content"
  | "evidence_media"
  | "compliance_report"
  | "standards_reference";

export type AiLatencyClass = "interactive" | "background" | "batch";

export interface AiTaskPolicy {
  taskClass: AiTaskClass;
  allowedProviderFamilies: readonly string[];
  defaultLatencyClass: AiLatencyClass;
  dataClass: AiDataClass;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxEstimatedCostUsd: number;
  requiresTenantContext: boolean;
  requiresUsageLogging: boolean;
  requiresBudgetCheck: boolean;
  allowsFallback: boolean;
  notes: string;
}

export const AI_TASK_POLICIES: Record<
  Exclude<AiTaskClass, "unknown">,
  AiTaskPolicy
> = {
  support_response_draft: {
    taskClass: "support_response_draft",
    allowedProviderFamilies: ["anthropic-platform"],
    defaultLatencyClass: "interactive",
    dataClass: "customer_content",
    maxInputTokens: 8_000,
    maxOutputTokens: 1_024,
    maxEstimatedCostUsd: 0.02,
    requiresTenantContext: false,
    requiresUsageLogging: true,
    requiresBudgetCheck: false,
    allowsFallback: false,
    notes: "Admin/platform support reply drafting; provider, model, prompt, and output shape must remain stable during the first policy-wrap slice.",
  },
  support_ticket_analysis: {
    taskClass: "support_ticket_analysis",
    allowedProviderFamilies: ["anthropic-platform"],
    defaultLatencyClass: "interactive",
    dataClass: "customer_content",
    maxInputTokens: 8_000,
    maxOutputTokens: 1_024,
    maxEstimatedCostUsd: 0.02,
    requiresTenantContext: false,
    requiresUsageLogging: true,
    requiresBudgetCheck: false,
    allowsFallback: false,
    notes: "Admin/platform inbound support ticket classification and draft response; provider, model, prompt, and JSON output contract must remain stable during policy wrapping.",
  },
  fast_classification: {
    taskClass: "fast_classification",
    allowedProviderFamilies: ["restoreassist-ai", "openai-mini", "gemini-flash", "byok"],
    defaultLatencyClass: "interactive",
    dataClass: "customer_content",
    maxInputTokens: 8_000,
    maxOutputTokens: 1_024,
    maxEstimatedCostUsd: 0.02,
    requiresTenantContext: true,
    requiresUsageLogging: true,
    requiresBudgetCheck: true,
    allowsFallback: true,
    notes: "Use for low-risk labels, note structuring, summaries, and checklist compression.",
  },
  ocr_image_understanding: {
    taskClass: "ocr_image_understanding",
    allowedProviderFamilies: ["deterministic-ocr", "gemini-flash", "openai-vision", "anthropic-vision", "byok"],
    defaultLatencyClass: "interactive",
    dataClass: "evidence_media",
    maxInputTokens: 16_000,
    maxOutputTokens: 2_048,
    maxEstimatedCostUsd: 0.08,
    requiresTenantContext: true,
    requiresUsageLogging: true,
    requiresBudgetCheck: true,
    allowsFallback: true,
    notes: "Run deterministic media validation/OCR first; model output remains draft-only.",
  },
  report_drafting: {
    taskClass: "report_drafting",
    allowedProviderFamilies: ["anthropic-premium", "openai-premium", "gemini-pro", "byok"],
    defaultLatencyClass: "background",
    dataClass: "compliance_report",
    maxInputTokens: 120_000,
    maxOutputTokens: 16_000,
    maxEstimatedCostUsd: 2.0,
    requiresTenantContext: true,
    requiresUsageLogging: true,
    requiresBudgetCheck: true,
    allowsFallback: false,
    notes: "Premium report work must be source-linked, editable, and citation-gated.",
  },
  standards_rag_lookup: {
    taskClass: "standards_rag_lookup",
    allowedProviderFamilies: ["deterministic-rag", "openai-embeddings", "local-embeddings"],
    defaultLatencyClass: "interactive",
    dataClass: "standards_reference",
    maxInputTokens: 12_000,
    maxOutputTokens: 1_500,
    maxEstimatedCostUsd: 0.03,
    requiresTenantContext: false,
    requiresUsageLogging: true,
    requiresBudgetCheck: false,
    allowsFallback: false,
    notes: "Return stored citations only; summarizers may not invent IICRC edition or section references.",
  },
  voice_realtime: {
    taskClass: "voice_realtime",
    allowedProviderFamilies: ["openai-realtime", "openai-whisper", "local-stt", "byok"],
    defaultLatencyClass: "interactive",
    dataClass: "customer_content",
    maxInputTokens: 24_000,
    maxOutputTokens: 2_000,
    maxEstimatedCostUsd: 0.25,
    requiresTenantContext: true,
    requiresUsageLogging: true,
    requiresBudgetCheck: true,
    allowsFallback: true,
    notes: "Requires persisted session, max runtime, app lifecycle stop, and confirmation for claim-changing actions.",
  },
  workflow_automation: {
    taskClass: "workflow_automation",
    allowedProviderFamilies: ["restoreassist-ai", "openai-mini", "gemini-flash", "byok"],
    defaultLatencyClass: "background",
    dataClass: "customer_content",
    maxInputTokens: 24_000,
    maxOutputTokens: 4_000,
    maxEstimatedCostUsd: 0.15,
    requiresTenantContext: true,
    requiresUsageLogging: true,
    requiresBudgetCheck: true,
    allowsFallback: true,
    notes: "Automation output must remain draft/suggestion unless deterministic server rules confirm the write.",
  },
  embeddings: {
    taskClass: "embeddings",
    allowedProviderFamilies: ["openai-embeddings", "local-embeddings"],
    defaultLatencyClass: "batch",
    dataClass: "standards_reference",
    maxInputTokens: 8_000,
    maxOutputTokens: 0,
    maxEstimatedCostUsd: 0.01,
    requiresTenantContext: false,
    requiresUsageLogging: true,
    requiresBudgetCheck: false,
    allowsFallback: true,
    notes: "Use for standards and retrieval indexes; customer evidence embeddings require a separate data-class decision.",
  },
};

export function getAiTaskPolicy(taskClass: AiTaskClass): AiTaskPolicy | null {
  if (taskClass === "unknown") return null;
  return AI_TASK_POLICIES[taskClass];
}

export class MissingAiTaskPolicyError extends Error {
  constructor(taskClass: AiTaskClass) {
    super(`Missing AI task policy for ${taskClass}`);
    this.name = "MissingAiTaskPolicyError";
  }
}

export function requireAiTaskPolicy(taskClass: AiTaskClass): AiTaskPolicy {
  const policy = getAiTaskPolicy(taskClass);
  if (!policy) {
    throw new MissingAiTaskPolicyError(taskClass);
  }
  return policy;
}
