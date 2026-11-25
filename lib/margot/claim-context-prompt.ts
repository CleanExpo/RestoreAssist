import type { ClaimContext } from "./claim-context";
import type { CompletenessPack } from "@/lib/completeness/claim-type-pack";

/** Water-only fields; a non-water job must not be told it is missing them. */
const WATER_ONLY_MISSING_FIELDS = new Set(["waterCategoryClass", "baselineReading"]);

export function formatClaimContextForPrompt(args: {
  context: ClaimContext;
  completeness: CompletenessPack;
}): string {
  const { context, completeness } = args;
  const isWater = completeness.packId === "water";
  const missingFields = isWater
    ? context.missingFields
    : context.missingFields.filter((f) => !WATER_ONLY_MISSING_FIELDS.has(f));
  const lines = [
    `Inspection ${context.inspectionId}`,
    `Stage: ${context.stage}`,
    `Claim type: ${context.claimType ?? "unknown"}`,
    `Completeness: ${completeness.completionPercent}%`,
    completeness.blocking.length
      ? `Blocking gaps: ${completeness.blocking.join(", ")}`
      : "No blocking completeness gaps",
    missingFields.length
      ? `Missing fields: ${missingFields.join(", ")}`
      : "Core fields present",
  ];
  if (isWater) {
    lines.push(
      `Wet monitoring points (latest): ${context.wetReadingCount}`,
      `Baseline captured: ${context.baselineCaptured ? "yes" : "no"}`,
    );
  }
  return lines.join("\n");
}
