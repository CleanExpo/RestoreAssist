/**
 * Client-safe classification rules — pure functions and types only.
 *
 * Extracted from lib/ai/auto-classify.ts so client components (e.g.
 * components/inspection/ClassificationSuggestion.tsx) can import the
 * rule-based stage without dragging the server-only module graph
 * (@anthropic-ai/sdk, and the dynamic @/lib/prisma → pg import inside
 * vectorClassify) into the browser bundle. pg 8.22.0 requires the Node
 * builtin "util/types", which breaks `next build` when bundled client-side.
 *
 * Do NOT import server-only modules here.
 */

export type ClaimType =
  | "water_damage"
  | "fire_smoke"
  | "storm"
  | "mould"
  | "contents";

export interface ClassificationResult {
  claimType: ClaimType;
  damageCategory?: number; // 1-3, water damage only
  damageClass?: number; // 1-4, water damage only
  /**
   * @deprecated RA-1115: rule-based stage returns "unclear" only — prior
   * heuristic (input-length) was misleading. True LLM confidence lands in
   * RA-1126. Vector stage retains "high" | "medium" pending that work.
   */
  confidence: "high" | "medium" | "low" | "unclear";
  reasoning: string; // Human-readable explanation shown in UI
  /**
   * RA-1126: Numeric confidence from LLM classifier (0.0–1.0).
   * Present only when llmClassify was used; absent for ruleBasedClassify results.
   */
  llmConfidence?: number;
  /**
   * RA-1126: IICRC S500:2021 clause references from LLM classifier.
   * e.g. ["S500:2021 §10.4.1"]
   */
  clauseRefs?: string[];
  /**
   * RA-1126: Whether the LLM classifier recommends human review.
   * Set to true when llmConfidence < 0.7 or the situation is ambiguous.
   */
  humanReviewRequired?: boolean;
}

// ---------------------------------------------------------------------------
// Stage 1: Rule-based classifier — fast, free, works offline.
// ---------------------------------------------------------------------------

/**
 * Stage 1: Rule-based classification — fast, free, works offline.
 * Used immediately on each keystroke (debounced).
 */
export function ruleBasedClassify(input: {
  description: string;
  notes?: string;
  averageMoistureReading?: number;
  location?: string;
}): ClassificationResult {
  const text =
    `${input.description ?? ""} ${input.notes ?? ""} ${input.location ?? ""}`.toLowerCase();

  // Claim type detection (order matters — most specific first)
  let claimType: ClaimType = "water_damage";
  let typeReasoning = "";

  if (/fire|smoke|soot|char|burn|flame|scorch|ember/.test(text)) {
    claimType = "fire_smoke";
    typeReasoning = "Fire/smoke keywords detected";
  } else if (/mould|mold|fungi|spore|musty|black mould|mycotox/.test(text)) {
    claimType = "mould";
    typeReasoning = "Mould keywords detected";
  } else if (
    /storm|hail|wind|roof|cyclone|tempest|tornado|flood rain/.test(text)
  ) {
    claimType = "storm";
    typeReasoning = "Storm keywords detected";
  } else if (/contents|furniture|possessions|pack.?out|inventory/.test(text)) {
    claimType = "contents";
    typeReasoning = "Contents keywords detected";
  } else {
    typeReasoning = "Defaulting to water damage";
  }

  // For water damage: determine category
  let damageCategory: number | undefined;
  let damageClass: number | undefined;
  let categoryReasoning = "";

  if (claimType === "water_damage") {
    // Category from contamination keywords
    if (
      /sewage|black water|toilet overflow|sewer|category.?3|cat.?3|biohazard|faecal|human waste/.test(
        text,
      )
    ) {
      damageCategory = 3;
      categoryReasoning =
        "Category 3 (black water/sewage) — biohazard protocols required";
    } else if (
      /grey water|gray water|washing machine|dishwasher|overflow|category.?2|cat.?2|contaminate/.test(
        text,
      )
    ) {
      damageCategory = 2;
      categoryReasoning =
        "Category 2 (grey water) — antimicrobial treatment required";
    } else {
      damageCategory = 1;
      categoryReasoning = "Category 1 (clean water) — standard drying protocol";
    }

    // Class from moisture readings + description
    const avgMoisture = input.averageMoistureReading ?? 0;
    if (
      avgMoisture > 40 ||
      /class.?4|soaked|saturated|concrete|dense material/.test(text)
    ) {
      damageClass = 4;
    } else if (
      avgMoisture > 25 ||
      /class.?3|ceiling|insulation|entire room|extensive/.test(text)
    ) {
      damageClass = 3;
    } else if (
      avgMoisture > 15 ||
      /class.?2|carpet|significant|walls and floor/.test(text)
    ) {
      damageClass = 2;
    } else {
      damageClass = 1;
    }
  }

  const reasoning = [
    typeReasoning,
    categoryReasoning,
    damageClass ? `Class ${damageClass} based on moisture readings` : "",
  ]
    .filter(Boolean)
    .join(". ");

  return {
    claimType,
    damageCategory,
    damageClass,
    // RA-1115: input length is not a confidence signal — stopgap until RA-1126
    // replaces rule-based stage with real LLM confidence.
    confidence: "unclear",
    reasoning,
  };
}
