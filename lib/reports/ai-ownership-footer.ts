/**
 * Short footer line for emailed or printed packages while AI draft is pending.
 */

import { AI_OWNERSHIP_WATERMARK } from "@/lib/reports/ai-ownership";

export function aiOwnershipExportFooter(): string {
  return `${AI_OWNERSHIP_WATERMARK}. Application holder must rewrite and acknowledge before issuing.`;
}
