/**
 * [RA-404] Task-based Model Router
 * Routes AI tasks to the cheapest capable model tier.
 *
 * Basic tasks (transcription, classification, note structuring, basic vision)
 *   → RestoreAssist AI (self-hosted Gemma-4-31B-IT) — ~$0.01-0.02/inspection
 *
 * Premium tasks (S500 reports, contents manifests, complex damage assessment)
 *   → BYOK (user's own Claude/Gemini/GPT key) — $0.08-1.10/inspection
 *
 * Expected 60-80% cost reduction for typical inspection workflows.
 *
 * BYOK allowlist is IMMUTABLE and NOT modified by this file.
 */

import type {
  VisionInput,
  AllowedModel,
  S500StructuredOutput,
} from "./byok-client";
import {
  byokDispatch,
  parseS500Output,
  S500_VISION_SYSTEM_PROMPT,
} from "./byok-client";
import type { RestoreAssistAiResponse } from "./restoreassist-ai-client";
import {
  restoreAssistAiDispatch,
  isRestoreAssistAiHealthy,
  RESTOREASSIST_AI_PRICING,
} from "./restoreassist-ai-client";
import { callGemma } from "./gemma-client";
import { prisma } from "@/lib/prisma";

// ━━━ Task Classification ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AI task types and their tier routing.
 * "basic" tasks are routed to the cheap self-hosted model.
 * "premium" tasks require higher-capability BYOK models.
 */
export type AiTaskType =
  // Basic tasks → RestoreAssist AI (Gemma)
  | "transcription" // Voice/audio transcription
  | "classification" // Evidence classification, damage type detection
  | "note_structuring" // Structuring field notes into formatted text
  | "basic_vision" // Simple photo tagging, OCR, basic identification
  | "summarisation" // Summarising inspection notes/readings
  | "translation" // Multi-language support
  | "close_summary" // SP-A: client-facing close-summary draft
  // Premium tasks → BYOK
  | "s500_report" // Full S500:2021 compliance report generation
  | "contents_manifest" // AI-drafted contents manifest from photos
  | "complex_damage_assessment" // Multi-room, multi-category damage analysis
  | "expert_analysis" // Complex reasoning about restoration strategy
  | "insurer_report" // Insurer-specific formatted reports
  | "weakness_detection"; // RA-5041: LLM contradiction/causation review of assembled reports (premium, BYOK)

/** Tier classification for each task type */
export type TaskTier = "basic" | "premium";

const TASK_TIER_MAP: Record<AiTaskType, TaskTier> = {
  // Basic → RestoreAssist AI (Gemma-4-31B-IT)
  transcription: "basic",
  classification: "basic",
  note_structuring: "basic",
  basic_vision: "basic",
  summarisation: "basic",
  translation: "basic",
  close_summary: "basic", // SP-A: short client-facing summary; Gemma is fine.
  // Premium → BYOK
  s500_report: "premium",
  contents_manifest: "premium",
  complex_damage_assessment: "premium",
  expert_analysis: "premium",
  insurer_report: "premium",
  weakness_detection: "premium",
};

/**
 * Get the tier for a given task type.
 */
export function getTaskTier(taskType: AiTaskType): TaskTier {
  return TASK_TIER_MAP[taskType];
}

// ━━━ Router Configuration ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RouterConfig {
  /** User's BYOK model preference for premium tasks */
  byokModel: AllowedModel;
  /** User's BYOK API key */
  byokApiKey: string;
  /** Force all tasks through BYOK (disable RestoreAssist AI routing) */
  forceByok?: boolean;
  /** Force all tasks through RestoreAssist AI (ignore tier, for testing) */
  forceRestoreAssistAi?: boolean;
}

// ━━━ Routed Request ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RoutedAiRequest {
  /** The task type being performed */
  taskType: AiTaskType;
  /** System prompt */
  systemPrompt: string;
  /** User text prompt */
  userPrompt: string;
  /** Optional vision inputs */
  visionInputs?: VisionInput[];
  /** Temperature override */
  temperature?: number;
  /** Max tokens override */
  maxTokens?: number;
  /** Timeout override in ms */
  timeoutMs?: number;
}

export interface RoutedAiResponse {
  /** The generated text */
  text: string;
  /** Which model generated the response */
  model: string;
  /** Which tier was used */
  tier: TaskTier;
  /** Whether it fell back from RestoreAssist AI to BYOK */
  fellBack: boolean;
  /** Token usage */
  usage?: { inputTokens: number; outputTokens: number };
  /** Estimated cost in USD */
  estimatedCostUsd?: number;
  /** Duration in ms */
  durationMs: number;
  /** The task type that was routed */
  taskType: AiTaskType;
}

