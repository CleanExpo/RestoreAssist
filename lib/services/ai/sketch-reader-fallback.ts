/**
 * RA-8232 — abliteration.ai as the BACKUP floor plan image reader.
 *
 * The primary reader is the workspace's own Anthropic key (RA-6921). When that
 * read fails for an availability or output reason, the same image and prompt
 * go to abliteration.ai through its Anthropic Messages-compatible endpoint, so
 * the existing gateway, error mapping and JSON parsing are reused unchanged.
 *
 * OFF by default. The backup runs only when BOTH are set on the server:
 *   SKETCH_IMPORT_ABLITERATION_FALLBACK = 1 | true | on
 *   ABLITERATION_API_KEY               = a platform key (owner-held, rule 30)
 *
 * The backup is platform-paid: it spends the platform's abliteration.ai credit,
 * not the workspace's key. It is never used for KEY_MISSING (that would make it
 * a free primary for every workspace without its own key) or KEY_INVALID (that
 * would hide a broken workspace key from its owner).
 *
 * Vendor facts, read from the vendor's own pages on 07/11/2026:
 *   - base URL https://api.abliteration.ai with the Anthropic SDK; the SDK's
 *     x-api-key header is accepted (abliteration.ai/docs/anthropic-messages-api)
 *   - /v1/messages accepts base64 image blocks; PNG/JPEG/WebP/GIF, 12 MB raw,
 *     4 images per request (docs.abliteration.ai/capabilities/images.md)
 *   - abliterated-model-large-flash: text and image input, USD 1.00 per
 *     million input tokens, USD 2.00 per million output (abliteration.ai/pricing)
 *   - zero data retention on /v1/messages (abliteration.ai/data-handling)
 * Re-check these before changing the model or the price below.
 */

import type { ImportSketchReason } from "./import-sketch-from-image";

export const ABLITERATION_BASE_URL = "https://api.abliteration.ai";
export const ABLITERATION_VISION_MODEL = "abliterated-model-large-flash";

const INPUT_USD_PER_MILLION = 1.0;
const OUTPUT_USD_PER_MILLION = 2.0;

/** Primary-reader failures that the backup may retry. Key problems are excluded. */
export const BACKUP_ELIGIBLE_REASONS: ReadonlySet<ImportSketchReason> =
  new Set<ImportSketchReason>([
    "RATE_LIMITED",
    "MODEL_OVERLOADED",
    "API_ERROR",
    "PARSE_FAILED",
  ]);

export interface SketchReaderFallback {
  apiKey: string;
}

/**
 * Returns the backup reader config, or null when the backup is off. Only an
 * explicit truthy flag AND a non-blank key turn it on.
 */
export function resolveSketchReaderFallback(
  env: Record<string, string | undefined> = process.env,
): SketchReaderFallback | null {
  const flag = (env.SKETCH_IMPORT_ABLITERATION_FALLBACK ?? "")
    .trim()
    .toLowerCase();
  if (flag !== "1" && flag !== "true" && flag !== "on") return null;
  const apiKey = (env.ABLITERATION_API_KEY ?? "").trim();
  return apiKey ? { apiKey } : null;
}

/**
 * USD estimate for one backup read. Kept here, not in lib/usage/log-usage.ts,
 * because AiUsageLog.provider is a Prisma enum with no ABLITERATION value; the
 * route writes this to the server log instead of the usage table.
 */
export function estimateAbliterationCostUsd(
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens / 1_000_000) * INPUT_USD_PER_MILLION +
    (outputTokens / 1_000_000) * OUTPUT_USD_PER_MILLION
  );
}
