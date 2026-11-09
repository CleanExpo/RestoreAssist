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
 *  - PARSE_FAILED       — model output was not valid JSON (or was JSON null)
 *
 * RA-8235: whatever either reader returns is validated by
 * validateSketchReaderOutput (lib/sketch/validate-ai-sketch-output.ts) before
 * any caller sees it. A read that worked but gave nothing usable is still
 * `ok`, with `data.outcome` saying no_plan / invalid and offering the
 * manual-drawing fallback, so the token usage is still returned for logging.
 * `data.rooms` holds only validated proposals, each tagged ai_suggested.
 *
 * RA-8232: an optional, flag-gated abliteration.ai backup reader retries
 * availability and output failures. See ./sketch-reader-fallback.ts.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { callAnthropic } from "./anthropic-gateway";
import type { AnthropicReason } from "./anthropic-gateway";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";
import {
  ABLITERATION_BASE_URL,
  ABLITERATION_VISION_MODEL,
  BACKUP_ELIGIBLE_REASONS,
  type SketchReaderFallback,
} from "./sketch-reader-fallback";
import {
  validateSketchReaderOutput,
  type SketchReaderOutcome,
} from "@/lib/sketch/validate-ai-sketch-output";

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

/** RA-8236: recorded with each reference read so results stay traceable. */
export const SKETCH_READER_PROMPT_VERSION = "2026-11-08-reference-plan-1";

/** RA-8236: stored references carry the server's baked watermark. */
const REFERENCE_PLAN_NOTE = `

This image is page 1 of an uploaded floor plan, not a photo of a sketch. Faint diagonal "REFERENCE ONLY" text repeats across it. Ignore that text: it is a watermark, never a room label or a wall.`;

/** Where the image came from, when that changes how it should be read. */
export type SketchSourceContext = "reference_plan";

export type ImportSketchReason = AnthropicReason | "PARSE_FAILED";

export interface SketchRoom {
  label: string;
  vertices: { x: number; y: number }[];
}

const PRIMARY_VISION_MODEL = "claude-sonnet-4-6";

export interface ImportSketchResult {
  /**
   * Validated proposals only (same array as `outcome.proposals`). Every room
   * is tagged ai_suggested and carries no area: billing uses server
   * measurement only (RA-8233). Typed as SketchRoom[] so existing callers
   * keep compiling; the runtime objects are AiSuggestedRoomProposal.
   */
  rooms: SketchRoom[];
  /** RA-8235: validation outcome, incl. no_plan / invalid and the manual-drawing fallback flag. */
  outcome: SketchReaderOutcome;
  usage: { inputTokens: number; outputTokens: number };
  /** Which reader produced these rooms (RA-8232). */
  reader: { vendor: "anthropic" | "abliteration"; model: string };
  /** Set only when the backup reader was used: why the primary read failed. */
  primaryFailure?: { reason: ImportSketchReason; detail?: string };
}

/**
 * Reads the sketch with the workspace's Anthropic key. When `fallback` is
 * given (RA-8232, see ./sketch-reader-fallback.ts) and the primary read fails
 * for a backup-eligible reason, the same image and prompt go to the
 * abliteration.ai backup. If the backup also fails, the PRIMARY failure is
 * returned so the route's status codes and retry hints do not change.
 */
export async function importSketchFromImage(args: {
  apiKey: string;
  base64Image: string;
  mediaType: "image/jpeg" | "image/png";
  fallback?: SketchReaderFallback | null;
  sourceContext?: SketchSourceContext;
  /** RA-8236: one paid attempt that must finish inside this many milliseconds. */
  timeoutMs?: number;
}): Promise<ServiceResult<ImportSketchResult, ImportSketchReason>> {
  const primary = await readSketch({
    apiKey: args.apiKey,
    model: PRIMARY_VISION_MODEL,
    base64Image: args.base64Image,
    mediaType: args.mediaType,
    sourceContext: args.sourceContext,
    timeoutMs: args.timeoutMs,
  });
  if (primary.ok) {
    return ok({
      ...primary.data,
      reader: { vendor: "anthropic", model: PRIMARY_VISION_MODEL },
    });
  }
  if (!args.fallback || !BACKUP_ELIGIBLE_REASONS.has(primary.reason)) {
    return primary;
  }

  const backup = await readSketch({
    apiKey: args.fallback.apiKey,
    baseURL: ABLITERATION_BASE_URL,
    model: ABLITERATION_VISION_MODEL,
    base64Image: args.base64Image,
    mediaType: args.mediaType,
    sourceContext: args.sourceContext,
  });
  if (backup.ok) {
    return ok({
      ...backup.data,
      reader: { vendor: "abliteration", model: ABLITERATION_VISION_MODEL },
      primaryFailure: { reason: primary.reason, detail: primary.detail },
    });
  }
  return fail(primary.reason, {
    detail: `${primary.detail ?? primary.reason}; backup reader (abliteration) failed: ${backup.reason}${backup.detail ? ` (${backup.detail})` : ""}`,
    retryAfterMs: primary.retryAfterMs,
    cause: primary.cause,
  });
}

async function readSketch(args: {
  apiKey: string;
  baseURL?: string;
  model: string;
  base64Image: string;
  mediaType: "image/jpeg" | "image/png";
  sourceContext?: SketchSourceContext;
  timeoutMs?: number;
}): Promise<
  ServiceResult<Pick<ImportSketchResult, "rooms" | "outcome" | "usage">, ImportSketchReason>
> {
  const gatewayResult = await callAnthropic({
    userId: "system",
    apiKey: args.apiKey,
    ...(args.baseURL ? { baseURL: args.baseURL } : {}),
    ...(args.timeoutMs
      ? { requestOptions: { timeout: args.timeoutMs, maxRetries: 0 } }
      : {}),
    request: {
      model: args.model,
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
            {
              type: "text",
              text:
                args.sourceContext === "reference_plan"
                  ? `${SYSTEM_PROMPT}${REFERENCE_PLAN_NOTE}`
                  : SYSTEM_PROMPT,
            },
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return fail("PARSE_FAILED", {
      detail: `Model output was not valid JSON: ${raw.slice(0, 200)}`,
      cause: err,
    });
  }
  // JSON null has always been a parse failure here (it used to throw on
  // `.rooms`), which makes it backup-eligible. Keep that, so RA-8232's choice
  // of when the backup runs does not change.
  if (parsed === null) {
    return fail("PARSE_FAILED", {
      detail: `Model output was JSON null: ${raw.slice(0, 200)}`,
    });
  }

  // RA-8235: one validator for the output of BOTH readers.
  const outcome = validateSketchReaderOutput(parsed);
  return ok({ rooms: outcome.proposals, outcome, usage });
}
