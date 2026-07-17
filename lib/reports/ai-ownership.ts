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

export const AI_OWNERSHIP_STEPPER_HEADING = "Report ownership review";

export const AI_OWNERSHIP_STEPPER_SUBHEAD =
  "AI drafted this as an assistant only. You issue the report — review, rewrite, then confirm ownership before sending to insurers or clients.";

export const AI_OWNERSHIP_EXPORT_READY =
  "Holder-owned — exports issue without the AI-draft watermark.";

export const AI_OWNERSHIP_EXPORT_WATERMARKED =
  "AI-assisted draft — PDF, Word, and ZIP keep a watermark until you rewrite and acknowledge ownership.";

export type AiOwnershipFields = {
  detailedReport?: string | null;
  /** List APIs may omit the body and pass this instead. */
  hasDetailedReport?: boolean;
  aiDraftGeneratedAt?: Date | string | null;
  aiDraftHumanEditedAt?: Date | string | null;
  reportOwnershipAcknowledgedAt?: Date | string | null;
};

/**
 * Enterprise ownership lifecycle for badges, steppers, and export summaries.
 * - no_content: nothing to issue yet
 * - ai_draft: body exists; holder has not rewritten after AI (or never edited)
 * - ready_to_acknowledge: rewrite saved; ack CTA enabled
 * - owned: holder confirmed; watermark may clear
 */
export type AiOwnershipStatus =
  | "no_content"
  | "ai_draft"
  | "ready_to_acknowledge"
  | "owned";

export type AiOwnershipStatusMeta = {
  status: AiOwnershipStatus;
  label: string;
  shortLabel: string;
  tone: "neutral" | "warning" | "info" | "success";
  exportReady: boolean;
  nextAction: string | null;
};

function hasReportBody(report: AiOwnershipFields): boolean {
  if (typeof report.hasDetailedReport === "boolean") {
    return report.hasDetailedReport;
  }
  if (report.detailedReport != null) {
    return report.detailedReport.trim().length > 0;
  }
  return false;
}

/** List/API payloads may omit the body; infer content from ownership stamps. */
function hasReportBodyOrStamp(report: AiOwnershipFields): boolean {
  if (hasReportBody(report)) return true;
  return Boolean(
    report.aiDraftGeneratedAt || report.reportOwnershipAcknowledgedAt,
  );
}

/** True while AI draft disclaimer / watermark must remain visible. */
export function isAiDraftPending(report: AiOwnershipFields): boolean {
  if (!hasReportBody(report)) return false;
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

export function getAiOwnershipStatus(
  report: AiOwnershipFields,
): AiOwnershipStatus {
  if (!hasReportBodyOrStamp(report)) return "no_content";
  if (report.reportOwnershipAcknowledgedAt) return "owned";
  // List rows without body text: generation stamp means draft until ack.
  if (!hasReportBody(report) && report.aiDraftGeneratedAt) {
    if (
      report.aiDraftHumanEditedAt &&
      new Date(report.aiDraftHumanEditedAt).getTime() >=
        new Date(report.aiDraftGeneratedAt).getTime()
    ) {
      return "ready_to_acknowledge";
    }
    return "ai_draft";
  }
  if (canAcknowledgeAiOwnership(report)) return "ready_to_acknowledge";
  return "ai_draft";
}

export function getAiOwnershipStatusMeta(
  report: AiOwnershipFields,
): AiOwnershipStatusMeta {
  const status = getAiOwnershipStatus(report);
  switch (status) {
    case "no_content":
      return {
        status,
        label: "No report body yet",
        shortLabel: "No report",
        tone: "neutral",
        exportReady: false,
        nextAction: "Generate or write the inspection report first.",
      };
    case "ai_draft":
      return {
        status,
        label: "AI-assisted draft — rewrite required",
        shortLabel: "AI draft",
        tone: "warning",
        exportReady: false,
        nextAction: "Rewrite in your own words and save, then acknowledge ownership.",
      };
    case "ready_to_acknowledge":
      return {
        status,
        label: "Rewrite saved — confirm ownership",
        shortLabel: "Confirm ownership",
        tone: "info",
        exportReady: false,
        nextAction: "Confirm ownership to issue without the AI-draft watermark.",
      };
    case "owned":
      return {
        status,
        label: "Holder-owned — ready to issue",
        shortLabel: "Owned",
        tone: "success",
        exportReady: true,
        nextAction: null,
      };
  }
}

export type AiOwnershipStepId =
  | "draft"
  | "rewrite"
  | "acknowledge"
  | "export";

export type AiOwnershipStepState = "complete" | "current" | "upcoming";

export type AiOwnershipStep = {
  id: AiOwnershipStepId;
  title: string;
  description: string;
  state: AiOwnershipStepState;
};

/** Four-step review progression for the report viewer. */
export function getAiOwnershipSteps(
  report: AiOwnershipFields,
): AiOwnershipStep[] {
  const status = getAiOwnershipStatus(report);
  const drafted = hasReportBodyOrStamp(report);
  const rewritten = canAcknowledgeAiOwnership(report) || status === "owned";
  const owned = status === "owned";

  const stateFor = (
    complete: boolean,
    current: boolean,
  ): AiOwnershipStepState => {
    if (complete) return "complete";
    if (current) return "current";
    return "upcoming";
  };

  return [
    {
      id: "draft",
      title: "AI draft",
      description: "Assistant produced a first pass for your review.",
      state: stateFor(drafted, !drafted),
    },
    {
      id: "rewrite",
      title: "Rewrite & save",
      description: "Edit in your words and save the report.",
      state: stateFor(rewritten, drafted && !rewritten),
    },
    {
      id: "acknowledge",
      title: "Confirm ownership",
      description: "Accept responsibility for the issued wording.",
      state: stateFor(owned, rewritten && !owned),
    },
    {
      id: "export",
      title: "Issue cleanly",
      description: owned
        ? "Exports ship without the AI-draft watermark."
        : "Watermark remains on PDF, Word, and ZIP until owned.",
      state: stateFor(owned, false),
    },
  ];
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
