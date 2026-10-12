import type { ClaimContext } from "./claim-context";
import type { WaterDamageCompletenessPack } from "@/lib/completeness/water-damage-pack";

export function formatClaimContextForPrompt(args: {
  context: ClaimContext;
  completeness: WaterDamageCompletenessPack;
}): string {
  const { context, completeness } = args;
  const lines = [
    `Inspection ${context.inspectionId}`,
    `Stage: ${context.stage}`,
    `Claim type: ${context.claimType ?? "unknown"}`,
    `Completeness: ${completeness.completionPercent}%`,
    completeness.blocking.length
      ? `Blocking gaps: ${completeness.blocking.join(", ")}`
      : "No blocking completeness gaps",
    context.missingFields.length
      ? `Missing fields: ${context.missingFields.join(", ")}`
      : "Core fields present",
    `Wet monitoring points (latest): ${context.wetReadingCount}`,
    `Baseline captured: ${context.baselineCaptured ? "yes" : "no"}`,
  ];
  return lines.join("\n");
}
