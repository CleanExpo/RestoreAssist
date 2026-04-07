/**
 * RA-414: AI Usage Logging — Fire-and-Forget Async Wrapper
 *
 * Logs every AI call to AiUsageLog without adding latency to user-facing requests.
 * Uses setImmediate to defer the DB write to the next event loop tick.
 *
 * Usage:
 *   const result = await byokDispatch(input);
 *   logAiUsage({
 *     workspaceId: ws.id,
 *     provider: 'ANTHROPIC',
 *     model: 'claude-opus-4-5',
 *     taskType: 's500_report',
 *     inputTokens: result.usage.input_tokens,
 *     outputTokens: result.usage.output_tokens,
 *     estimatedCostUsd: result.estimatedCostUsd,
 *     latencyMs: elapsed,
 *     success: true,
 *   });
 */

import { prisma } from "../prisma";

/** AI provider enum — mirrors Prisma AiProvider */
export type AiProvider = "ANTHROPIC" | "OPENAI" | "GOOGLE" | "GEMMA";

export interface AiUsageLogInput {
  workspaceId: string;
  memberId?: string; // WorkspaceMember.id — omit for system calls
  provider: AiProvider;
  model: string;
  taskType: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  success: boolean;
  errorType?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an AI usage event asynchronously.
 * Fire-and-forget: errors are swallowed and logged to console only.
 * This must never throw or await — callers must not block on it.
 */
export function logAiUsage(input: AiUsageLogInput): void {
  // Defer to next tick so the caller's response is not blocked
  setImmediate(() => {
    prisma.aiUsageLog
      .create({
        data: {
          workspaceId: input.workspaceId,
          memberId: input.memberId ?? null,
          provider: input.provider,
          model: input.model,
          taskType: input.taskType,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          estimatedCostUsd: input.estimatedCostUsd,
          latencyMs: input.latencyMs,
          success: input.success,
          errorType: input.errorType ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metadata: (input.metadata ?? undefined) as any,
        },
      })
      .catch((err: unknown) => {
        // Intentionally swallowed — usage logging must never fail user requests
        console.error("[logAiUsage] Failed to persist AI usage log:", err);
      });
  });
}

/**
 * Estimate USD cost for a given provider/model based on public pricing.
 * Used when the AI SDK does not return cost directly.
 * Prices as of 2026-04 (per million tokens).
 */
export function estimateCostUsd(
  provider: AiProvider,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[provider]?.[model] ?? DEFAULT_PRICING[provider];
  if (!pricing) return 0;
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion
  );
}

interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

/** Provider-level fallback pricing when exact model is unknown */
const DEFAULT_PRICING: Partial<Record<AiProvider, ModelPricing>> = {
  ANTHROPIC: { inputPerMillion: 3.0, outputPerMillion: 15.0 }, // claude-3-haiku baseline
  OPENAI: { inputPerMillion: 2.5, outputPerMillion: 10.0 }, // gpt-4o baseline
  GOOGLE: { inputPerMillion: 1.25, outputPerMillion: 5.0 }, // gemini-1.5-flash baseline
  GEMMA: { inputPerMillion: 0.01, outputPerMillion: 0.02 }, // self-hosted Gemma estimate
};

const MODEL_PRICING: Partial<Record<AiProvider, Record<string, ModelPricing>>> =
  {
    ANTHROPIC: {
      "claude-opus-4-5": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
      "claude-sonnet-4-5": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
      "claude-haiku-4-5": { inputPerMillion: 0.8, outputPerMillion: 4.0 },
    },
    OPENAI: {
      "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
      "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    },
    GOOGLE: {
      "gemini-1.5-pro": { inputPerMillion: 3.5, outputPerMillion: 10.5 },
      "gemini-1.5-flash": { inputPerMillion: 0.075, outputPerMillion: 0.3 },
      "gemini-2.0-flash": { inputPerMillion: 0.1, outputPerMillion: 0.4 },
    },
  };
