/**
 * lib/ai — RestoreAssist AI layer
 *
 * Exports:
 *   - gemma-client: Self-hosted Gemma-4-31B-IT (RA-403)
 *   - model-router: Task-based model routing (RA-404)
 */

export {
  GEMMA_MODEL,
  GEMMA_COST,
  isGemmaAvailable,
  callGemma,
} from "./gemma-client";
export type {
  GemmaMessage,
  GemmaCallOptions,
  GemmaCallResult,
} from "./gemma-client";

export { getTaskTier, routeTask, estimateTaskCost } from "./model-router";
export type {
  AITaskType,
  TaskTier,
  UserAIConfig,
  RouterCallOptions,
  RouterCallResult,
  CostEstimate,
} from "./model-router";
