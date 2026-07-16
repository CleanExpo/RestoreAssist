/**
 * Re-export AI ownership helpers for report UI consumers.
 */

export {
  AI_OWNERSHIP_ACK_LABEL,
  AI_OWNERSHIP_BANNER_BODY,
  AI_OWNERSHIP_BANNER_TITLE,
  AI_OWNERSHIP_EDIT_REQUIRED,
  AI_OWNERSHIP_EXPORT_READY,
  AI_OWNERSHIP_EXPORT_WATERMARKED,
  AI_OWNERSHIP_PROMPT_INSTRUCTION,
  AI_OWNERSHIP_STEPPER_HEADING,
  AI_OWNERSHIP_STEPPER_SUBHEAD,
  AI_OWNERSHIP_WATERMARK,
  aiDraftResetOnGenerate,
  canAcknowledgeAiOwnership,
  getAiOwnershipStatus,
  getAiOwnershipStatusMeta,
  getAiOwnershipSteps,
  isAiDraftPending,
  type AiOwnershipFields,
  type AiOwnershipStatus,
  type AiOwnershipStatusMeta,
  type AiOwnershipStep,
} from "@/lib/reports/ai-ownership";
