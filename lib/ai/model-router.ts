/**
 * Task-based AI model router
 *
 * Routes each AI task to the most cost-effective capable model:
 *   basic   → self-hosted Gemma-4-31B-IT  (~$0.001–0.005/task)
 *   standard → self-hosted Gemma-4-31B-IT (~$0.005–0.01/task)
 *   premium → customer's BYOK provider    ($0.10–0.75/task)
 *
 * 70% of inspection tasks are basic, 20% standard, 10% premium.
 * Net cost reduction: 60–80% vs routing everything through BYOK.
 *
 * RA-404: Sprint H — Task-based model router
 */

import { callGemma, isGemmaAvailable } from "./gemma-client";
import type { GemmaMessage } from "./gemma-client";
import { getLatestAIIntegration, callAIProvider } from "@/lib/ai-provider";

// ─── Task type registry ──────────────────────────────────────────────────────

export type AITaskType =
  | "voice_transcription" // basic  — audio → text
  | "note_structuring" // basic  — freetext → structured
  | "evidence_classification" // basic  — classify photo evidence class
  | "photo_quality_scoring" // basic  — score photo quality 0–100
  | "contradiction_detection" // standard — detect field/report contradictions
  | "material_recognition" // standard — identify building materials in image
  | "contents_manifest_basic" // standard — identify household items in photo
  | "contents_manifest_detail" // premium — full manifest with values
  | "scope_generation" // premium — generate S500-compliant scope of works
  | "report_generation" // premium — full NIR report
  | "dispute_defence"; // premium — dispute defence pack

export type TaskTier = "basic" | "standard" | "premium";

const TASK_TIERS: Record<AITaskType, TaskTier> = {
  voice_transcription: "basic",
  note_structuring: "basic",
  evidence_classification: "basic",
  photo_quality_scoring: "basic",
  contradiction_detection: "standard",
  material_recognition: "standard",
  contents_manifest_basic: "standard",
  contents_manifest_detail: "premium",
  scope_generation: "premium",
  report_generation: "premium",
  dispute_defence: "premium",
};

export function getTaskTier(taskType: AITaskType): TaskTier {
  return TASK_TIERS[taskType];
}

// ─── User AI config (from integration settings) ──────────────────────────────

export interface UserAIConfig {
  userId: string;
}

// ─── Router call options ─────────────────────────────────────────────────────

export interface RouterCallOptions {
  taskType: AITaskType;
  userConfig: UserAIConfig;
  messages: GemmaMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "text" | "json";
  /** Override tier for this call (e.g. force premium for testing) */
  forceTier?: TaskTier;
}

export interface RouterCallResult {
  text: string;
  tier: TaskTier;
  model: string;
  provider: "gemma" | "byok";
  inputTokens: number;
  outputTokens: number;
  cost: number;
  selfHostedUsed: boolean;
}

// ─── Main router function ────────────────────────────────────────────────────

/**
 * Route an AI task to the appropriate model endpoint.
 *
 * Decision logic:
 * 1. Determine tier from task type (or use forceTier override).
 * 2. If tier is basic or standard AND self-hosted Gemma is available → use Gemma.
 * 3. Otherwise (premium, or Gemma down) → use customer's BYOK provider.
 * 4. If BYOK also unavailable → throw descriptive error.
 */
export async function routeTask(
  options: RouterCallOptions,
): Promise<RouterCallResult> {
  const {
    taskType,
    userConfig,
    messages,
    maxTokens,
    temperature,
    responseFormat,
    forceTier,
  } = options;

  const tier = forceTier ?? getTaskTier(taskType);
  const gemmaAvailable = isGemmaAvailable();
  const useSelfHosted =
    (tier === "basic" || tier === "standard") && gemmaAvailable;

  if (useSelfHosted) {
    try {
      const result = await callGemma({
        messages,
        maxTokens,
        temperature,
        responseFormat,
      });
      return {
        text: result.text,
        tier,
        model: result.model,
        provider: "gemma",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost: result.cost,
        selfHostedUsed: true,
      };
    } catch (err) {
      // Self-hosted down — fall through to BYOK
      console.warn(
        `[model-router] Gemma self-hosted unavailable for ${taskType}, falling back to BYOK:`,
        (err as Error).message,
      );
    }
  }

  // BYOK fallback (premium tier or Gemma unavailable)
  const integration = await getLatestAIIntegration(userConfig.userId);
  if (!integration) {
    throw new Error(
      tier === "premium"
        ? "Premium AI features require an API key. Add your Anthropic, OpenAI, or Gemini key in Settings → Integrations."
        : "AI features are temporarily unavailable (self-hosted model offline). Add a BYOK API key in Settings → Integrations as fallback.",
    );
  }

  // Build a simple text prompt from the messages array for the legacy provider API
  const systemMsg = messages.find((m) => m.role === "system");
  const userMsg = messages.filter((m) => m.role !== "system");
  const systemText =
    typeof systemMsg?.content === "string" ? systemMsg.content : undefined;
  const userText = userMsg
    .map((m) =>
      typeof m.content === "string"
        ? m.content
        : "[image input not supported on BYOK provider]",
    )
    .join("\n");

  const byokText = await callAIProvider(integration, {
    system: systemText,
    prompt: userText,
    maxTokens: maxTokens ?? 4096,
    temperature: temperature ?? 0.7,
  });

  return {
    text: byokText,
    tier,
    model: integration.name,
    provider: "byok",
    inputTokens: 0, // legacy provider doesn't return token counts
    outputTokens: 0,
    cost: 0, // customer's cost, not ours
    selfHostedUsed: false,
  };
}

// ─── Cost estimate helper ────────────────────────────────────────────────────

export interface CostEstimate {
  taskType: AITaskType;
  tier: TaskTier;
  estimatedCostMin: number;
  estimatedCostMax: number;
  provider: "gemma" | "byok";
}

const COST_ESTIMATES: Record<AITaskType, { min: number; max: number }> = {
  voice_transcription: { min: 0.001, max: 0.002 },
  note_structuring: { min: 0.001, max: 0.003 },
  evidence_classification: { min: 0.003, max: 0.005 },
  photo_quality_scoring: { min: 0.002, max: 0.004 },
  contradiction_detection: { min: 0.004, max: 0.008 },
  material_recognition: { min: 0.008, max: 0.015 },
  contents_manifest_basic: { min: 0.005, max: 0.015 },
  contents_manifest_detail: { min: 0.05, max: 0.15 },
  scope_generation: { min: 0.1, max: 0.5 },
  report_generation: { min: 0.1, max: 0.5 },
  dispute_defence: { min: 0.15, max: 0.75 },
};

export function estimateTaskCost(taskType: AITaskType): CostEstimate {
  const tier = getTaskTier(taskType);
  const { min, max } = COST_ESTIMATES[taskType];
  const provider =
    (tier === "basic" || tier === "standard") && isGemmaAvailable()
      ? "gemma"
      : "byok";
  return {
    taskType,
    tier,
    estimatedCostMin: min,
    estimatedCostMax: max,
    provider,
  };
}