// ━━━ Router ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Route an AI request to the appropriate model tier.
 *
 * Routing logic:
 * 1. If forceByok → always use BYOK
 * 2. If forceRestoreAssistAi → always use RestoreAssist AI (with BYOK fallback)
 * 3. If task is "basic" → RestoreAssist AI (with BYOK fallback)
 * 4. If task is "premium" → BYOK directly
 */
export async function routeAiRequest(
  req: RoutedAiRequest,
  config: RouterConfig,
): Promise<RoutedAiResponse> {
  const tier = getTaskTier(req.taskType);

  // Determine effective routing
  const useRestoreAssistAi =
    config.forceRestoreAssistAi || (!config.forceByok && tier === "basic");

  if (useRestoreAssistAi) {
    // Route to RestoreAssist AI with BYOK fallback
    const response = await restoreAssistAiDispatch(
      {
        systemPrompt: req.systemPrompt,
        userPrompt: req.userPrompt,
        visionInputs: req.visionInputs,
        temperature: req.temperature,
        maxTokens: req.maxTokens,
        timeoutMs: req.timeoutMs,
      },
      {
        model: config.byokModel,
        apiKey: config.byokApiKey,
      },
    );

    return {
      text: response.text,
      model: response.model,
      tier: response.fellBackToBYOK ? "premium" : "basic",
      fellBack: response.fellBackToBYOK,
      usage: response.usage,
      estimatedCostUsd: response.estimatedCostUsd,
      durationMs: response.durationMs,
      taskType: req.taskType,
    };
  }

  // Route directly to BYOK for premium tasks
  const start = Date.now();
  const byokResponse = await byokDispatch({
    model: config.byokModel,
    apiKey: config.byokApiKey,
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
    tier: "premium",
    fellBack: false,
    usage: byokResponse.usage,
    durationMs: byokResponse.durationMs,
    taskType: req.taskType,
  };
}

// ━━━ Convenience Wrappers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Classify evidence photos (basic task → RestoreAssist AI).
 */
export async function classifyEvidence(
  images: VisionInput[],
  config: RouterConfig,
  context?: string,
): Promise<RoutedAiResponse> {
  return routeAiRequest(
    {
      taskType: "classification",
      systemPrompt:
        "You are a water damage restoration evidence classifier. " +
        "Classify each photo into one of the 17 evidence classes: " +
        "moisture_reading, thermal_image, affected_area_photo, equipment_placement, " +
        "containment_setup, drying_progress, material_sample, air_quality_reading, " +
        "scope_documentation, authorization_form, safety_assessment, " +
        "site_arrival, building_exterior, initial_assessment, " +
        "final_inspection, client_signoff, fire_smoke_assessment. " +
        "Return JSON: { classifications: [{ imageIndex: number, class: string, confidence: number }] }",
      userPrompt: context
        ? `Classify these ${images.length} inspection photo(s). Context: ${context}`
        : `Classify these ${images.length} inspection photo(s).`,
      visionInputs: images,
      temperature: 0.1,
      maxTokens: 1024,
    },
    config,
  );
}

/**
 * Generate S500:2021 compliance report (premium task → BYOK).
 */
export async function generateS500Report(
  inspectionData: string,
  config: RouterConfig,
  images?: VisionInput[],
): Promise<RoutedAiResponse> {
  return routeAiRequest(
    {
      taskType: "s500_report",
      systemPrompt: S500_VISION_SYSTEM_PROMPT,
      userPrompt: inspectionData,
      visionInputs: images,
      temperature: 0.2,
      maxTokens: 8192,
    },
    config,
  );
}

/**
 * Structure field notes into formatted text (basic task → RestoreAssist AI).
 */
export async function structureFieldNotes(
  rawNotes: string,
  config: RouterConfig,
): Promise<RoutedAiResponse> {
  return routeAiRequest(
    {
      taskType: "note_structuring",
      systemPrompt:
        "You are a restoration field notes formatter. " +
        "Take raw, informal field notes from a technician and structure them into " +
        "clear, professional documentation suitable for an insurance report. " +
        "Preserve all measurements, observations, and technical details. " +
        "Use Australian English spelling. Reference S500:2021 sections where applicable.",
      userPrompt: rawNotes,
      temperature: 0.3,
      maxTokens: 2048,
    },
    config,
  );
}

// ━━━ Cost Estimation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Estimate the cost savings from using the model router vs BYOK-only.
 *
 * @param basicTaskCount - Number of basic tasks in a typical session
 * @param premiumTaskCount - Number of premium tasks in a typical session
 * @param avgTokensPerTask - Average tokens per task (input + output)
 * @param byokModel - The BYOK model being compared against
 * @returns Cost comparison with savings percentage
 */
export function estimateRoutingSavings(
  basicTaskCount: number,
  premiumTaskCount: number,
  avgTokensPerTask: number = 3000,
  byokModel: AllowedModel = "claude-sonnet-4-6",
): {
  byokOnlyCost: number;
  routedCost: number;
  savingsUsd: number;
  savingsPercent: number;
} {
  // BYOK pricing approximations (USD per 1M tokens, avg of input+output)
  const byokRates: Record<string, number> = {
    "claude-opus-4-6": 45.0,
    "claude-sonnet-4-6": 9.0,
    "gemini-3.1-pro": 3.0,
    "gemini-3.1-flash": 0.5,
    "gpt-5.4": 10.0,
    "gpt-5.4-mini": 1.0,
  };

  const byokRate = byokRates[byokModel] ?? 9.0;
  const raRate =
    (RESTOREASSIST_AI_PRICING.inputPer1M +
      RESTOREASSIST_AI_PRICING.outputPer1M) /
    2;

  const totalTasks = basicTaskCount + premiumTaskCount;
  const totalTokens = totalTasks * avgTokensPerTask;

  // BYOK-only: everything at BYOK rate
  const byokOnlyCost = (totalTokens * byokRate) / 1_000_000;

  // Routed: basic at RA rate, premium at BYOK rate
  const basicTokens = basicTaskCount * avgTokensPerTask;
  const premiumTokens = premiumTaskCount * avgTokensPerTask;
  const routedCost =
    (basicTokens * raRate) / 1_000_000 + (premiumTokens * byokRate) / 1_000_000;

  const savingsUsd = byokOnlyCost - routedCost;
  const savingsPercent =
    byokOnlyCost > 0 ? (savingsUsd / byokOnlyCost) * 100 : 0;

  return {
    byokOnlyCost: Math.round(byokOnlyCost * 10000) / 10000,
    routedCost: Math.round(routedCost * 10000) / 10000,
    savingsUsd: Math.round(savingsUsd * 10000) / 10000,
    savingsPercent: Math.round(savingsPercent * 10) / 10,
  };
}

/**
 * Get a summary of the router's current configuration and health.
 */
export async function getRouterStatus(): Promise<{
  restoreAssistAiHealthy: boolean;
  taskTypes: Array<{ type: AiTaskType; tier: TaskTier }>;
  basicTaskCount: number;
  premiumTaskCount: number;
}> {
  const healthy = await isRestoreAssistAiHealthy();
  const taskTypes = Object.entries(TASK_TIER_MAP).map(([type, tier]) => ({
    type: type as AiTaskType,
    tier,
  }));

  return {
    restoreAssistAiHealthy: healthy,
    taskTypes,
    basicTaskCount: taskTypes.filter((t) => t.tier === "basic").length,
    premiumTaskCount: taskTypes.filter((t) => t.tier === "premium").length,
  };
}

// ━━━ routeBasic — Setup-wizard Gemma path ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RouteOptions {
  /** User ID for credit-gate enforcement. */
  userId?: string;
  /** Desired response format. Defaults to "text". */
  responseFormat?: "text" | "json";
  /**
   * Skip the credit gate entirely.
   * Used during setup hydration (wizard runs before any feature lands).
   */
  bypassCreditGate?: boolean;
}

