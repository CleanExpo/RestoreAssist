/**
 * Inspection-photo auto-classifier (Claude Vision).
 *
 * Composes lib/services/ai/anthropic-gateway.ts (platform-key flow) with the
 * S500:2021-aware photo classification prompt + Australian water-damage
 * vernacular. Action layer (app/api/ai/auto-classify-photo/[photoId]) handles
 * the InspectionPhoto DB write and maps result.reason to HTTP status codes.
 *
 * Reasons:
 *  - <AnthropicReason>  — bubbled from the gateway
 *  - PARSE_FAILED       — model output was not valid JSON
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { callAnthropic } from "./anthropic-gateway";
import type { AnthropicReason } from "./anthropic-gateway";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";

const SYSTEM_PROMPT = `You are inspecting a water damage photo for an Australian restoration report.
Apply IICRC S500:2021 categorisation and return JSON ONLY.

Fields to populate (null when the photo doesn't support a confident answer):
- damageCategory: "CAT_1" | "CAT_2" | "CAT_3"
- damageClass:    "CLASS_1" | "CLASS_2" | "CLASS_3" | "CLASS_4"
- roomType:       "KITCHEN" | "BATHROOM" | "LAUNDRY" | "LOUNGE" | "BEDROOM" | "ENSUITE" | "HALLWAY" | "GARAGE" | "OTHER"
- moistureSource: "FLEXI_HOSE" | "PIPE_BURST" | "ROOF_LEAK" | "APPLIANCE" | "FLOOD" | "SEWAGE" | "UNKNOWN"
- affectedMaterial: array of any of "CARPET" | "UNDERLAY" | "PLASTER" | "GYPROCK" | "TIMBER_FLOOR" | "TILE" | "VINYL" | "CONCRETE" | "INSULATION" | "CABINETRY"
- surfaceOrientation: "FLOOR" | "WALL_LOWER" | "WALL_UPPER" | "CEILING" | "DOOR" | "WINDOW"
- damageExtentEstimate: "SPOT" | "PARTIAL" | "MAJORITY" | "FULL" | "UNCERTAIN"
- equipmentVisible: true | false
- secondaryDamageIndicators: array of "MOULD_VISIBLE" | "EFFLORESCENCE" | "STAINING" | "SWELLING" | "ASBESTOS_SUSPECT"
- photoStage: "PRE_WORK" | "DURING_WORK" | "MONITORING" | "POST_WORK" | "REINSTATEMENT"
- captureAngle: "STRAIGHT_ON" | "OBLIQUE" | "OVERHEAD" | "MACRO" | "WIDE"

Use Australian English ("mould" not "mold", "lounge" not "living room", "laundry" not "utility").
If ASBESTOS_SUSPECT, include it — the UI triggers a stop-work modal.

Return ONLY the JSON object, no prose, no markdown fences.
Also include at the end: "confidence": 0-1 float expressing overall certainty.`;

export type AutoClassifyPhotoReason = AnthropicReason | "PARSE_FAILED";

export interface AutoClassifyPhotoResult {
  /** Label payload (confidence already stripped — that lives in its own column). */
  labels: Record<string, unknown>;
  /** Overall certainty 0-1, or null if the model returned an out-of-range value. */
  confidence: number | null;
  /** Model identifier used for the call — handy for InspectionPhoto.aiModel. */
  model: string;
}

const MODEL = "claude-sonnet-4-5";

export async function autoClassifyPhoto(args: {
  apiKey: string;
  imageUrl: string;
}): Promise<ServiceResult<AutoClassifyPhotoResult, AutoClassifyPhotoReason>> {
  const gatewayResult = await callAnthropic({
    userId: "system",
    apiKey: args.apiKey,
    request: {
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "url",
                url: args.imageUrl,
              },
            },
            { type: "text", text: SYSTEM_PROMPT },
          ],
        },
      ],
    },
  });

  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  const textBlock = gatewayResult.data.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const trimmed = raw.trim().replace(/^```json\s*|\s*```$/g, "");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return fail("PARSE_FAILED", {
      detail: `Model output was not valid JSON: ${trimmed.slice(0, 200)}`,
      cause: err,
    });
  }

  const confidenceRaw = parsed["confidence"];
  const confidence =
    typeof confidenceRaw === "number" &&
    confidenceRaw >= 0 &&
    confidenceRaw <= 1
      ? confidenceRaw
      : null;

  const labels = { ...parsed };
  delete (labels as { confidence?: unknown }).confidence;

  return ok({ labels, confidence, model: MODEL });
}
