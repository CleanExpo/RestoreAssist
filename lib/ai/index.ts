/**
 * AI module barrel export.
 * BYOK (Bring Your Own Key) multi-provider dispatch with vision support.
 * RestoreAssist AI — self-hosted Gemma-4-31B-IT tier with BYOK fallback.
 * Model Router — task-based routing for cost optimization.
 * Contents Manifest — vision-based contents identification from field photos.
 */

// ━━━ BYOK Client (user-provided API keys) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export {
  byokDispatch,
  analyzeInspectionPhotos,
  parseS500Output,
  supportsVision,
  estimateVisionCost,
  S500_VISION_SYSTEM_PROMPT,
  BYOK_ALLOWED_MODELS,
} from "./byok-client";

export type {
  AllowedModel,
  ProviderFamily,
  VisionMediaType,
  VisionInput,
  ByokRequest,
  ByokResponse,
  S500StructuredOutput,
} from "./byok-client";

// ━━━ RestoreAssist AI (self-hosted Gemma-4-31B-IT) ━━━━━━━━━━━━━━━━━━━
export {
  restoreAssistAiDispatch,
  analyzeInspectionPhotosRA,
  isRestoreAssistAiHealthy,
  resetHealthCache,
  estimateRestoreAssistAiCost,
  RESTOREASSIST_AI_MODEL,
  RESTOREASSIST_AI_DISPLAY_NAME,
  RESTOREASSIST_AI_PRICING,
} from "./restoreassist-ai-client";

export type {
  AiTier,
  RestoreAssistAiRequest,
  RestoreAssistAiResponse,
} from "./restoreassist-ai-client";

// ━━━ Model Router (task-based cost optimization) ━━━━━━━━━━━━━━━━━━━━━
export {
  routeAiRequest,
  getTaskTier,
  classifyEvidence,
  generateS500Report,
  structureFieldNotes,
  estimateRoutingSavings,
  getRouterStatus,
} from "./model-router";

export type {
  AiTaskType,
  TaskTier,
  RouterConfig,
  RoutedAiRequest,
  RoutedAiResponse,
} from "./model-router";

// ━━━ Contents Manifest (vision-based contents identification) ━━━━━━━━
export {
  generateContentsManifest,
  manifestToCsv,
  manifestToXlsxData,
  computeManifestStatistics,
  estimateManifestCost,
  CONTENTS_MANIFEST_SYSTEM_PROMPT,
  CONTENTS_CONDITIONS,
  CONTENTS_CONDITION_LABELS,
  CONTENTS_CATEGORIES,
  CONTENTS_CATEGORY_LABELS,
  MANIFEST_CSV_HEADERS,
} from "./contents-manifest";

export type {
  ContentsCondition,
  ContentsCategory,
  RestorabilityVerdict,
  ContentsManifestItem,
  ContentsManifest,
  ManifestStatistics,
} from "./contents-manifest";
