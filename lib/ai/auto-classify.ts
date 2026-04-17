import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
// TODO RA-1087: import { logAiUsage } from "@/lib/ai-usage"; — module does not yet exist

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
   * RA-1126: IICRC S500:2025 clause references from LLM classifier.
   * e.g. ["S500:2025 §10.5.4"]
   */
  clauseRefs?: string[];
  /**
   * RA-1126: Whether the LLM classifier recommends human review.
   * Set to true when llmConfidence < 0.7 or the situation is ambiguous.
   */
  humanReviewRequired?: boolean;
}

// ---------------------------------------------------------------------------
// Zod schema for LLM-structured output (internal — not exported)
// ---------------------------------------------------------------------------
const ClassificationSchema = z.object({
  claimType: z.enum(["water", "fire", "mould", "storm", "biohazard"]),
  category: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  class: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(20).max(500),
  clauseRefs: z.array(z.string()),
  humanReviewRequired: z.boolean(),
});

type LlmClassification = z.infer<typeof ClassificationSchema>;

/** Maps the LLM's simpler claim type vocabulary to the app's ClaimType union. */
function mapLlmClaimType(llmType: LlmClassification["claimType"]): ClaimType {
  switch (llmType) {
    case "water":
      return "water_damage";
    case "fire":
      return "fire_smoke";
    case "mould":
      return "mould";
    case "storm":
      return "storm";
    case "biohazard":
      // Biohazard has no direct equivalent — map to water_damage with note.
      // humanReviewRequired will be set by the LLM in these cases.
      return "water_damage";
    default:
      return "water_damage";
  }
}

/** Converts a numeric confidence (0–1) to the string union used by the UI. */
function confidenceBand(value: number): "high" | "medium" | "low" {
  if (value >= 0.85) return "high";
  if (value >= 0.7) return "medium";
  return "low";
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

// ---------------------------------------------------------------------------
// Stage 2: Vector-based classification (when historical job store is populated).
// ---------------------------------------------------------------------------

/**
 * Stage 2: Vector-based classification (when historical job store is populated).
 * Takes top 3 similar jobs and votes on category/class.
 */
export async function vectorClassify(input: {
  description: string;
  claimType: ClaimType;
  tenantId: string;
}): Promise<ClassificationResult | null> {
  try {
    // Query HistoricalJob for top 3 similar jobs of same claim type
    const { prisma } = await import("@/lib/prisma");
    const jobs = await (prisma as any).historicalJob.findMany({
      where: {
        tenantId: input.tenantId,
        claimType: input.claimType,
      },
      take: 3,
      orderBy: { createdAt: "desc" },
      select: {
        waterCategory: true,
        waterClass: true,
        claimType: true,
      },
    });

    if (jobs.length === 0) return null;

    // Majority vote on category and class
    const categories = jobs
      .map((j: any) => j.waterCategory)
      .filter(Boolean) as number[];
    const classes = jobs
      .map((j: any) => j.waterClass)
      .filter(Boolean) as number[];

    const mode = (arr: number[]) =>
      arr.length === 0
        ? undefined
        : arr
            .sort(
              (a, b) =>
                arr.filter((v) => v === a).length -
                arr.filter((v) => v === b).length,
            )
            .pop();

    return {
      claimType: input.claimType,
      damageCategory: mode(categories),
      damageClass: mode(classes),
      confidence: jobs.length >= 3 ? "high" : "medium",
      reasoning: `Based on ${jobs.length} similar historical jobs`,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stage 3: LLM classifier — Claude Opus 4.7 via Anthropic SDK (RA-1126).
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an IICRC S500:2025-certified water damage classifier for Australian and New Zealand restoration contractors.

Given inspection data, return JSON with:
- claimType (water/fire/mould/storm/biohazard)
- category (1, 2, or 3 per S500:2025 §10.5)
- class (1-4 per S500:2025 §10.6)
- confidence (0.0-1.0)
- reasoning (20-500 chars, cite clauses)
- clauseRefs (array of "S500:2025 §X.Y.Z" citations)
- humanReviewRequired (true if confidence < 0.7 or ambiguous)

Australian English spelling (mould, not mold). If jurisdiction is "NZ", additionally consider NZBS E2/E3.`;

/**
 * Stage 3: LLM classification using Claude Opus 4.7.
 *
 * Falls back to ruleBasedClassify when:
 * - The Anthropic API call fails for any reason
 * - The LLM response does not parse as valid JSON
 * - The parsed JSON fails Zod validation
 *
 * The returned ClassificationResult is compatible with all existing consumers.
 * Additional fields (llmConfidence, clauseRefs, humanReviewRequired) are optional
 * and ignored by consumers that don't use them.
 */
export async function llmClassify(input: {
  description: string;
  notes?: string;
  averageMoistureReading?: number;
  location?: string;
  jurisdiction?: "AU" | "NZ";
}): Promise<ClassificationResult> {
  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const userContent = JSON.stringify({
      description: input.description,
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.averageMoistureReading !== undefined && {
        averageMoistureReading: input.averageMoistureReading,
      }),
      ...(input.location !== undefined && { location: input.location }),
      jurisdiction: input.jurisdiction ?? "AU",
    });

    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Input:\n${userContent}\n\nReturn only valid JSON matching the schema described. No markdown fences.`,
        },
      ],
    });

    // Extract the text block from the response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.warn(
        "[llmClassify] No text block in response — falling back to ruleBasedClassify",
      );
      return ruleBasedClassify(input);
    }

    // Strip any accidental markdown fences the model might emit
    const rawJson = textBlock.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      console.warn(
        "[llmClassify] JSON.parse failed — falling back to ruleBasedClassify",
      );
      return ruleBasedClassify(input);
    }

    const validated = ClassificationSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn(
        "[llmClassify] Zod validation failed:",
        validated.error.flatten(),
        "— falling back to ruleBasedClassify",
      );
      return ruleBasedClassify(input);
    }

    const llm = validated.data;

    // Enforce humanReviewRequired when confidence is below threshold
    const humanReviewRequired = llm.humanReviewRequired || llm.confidence < 0.7;

    // TODO RA-1087: logAiUsage({ model: "claude-opus-4-7", usage: response.usage, feature: "llmClassify" });

    const claimType = mapLlmClaimType(llm.claimType);

    return {
      claimType,
      // Only emit damageCategory/damageClass for water-type claims
      ...(claimType === "water_damage" && {
        damageCategory: llm.category,
        damageClass: llm.class,
      }),
      confidence: confidenceBand(llm.confidence),
      reasoning: llm.reasoning,
      llmConfidence: llm.confidence,
      clauseRefs: llm.clauseRefs,
      humanReviewRequired,
    };
  } catch (err) {
    console.error(
      "[llmClassify] Unexpected error — falling back to ruleBasedClassify:",
      err,
    );
    return ruleBasedClassify(input);
  }
}
