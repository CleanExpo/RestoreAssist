/**
 * AI draft ownership — application holder liability, not RestoreAssist.
 * Watermark and UI disclaimer stay until the holder rewrites and acknowledges.
 */

export const AI_OWNERSHIP_PROMPT_INSTRUCTION = `CRITICAL LIABILITY RULE:
This output is an AI-ASSISTED DRAFT only. You (the model) are a documentation assistant, not the author of record.
- Begin the report body with a clear line: "AI-ASSISTED DRAFT — Application holder must review and rewrite before use."
- Do not present the draft as a final signed professional opinion.
- The restoration company application holder must read, edit, and take ownership; liability for the issued report rests with them, not with the AI or the platform.`;

export const AI_OWNERSHIP_WATERMARK =
  "AI-ASSISTED DRAFT — HOLDER MUST REVIEW & REWRITE — NOT PLATFORM OPINION";

export const AI_OWNERSHIP_BANNER_TITLE = "AI-assisted draft — not your final report yet";

export const AI_OWNERSHIP_BANNER_BODY =
  "This report was drafted by AI as an assistant only. You (the application holder) must read it, rewrite it in your own words, then confirm ownership. RestoreAssist is not liable for the written content of issued reports — that responsibility sits with you.";

export const AI_OWNERSHIP_ACK_LABEL =
  "I confirm this is my report, written in my words. AI was only an assistant. I accept responsibility for this content.";

export const AI_OWNERSHIP_EDIT_REQUIRED =
  "Save your own edits to the report before you can remove the AI-draft disclaimer.";

export type AiOwnershipFields = {
  detailedReport?: string | null;
  aiDraftGeneratedAt?: Date | string | null;
  aiDraftHumanEditedAt?: Date | string | null;
  reportOwnershipAcknowledgedAt?: Date | string | null;
};

/** True while AI draft disclaimer / watermark must remain visible. */
export function isAiDraftPending(report: AiOwnershipFields): boolean {
  if (!report.detailedReport) return false;
  if (report.reportOwnershipAcknowledgedAt) return false;
  // If we never stamped generation, still treat existing AI body as pending
  // when acknowledgement is absent (legacy rows).
  return true;
}

/** Holder may acknowledge only after a human save following AI generation. */
export function canAcknowledgeAiOwnership(report: AiOwnershipFields): boolean {
  if (!isAiDraftPending(report)) return false;
  if (!report.aiDraftHumanEditedAt) return false;
  if (!report.aiDraftGeneratedAt) return true;
  return (
    new Date(report.aiDraftHumanEditedAt).getTime() >=
    new Date(report.aiDraftGeneratedAt).getTime()
  );
}

/** Prisma data to reset ownership when AI rewrites the report body. */
export function aiDraftResetOnGenerate() {
  return {
    aiDraftGeneratedAt: new Date(),
    aiDraftHumanEditedAt: null as Date | null,
    reportOwnershipAcknowledgedAt: null as Date | null,
    reportOwnershipAcknowledgedBy: null as string | null,
  };
}
