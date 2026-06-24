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
      "bg-success-subtle text-success-subtle-foreground border-success-subtle-foreground/30",
    marginal:
      "bg-warning-subtle text-warning-subtle-foreground border-warning-subtle-foreground/30",
    rejected:
      "bg-destructive-subtle text-destructive-subtle-foreground border-destructive-subtle-foreground/30",
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
