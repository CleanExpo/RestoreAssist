/**
 * POST /api/inspections/[id]/classify — RA-1195
 *
 * AI-suggested IICRC S500:2025 Water Category + Class from an inspection's
 * moisture readings, affected-area data, and claim context.
 *
 * Returns a recommendation only — does NOT persist. The user applies it by
 * saving through the existing inspection update flow.
 *
 * Response shape:
 *   {
 *     waterCategory: "CATEGORY_1" | "CATEGORY_2" | "CATEGORY_3",
 *     waterClass:    "CLASS_1" | "CLASS_2" | "CLASS_3" | "CLASS_4",
 *     confidence:    number,   // 0-100
 *     reasoning:     string,   // short paragraph citing §5.2 / §6.3
 *     usage:         { inputTokens: number; outputTokens: number; estUsd: number }
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { getAnthropicApiKey } from "@/lib/ai-provider";
import Anthropic from "@anthropic-ai/sdk";

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"] as const;

const MODEL = "claude-haiku-4-5";
// Haiku 4.5 pricing (USD per token): $1 / M input, $5 / M output
const INPUT_COST_PER_TOKEN = 0.000001;
const OUTPUT_COST_PER_TOKEN = 0.000005;

type WaterCategory = "CATEGORY_1" | "CATEGORY_2" | "CATEGORY_3";
type WaterClass = "CLASS_1" | "CLASS_2" | "CLASS_3" | "CLASS_4";

interface ClassificationSuggestion {
  waterCategory: WaterCategory;
  waterClass: WaterClass;
  confidence: number;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are an IICRC S500:2025 certified water damage restoration assessor working in Australia. Given moisture readings and affected-area data from an inspection, suggest the correct IICRC Water Category and Class.

Apply AS-IICRC S500:2025 strictly:

WATER CATEGORY (§5.2 — Source-of-water classification):
- CATEGORY_1: Originates from a sanitary source, poses no substantial risk. Examples: broken supply line, tub/sink overflow with no contaminants, appliance malfunction involving water supply line, falling rainwater, melting ice/snow, broken toilet tanks (no additives/contaminants).
- CATEGORY_2: Contains significant contamination, has the potential to cause discomfort or sickness. Examples: discharge from dishwashers/washing machines, overflows from washing machines, broken aquariums, punctured water beds, toilet overflow with urine (no faeces), seepage due to hydrostatic pressure, Category 1 water left untreated >48 hrs or outside the §5.2 ambient conditions.
- CATEGORY_3: Grossly contaminated, can contain pathogenic/toxigenic/other harmful agents. Examples: sewage, waste line backflows originating from beyond the trap, flooding from seawater/ground surface water/rising water from rivers or streams, wind-driven rain from hurricanes/tropical storms, Category 2 water left untreated beyond 48 hrs.

WATER CLASS (§6.3 — Extent of wet materials / evaporation load):
- CLASS_1: Least amount of water, absorption and evaporation. Affects only part of a room, or larger areas containing materials that have absorbed minimal moisture (e.g. plywood, concrete).
- CLASS_2: Significant amount of water, absorption and evaporation. Affects an entire room (carpet and cushion), water has wicked up walls less than 24 inches (≈600mm), moisture remains in structural materials.
- CLASS_3: Greatest amount of water, absorption and evaporation. Water may have come from overhead — ceilings, walls, insulation, carpet, cushion and sub-floor are saturated.
- CLASS_4: Speciality drying situations — wet materials with very low permeance/porosity (hardwood, plaster, brick, concrete, stone, lightweight concrete). Deep pockets of saturation requiring very low specific humidity.

Use Australian English. Be decisive but honest about confidence — if inputs are sparse or ambiguous, lower the confidence and note what's missing.

Respond with ONLY a JSON object. No prose, no markdown fences. Schema:
{
  "waterCategory": "CATEGORY_1" | "CATEGORY_2" | "CATEGORY_3",
  "waterClass":    "CLASS_1" | "CLASS_2" | "CLASS_3" | "CLASS_4",
  "confidence":    number,   // 0-100
  "reasoning":     string    // 2-4 sentences; cite §5.2 for Category, §6.3 for Class
}`;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 20/min per user (CLAUDE.md rule 10 — key on userId).
    const limited = await applyRateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 20,
      prefix: "classify-ai",
      key: session.user.id,
    });
    if (limited) return limited;

    // Subscription gate (CLAUDE.md rule 8).
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, subscriptionStatus: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (
      !ALLOWED_SUBSCRIPTION_STATUSES.includes(
        (user.subscriptionStatus ?? "") as (typeof ALLOWED_SUBSCRIPTION_STATUSES)[number],
      )
    ) {
      return NextResponse.json(
        { error: "Active subscription required" },
        { status: 402 },
      );
    }

    const { id: inspectionId } = await context.params;

    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
      select: {
        id: true,
        propertyAddress: true,
        propertyPostcode: true,
        inspectionDate: true,
        propertyWallMaterial: true,
        propertyFloorType: true,
        propertyYearBuilt: true,
        moistureReadings: {
          select: {
            location: true,
            surfaceType: true,
            moistureLevel: true,
            depth: true,
            unit: true,
            notes: true,
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        affectedAreas: {
          select: {
            roomZoneId: true,
            affectedSquareFootage: true,
            waterSource: true,
            timeSinceLoss: true,
            description: true,
          },
          take: 20,
        },
        environmentalData: {
          select: {
            ambientTemperature: true,
            humidityLevel: true,
            dewPoint: true,
          },
          orderBy: { recordedAt: "desc" },
          take: 1,
        },
      },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    if (
      inspection.moistureReadings.length === 0 &&
      inspection.affectedAreas.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Need at least one moisture reading or affected-area entry before classifying.",
        },
        { status: 400 },
      );
    }

    // Cost-gate: user's own Anthropic key preferred, env fallback.
    let apiKey: string;
    try {
      apiKey = await getAnthropicApiKey(session.user.id);
    } catch {
      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
          {
            error:
              "Anthropic API key not configured. Add one under Settings → Integrations.",
          },
          { status: 400 },
        );
      }
      apiKey = process.env.ANTHROPIC_API_KEY;
    }

    const anthropic = new Anthropic({ apiKey });

    const userPayload = {
      property: {
        address: inspection.propertyAddress,
        postcode: inspection.propertyPostcode,
        wallMaterial: inspection.propertyWallMaterial,
        floorType: inspection.propertyFloorType,
        yearBuilt: inspection.propertyYearBuilt,
      },
      environmental: inspection.environmentalData[0] ?? null,
      moistureReadings: inspection.moistureReadings,
      affectedAreas: inspection.affectedAreas,
    };

    const userMessage = `Classify this water-damage inspection per AS-IICRC S500:2025.

Inspection data:
\`\`\`json
${JSON.stringify(userPayload, null, 2)}
\`\`\`

Return ONLY the JSON object described in your instructions.`;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "Classifier returned no text" },
        { status: 502 },
      );
    }

    const suggestion = parseSuggestion(textBlock.text);
    if (!suggestion) {
      return NextResponse.json(
        { error: "Classifier returned invalid JSON" },
        { status: 502 },
      );
    }

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const estUsd =
      inputTokens * INPUT_COST_PER_TOKEN +
      outputTokens * OUTPUT_COST_PER_TOKEN;

    // Fire-and-forget usage log — do not block the response.
    prisma.usageEvent
      .create({
        data: {
          userId: session.user.id,
          inspectionId,
          eventType: "AI_ASSISTANT_QUERY",
          eventData: JSON.stringify({
            feature: "auto_classify",
            model: MODEL,
            inputTokens,
            outputTokens,
          }),
          unitCost: OUTPUT_COST_PER_TOKEN,
          units: outputTokens,
          totalCost: estUsd,
          currency: "USD",
        },
      })
      .catch((e) => console.warn("[classify] Usage log failed:", e));

    return NextResponse.json({
      ...suggestion,
      usage: {
        inputTokens,
        outputTokens,
        estUsd: Number(estUsd.toFixed(6)),
      },
    });
  } catch (error) {
    console.error("[classify POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function parseSuggestion(raw: string): ClassificationSuggestion | null {
  // Strip common code-fence wrapping if the model added it despite instructions.
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    // Last-ditch: find the first {...} block.
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      obj = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const category = o.waterCategory;
  const cls = o.waterClass;
  const confidence = o.confidence;
  const reasoning = o.reasoning;

  const validCat = ["CATEGORY_1", "CATEGORY_2", "CATEGORY_3"] as const;
  const validCls = ["CLASS_1", "CLASS_2", "CLASS_3", "CLASS_4"] as const;

  if (
    typeof category !== "string" ||
    !validCat.includes(category as WaterCategory) ||
    typeof cls !== "string" ||
    !validCls.includes(cls as WaterClass) ||
    typeof confidence !== "number" ||
    typeof reasoning !== "string"
  ) {
    return null;
  }

  return {
    waterCategory: category as WaterCategory,
    waterClass: cls as WaterClass,
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    reasoning: reasoning.trim(),
  };
}