export interface RouteBasicResult {
  text: string;
  confidence: number;
}

/**
 * Route a prompt through the Gemma (basic) tier.
 *
 * - If userId is set and bypassCreditGate is not true, blocks users with
 *   creditsRemaining === 0 by returning null.
 * - Returns null on any error — callers must handle null gracefully.
 * - confidence defaults to 0.7 for non-empty responses, 0.0 for empty.
 * - If responseFormat is "json", attempts to parse the response and extract
 *   text/confidence keys; falls back to { text: raw, confidence: 0.5 }.
 */
export async function routeBasic(
  prompt: string,
  opts?: RouteOptions,
): Promise<RouteBasicResult | null> {
  try {
    // Credit gate — only enforce when userId is supplied and bypass not set
    if (opts?.userId && !opts.bypassCreditGate) {
      const user = await prisma.user.findUnique({
        where: { id: opts.userId },
        select: { creditsRemaining: true },
      });
      if (user && user.creditsRemaining !== null && user.creditsRemaining <= 0) {
        return null;
      }
    }

    const gemmaResult = await callGemma({
      messages: [{ role: "user", content: prompt }],
      responseFormat: opts?.responseFormat,
    });

    const raw = gemmaResult.text;

    if (!raw) {
      return { text: "", confidence: 0.0 };
    }

    if (opts?.responseFormat === "json") {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const obj = parsed as Record<string, unknown>;
          const text =
            typeof obj.text === "string" ? obj.text : JSON.stringify(parsed);
          const confidence =
            typeof obj.confidence === "number" ? obj.confidence : 0.5;
          return { text, confidence };
        }
      } catch {
        // JSON parse failed — fall through to raw text fallback
      }
      return { text: raw, confidence: 0.5 };
    }

    return { text: raw, confidence: 0.7 };
  } catch {
    return null;
  }
}
