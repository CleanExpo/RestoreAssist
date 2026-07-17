/**
 * JSON export metadata flag for AI draft ownership state.
 */

import { isAiDraftPending, type AiOwnershipFields } from "@/lib/reports/ai-ownership";

export function aiOwnershipExportMeta(report: AiOwnershipFields) {
  return {
    aiAssistedDraft: isAiDraftPending(report),
    ownershipAcknowledgedAt: report.reportOwnershipAcknowledgedAt ?? null,
  };
}
