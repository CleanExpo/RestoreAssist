/**
 * RA-1195 — AI Auto-classify IICRC Category & Class
 *
 * POST /api/inspections/[id]/classify
 *
 * Reads the inspection's moisture readings and affected-area data, sends them
 * to Claude Haiku with an S500:2025-aware prompt, and returns a *suggestion*:
 *
 *   { waterCategory: "CATEGORY_1"|"CATEGORY_2"|"CATEGORY_3",
 *     waterClass:    "CLASS_1"|"CLASS_2"|"CLASS_3"|"CLASS_4",
 *     confidence:    0-100,
 *     reasoning:     string (cites S500:2025 sections) }
 *
 * The endpoint does NOT persist anything. The user reviews the preview and
 * applies via the existing inspection update flow.
 *
 * Gates:
 *   - getServerSession (CLAUDE.md rule 1)
 *   - Subscription allowlist TRIAL/ACTIVE/LIFETIME (rule 8)
 *   - Rate-limit 20/min keyed on session.user.id (rule 10)
 *   - Anthropic key via getAnthropicApiKey(userId) with env fallback
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/ai-provider";
import { applyRateLimit } from "@/lib/rate-limiter";

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];

const SYSTEM_PROMPT = `You are an IICRC-certified water damage assessor operating under the Australian/New Zealand adoption of ANSI/IICRC S500:2025 (Standard for Professional Water Damage Restoration, 5th edition).

Your task: given an inspection's moisture readings and affected areas, recommend a Water Category and Class of water intrusion. Output a single JSON object — no prose, no code fences.

Schema (strict):
{
  "waterCategory": "CATEGORY_1" | "CATEGORY_2" | "CATEGORY_3",
  "waterClass":    "CLASS_1" | "CLASS_2" | "CLASS_3" | "CLASS_4",
  "confidence":    integer 0-100,
  "reasoning":     string
}

Category definitions — cite S500:2025 §10.5.4 in your reasoning:
- CATEGORY_1: "Clean water" — originates from a sanitary source (e.g. supply line, melted ice, rainwater without contamination). S500:2025 §10.5.4.1.
- CATEGORY_2: "Significantly contaminated water" ("grey water") — contains significant contamination with potential to cause discomfort or sickness (e.g. dishwasher/washing-machine overflow, aquarium rupture, toilet overflow of urine only). S500:2025 §10.5.4.2.
- CATEGORY_3: "Grossly contaminated water" ("black water") — contains pathogenic, toxigenic or otherwise harmful agents (e.g. sewage, rising ground/surface water, seawater intrusion, wind-driven rain from hurricanes, any Cat 1 or 2 that has remained stagnant >72 hours or has contacted building materials that may contribute contamination). S500:2025 §10.5.4.3.

Class definitions — cite S500:2025 §10.5.5 in your reasoning. Class depends on the rate of evaporation (wetted surface area, porosity of materials, amount of water absorbed):
- CLASS_1: Least amount of water absorbed. Only a portion of a room or area is affected; wet materials are low-porosity (e.g. plywood, concrete, structural wood). Minimal moisture has been absorbed. S500:2025 §10.5.5.1.
- CLASS_2: Large amount of water absorbed. Entire room affected: carpet and cushion, wet up to 24 inches (~600 mm) up walls; moisture has wicked into structural materials. S500:2025 §10.5.5.2.
- CLASS_3: Greatest amount of water absorbed. Water has typically come from overhead: ceilings, walls, insulation, carpet, cushion and sub-floor are saturated. S500:2025 §10.5.5.3.
- CLASS_4: Specialty drying situations. Wet materials with very low porosity / deep pockets of saturation (hardwood, plaster, brick, concrete, stone, crawlspace). Requires longer drying times and special methods. S500:2025 §10.5.5.4.

Heuristics when classifying:
1. If any affected area records a water source of "sewage", "black", "ground", "flood", or "seawater" → CATEGORY_3.
2. If water source is "grey", "dishwasher", "washing machine", "appliance discharge" → CATEGORY_2.
3. If water source is "clean", "supply", "rainwater" AND hours-since-loss < 72 → CATEGORY_1; if >=72h AND contacted porous materials → escalate to CATEGORY_2.
4. Class escalates with total wetted square metres, number of surfaces affected, and presence of low-porosity materials (concrete, hardwood, plaster, brick).
5. Deeply saturated hardwood/plaster/brick/concrete → CLASS_4 regardless of area size.

Confidence scoring:
- 85-100: readings and areas give clear, consistent signal
- 65-84:  signal is mostly clear but one or two data gaps
- 40-64:  significant data missing; best-effort inference
- <40:    insufficient data — still classify but flag in reasoning

Reasoning field MUST:
- Be 2-4 sentences, plain English, Australian spelling ("metres", "colour", "organisation").
- Cite the exact S500:2025 section (e.g. "S500:2025 §10.5.4.2") supporting the chosen category AND the chosen class.
- State which readings / areas drove the decision.

Return ONLY the JSON object.`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(req, {
    windowMs: 60 * 1000,
    maxRequests: 20,
    prefix: "ai-classify",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  const { id } = await params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, subscriptionStatus: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (
      !ALLOWED_SUBSCRIPTION_STATUSES.includes(user.subscriptionStatus ?? "")
    ) {
      return NextResponse.json(
        { error: "Active subscription required" },
        { status: 402 },
      );
    }

    const inspection = await prisma.inspection.findUnique({
      where: { id, userId },
      select: {
        id: true,
        inspectionNumber: true,
        propertyAddress: true,
        propertyPostcode: true,
        moistureReadings: {
          take: 200,
          select: {
            location: true,
            surfaceType: true,
            moistureLevel: true,
            depth: true,
            unit: true,
            notes: true,
          },
        },
        affectedAreas: {
          take: 100,
          select: {
            roomZoneId: true,
            affectedSquareFootage: true,
            waterSource: true,
            timeSinceLoss: true,
            description: true,
          },
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
            "No moisture readings or affected areas recorded — add data before requesting a classification.",
        },
        { status: 400 },
      );
    }

    let anthropicApiKey: string;
    try {
      anthropicApiKey = await getAnthropicApiKey(userId);
    } catch {
      return NextResponse.json(
        { error: "Failed to get Anthropic API key" },
        { status: 400 },
      );
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const userPayload = {
      inspectionNumber: inspection.inspectionNumber,
      propertyPostcode: inspection.propertyPostcode,
      moistureReadings: inspection.moistureReadings,
      affectedAreas: inspection.affectedAreas,
    };

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Classify the following inspection per S500:2025. Return only the JSON object described in the system prompt.\n\n${JSON.stringify(userPayload, null, 2)}`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const raw =
      textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

    // Tolerant parse: strip code fences if model added them.
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsed: {
      waterCategory: string;
      waterClass: string;
      confidence: number;
      reasoning: string;
    };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("RA-1195 classify: failed to parse model output", raw);
      return NextResponse.json(
        { error: "Could not parse classification response" },
        { status: 502 },
      );
    }

    const validCats = ["CATEGORY_1", "CATEGORY_2", "CATEGORY_3"];
    const validClasses = ["CLASS_1", "CLASS_2", "CLASS_3", "CLASS_4"];
    if (
      !validCats.includes(parsed.waterCategory) ||
      !validClasses.includes(parsed.waterClass) ||
      typeof parsed.confidence !== "number" ||
      typeof parsed.reasoning !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid classification shape from model" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      waterCategory: parsed.waterCategory,
      waterClass: parsed.waterClass,
      confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence))),
      reasoning: parsed.reasoning,
      inputSummary: {
        moistureReadings: inspection.moistureReadings.length,
        affectedAreas: inspection.affectedAreas.length,
      },
    });
  } catch (err) {
    // RA-786: never leak error.message
    console.error("RA-1195 classify error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
