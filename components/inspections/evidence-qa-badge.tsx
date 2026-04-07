"use client";

/**
 * Sprint I: Evidence QA Badge
 * [RA-411] Colour-coded quality badge for evidence scores.
 *
 * Green (85+): acceptable
 * Amber (70-84): marginal
 * Red (<70): rejected
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface EvidenceQABadgeProps {
  score: number;
  size?: "sm" | "md";
}

/**
 * Displays a colour-coded badge indicating evidence quality score.
 *
 * - Green background for acceptable (85+)
 * - Amber background for marginal (70-84)
 * - Red / destructive background for rejected (<70)
 */
export function EvidenceQABadge({ score, size = "md" }: EvidenceQABadgeProps) {
  const tier =
    score >= 85 ? "acceptable" : score >= 70 ? "marginal" : "rejected";

  const label = `${score}/100`;

  const tierStyles: Record<typeof tier, string> = {
    acceptable:
      "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
    marginal:
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
    rejected:
      "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
  };

  const sizeStyles: Record<"sm" | "md", string> = {
    sm: "text-[10px] px-1.5 py-0",
    md: "text-xs px-2 py-0.5",
  };

  return (
    <Badge
      variant="outline"
      className={cn(tierStyles[tier], sizeStyles[size])}
      aria-label={`Evidence quality score: ${score} out of 100, rated ${tier}`}
    >
      {label}
    </Badge>
  );
}
