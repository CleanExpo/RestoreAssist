"use client";

import { StatusBadge } from "@/components/StatusBadge";
import {
  getAiOwnershipStatusMeta,
  type AiOwnershipFields,
} from "@/lib/reports/ai-ownership";

interface AiOwnershipBadgeProps {
  report: AiOwnershipFields;
  /** Compact list label vs full label. Default: short. */
  variant?: "short" | "full";
  className?: string;
}

/**
 * List/detail ownership pill — only renders when there is something to show
 * (AI draft, confirm ownership, or holder-owned).
 */
export default function AiOwnershipBadge({
  report,
  variant = "short",
  className,
}: AiOwnershipBadgeProps) {
  const meta = getAiOwnershipStatusMeta(report);
  if (meta.status === "no_content") return null;

  return (
    <StatusBadge
      tone={meta.tone}
      className={className}
      ariaLabel={meta.label}
    >
      {variant === "full" ? meta.label : meta.shortLabel}
    </StatusBadge>
  );
}
