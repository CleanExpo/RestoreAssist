/**
 * Inspection IICRC Category & Class classifier.
 *
 * Composes lib/services/ai/anthropic-gateway.ts (platform-key flow) with the
 * S500:2021-aware classify prompt + tolerant JSON parser. Action layer
 * (app/api/inspections/[id]/classify/route.ts) maps result.reason to HTTP.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { callAnthropic } from "./anthropic-gateway";
import type { AnthropicReason } from "./anthropic-gateway";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";

const SYSTEM_PROMPT = `You are an IICRC-certified water damage assessor operating under the Australian/New Zealand adoption of ANSI/IICRC S500:2021 (Standard for Professional Water Damage Restoration, 5th edition).

Your task: given an inspection's moisture readings and affected areas, recommend a Water Category and Class of water intrusion. Output a single JSON object — no prose, no code fences.

Schema (strict):
{
  "waterCategory": "CATEGORY_1" | "CATEGORY_2" | "CATEGORY_3",
  "waterClass":    "CLASS_1" | "CLASS_2" | "CLASS_3" | "CLASS_4",
  "confidence":    integer 0-100,
  "reasoning":     string
}

Category definitions — cite S500:2021 §10.5.4 in your reasoning:
- CATEGORY_1: "Clean water" — originates from a sanitary source (e.g. supply line, melted ice, rainwater without contamination). S500:2021 §10.5.4.1.
- CATEGORY_2: "Significantly contaminated water" ("grey water") — contains significant contamination with potential to cause discomfort or sickness (e.g. dishwasher/washing-machine overflow, aquarium rupture, toilet overflow of urine only). S500:2021 §10.5.4.2.
- CATEGORY_3: "Grossly contaminated water" ("black water") — contains pathogenic, toxigenic or otherwise harmful agents (e.g. sewage, rising ground/surface water, seawater intrusion, wind-driven rain from hurricanes, any Cat 1 or 2 that has remained stagnant >72 hours or has contacted building materials that may contribute contamination). S500:2021 §10.5.4.3.

Class definitions — cite S500:2021 §10.5.5 in your reasoning. Class depends on the rate of evaporation (wetted surface area, porosity of materials, amount of water absorbed):
- CLASS_1: Least amount of water absorbed. Only a portion of a room or area is affected; wet materials are low-porosity (e.g. plywood, concrete, structural wood). Minimal moisture has been absorbed. S500:2021 §10.5.5.1.
- CLASS_2: Large amount of water absorbed. Entire room affected: carpet and cushion, wet up to 24 inches (~600 mm) up walls; moisture has wicked into structural materials. S500:2021 §10.5.5.2.
- CLASS_3: Greatest amount of water absorbed. Water has typically come from overhead: ceilings, walls, insulation, carpet, cushion and sub-floor are saturated. S500:2021 §10.5.5.3.
- CLASS_4: Specialty drying situations. Wet materials with very low porosity / deep pockets of saturation (hardwood, plaster, brick, concrete, stone, crawlspace). Requires longer drying times and special methods. S500:2021 §10.5.5.4.

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
- Cite the exact S500:2021 section (e.g. "S500:2021 §10.5.4.2") supporting the chosen category AND the chosen class.
- State which readings / areas drove the decision.

Return ONLY the JSON object.`;

export type ClassifyReason = AnthropicReason | "PARSE_FAILED";

export interface ClassifyPayload {
  inspectionNumber: string;
  propertyPostcode: string | null;
  moistureReadings: Array<Record<string, unknown>>;
  affectedAreas: Array<Record<string, unknown>>;
}

export interface ClassifyResult {
  waterCategory: "CATEGORY_1" | "CATEGORY_2" | "CATEGORY_3";
  waterClass: "CLASS_1" | "CLASS_2" | "CLASS_3" | "CLASS_4";
  confidence: number;
  reasoning: string;
}

export async function classifyInspection(args: {
  userId: string;
  /**
   * RA-6963 (BYOK, P1) — the calling workspace's own Anthropic key, resolved by
   * the classify route via resolveWorkspaceAiKey and passed through as the
   * gateway override so this customer workload never spends the platform
   * ANTHROPIC_API_KEY.
   */
  apiKey: string;
  payload: ClassifyPayload;
}): Promise<ServiceResult<ClassifyResult, ClassifyReason>> {
  const gatewayResult = await callAnthropic({
    userId: args.userId,
    apiKey: args.apiKey,
    request: {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Classify the following inspection per S500:2021. Return only the JSON object described in the system prompt.\n\n${JSON.stringify(args.payload, null, 2)}`,
        },
      ],
    },
  });

  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  const textBlock = gatewayResult.data.content.find((b) => b.type === "text");
  const raw =
    textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

  // Tolerant parse: strip ```json fences if the model added them.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as ClassifyResult;
    return ok(parsed);
  } catch (err) {
    return fail("PARSE_FAILED", {
      detail: `Model output was not valid JSON: ${raw.slice(0, 200)}`,
      cause: err,
    });
  }
}
