/**
 * Hand-drawn sketch → polygon rooms (Claude Vision).
 *
 * Composes lib/services/ai/anthropic-gateway.ts (platform-key flow) with the
 * sketch-import prompt. Returns parsed rooms plus Anthropic token usage so
 * the action layer can run its workspace-budget logging
 * (lib/usage/log-usage.ts) without re-deriving counts.
 *
 * Action layer (app/api/inspections/[id]/sketches/import-from-image/route.ts)
 * maps result.reason to HTTP status codes; the route handles vertex
 * validation (>=3 vertices, x/y in [0,1]) since that's request-shape, not
 * AI-shape.
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

const SYSTEM_PROMPT = `You are analyzing a hand-drawn floor-plan sketch photo.

Extract each distinct room or zone from the sketch and return their approximate outlines as polygon vertices.

Rules:
- Return ONLY valid JSON — no prose, no markdown fences, no explanation.
- Vertices must be in NORMALIZED coordinates: x and y each in [0.0, 1.0] relative to the image width and height.
- Include at least 3 vertices per room (rectangles need 4).
- If the sketch is unclear, return your best estimate — do not refuse.
- Label each room with the text written inside it, or a generic label like "Room 1" if unlabelled.

Output schema (JSON only):
{
  "rooms": [
    {
      "label": "Living Room",
      "vertices": [
        { "x": 0.05, "y": 0.05 },
        { "x": 0.45, "y": 0.05 },
        { "x": 0.45, "y": 0.50 },
        { "x": 0.05, "y": 0.50 }
      ]
    }
  ]
}`;

export type ImportSketchReason = AnthropicReason | "PARSE_FAILED";

export interface SketchRoom {
  label: string;
  vertices: { x: number; y: number }[];
}

export interface ImportSketchResult {
  rooms: SketchRoom[];
  usage: { inputTokens: number; outputTokens: number };
}

export async function importSketchFromImage(args: {
  apiKey: string;
  base64Image: string;
  mediaType: "image/jpeg" | "image/png";
}): Promise<ServiceResult<ImportSketchResult, ImportSketchReason>> {
  const gatewayResult = await callAnthropic({
    userId: "system",
    apiKey: args.apiKey,
    request: {
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: args.mediaType,
                data: args.base64Image,
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

  const usage = {
    inputTokens: gatewayResult.data.usage?.input_tokens ?? 0,
    outputTokens: gatewayResult.data.usage?.output_tokens ?? 0,
  };

  const raw = gatewayResult.data.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  const cleaned = raw
    .replace(/^```[a-z]*\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as { rooms?: SketchRoom[] };
    return ok({ rooms: parsed.rooms ?? [], usage });
  } catch (err) {
    return fail("PARSE_FAILED", {
      detail: `Model output was not valid JSON: ${raw.slice(0, 200)}`,
      cause: err,
    });
  }
}
