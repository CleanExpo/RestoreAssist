import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
// TODO RA-1087: import { logAiUsage } from "@/lib/ai-usage"; — module does not yet exist

// Pure types + rule-based stage live in classify-rules.ts (client-safe — no
// server-only imports). Re-exported here so existing server-side consumers
// keep their import path; client components must import classify-rules
// directly to stay out of this module's server-only graph.
import {
  ruleBasedClassify,
  type ClaimType,
  type ClassificationResult,
} from "./classify-rules";
export {
  ruleBasedClassify,
  type ClaimType,
  type ClassificationResult,
} from "./classify-rules";

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

const SYSTEM_PROMPT = `You are an IICRC S500:2021-certified water damage classifier for Australian and New Zealand restoration contractors.

Given inspection data, return JSON with:
- claimType (water/fire/mould/storm/biohazard)
- category (1, 2, or 3 per S500:2021 §10.5)
- class (1-4 per S500:2021 §10.6)
- confidence (0.0-1.0)
- reasoning (20-500 chars, cite clauses)
- clauseRefs (array of "S500:2021 §X.Y.Z" citations)
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

    // 2026-04-22: moved from claude-opus-4-7 → claude-sonnet-4-6.
    // Reasoning for the swap:
    //   - Auto-classify is binary / multi-class categorisation; it does
    //     not need Opus's agentic reasoning.
    //   - Opus 4.7 rejects `thinking.budget_tokens` (breaking change);
    //     the block below would 400 on every call.
    //   - Sonnet 4.6 still accepts explicit budget_tokens, keeps the
    //     shared output schema, and cuts cost per call by ~67%.
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      thinking: { type: "enabled", budget_tokens: 2048 },
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
