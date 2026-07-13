/**
 * Whether export surfaces should warn that the package is still an AI draft.
 */

import { isAiDraftPending, type AiOwnershipFields } from "@/lib/reports/ai-ownership";

export function shouldWarnAiDraftOnExport(report: AiOwnershipFields): boolean {
  return isAiDraftPending(report);
}
