/**
 * Mobile BYOK Vision Client
 *
 * Handles image capture → base64 encoding → POST to /api/ai/vision.
 * Works with both Expo Camera and the device photo library.
 *
 * The server-side provider dispatch (Claude / GPT / Gemini) is handled by
 * lib/ai/byok-vision-client.ts — this module is the mobile transport layer only.
 *
 * RA-393: Phase 0.5 — BYOK Vision Extension
 */

import type { S500VisionResult } from "@/lib/ai/byok-vision-client";

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? "https://restoreassist.app";

// ─── Request types ────────────────────────────────────────────────────────────

export type ImageMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif";

export interface MobileVisionRequest {
  /** Base64-encoded image data (WITHOUT data: URI prefix) */
  imageBase64: string;
  mimeType: ImageMimeType;
  /** Optional technician note for extra context */
  context?: string;
  /** Optional model override — defaults to user's connected provider default */
  modelOverride?:
    | "claude-opus-4-6"
    | "claude-sonnet-4-6"
    | "gemini-3.1-pro"
    | "gemini-3.1-flash"
    | "gpt-5.4"
    | "gpt-5.4-mini";
}

export interface VisionAnalysisResponse {
  data: S500VisionResult;
}

// ─── Main dispatch function ───────────────────────────────────────────────────

/**
 * Send an image to the RestoreAssist vision API for S500:2025 analysis.
 *
 * @throws when the API responds with an error (no connected provider, network
 *         failure, or analysis failure). Callers should handle gracefully.
 *
 * @example
 * ```ts
 * const result = await analysePhoto({
 *   imageBase64: base64Data,
 *   mimeType: 'image/jpeg',
 *   context: 'Master bedroom, ceiling void',
 * });
 * console.log(result.suggestedEvidenceClass); // 'DAMAGE_CLOSE_UP'
 * ```
 */
export async function analysePhoto(
  request: MobileVisionRequest,
): Promise<S500VisionResult> {
  const response = await fetch(`${API_BASE}/api/ai/vision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      (errorBody as { error?: string }).error ??
        `Vision API error: ${response.status}`,
    );
  }

  const json: VisionAnalysisResponse = await response.json();
  return json.data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip the `data:<mime>;base64,` prefix from a data URI if present.
 * Expo/RN image pickers sometimes return full data URIs.
 */
export function stripDataUriPrefix(dataUriOrBase64: string): {
  base64: string;
  mimeType: ImageMimeType;
} {
  const match = dataUriOrBase64.match(
    /^data:(image\/[a-z]+);base64,([\s\S]+)$/,
  );
  if (match) {
    return {
      mimeType: match[1] as ImageMimeType,
      base64: match[2],
    };
  }
  // Assume JPEG if no prefix
  return { mimeType: "image/jpeg", base64: dataUriOrBase64 };
}

/**
 * Convenience wrapper for Expo ImagePicker / Camera results.
 * Pass the `uri` from the picker result and optional context.
 *
 * Fetches the image as a blob, converts to base64, then calls analysePhoto.
 */
export async function analysePhotoFromUri(
  uri: string,
  context?: string,
  modelOverride?: MobileVisionRequest["modelOverride"],
): Promise<S500VisionResult> {
  const response = await fetch(uri);
  const blob = await response.blob();

  return new Promise<S500VisionResult>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUri = reader.result as string;
        const { base64, mimeType } = stripDataUriPrefix(dataUri);
        const result = await analysePhoto({
          imageBase64: base64,
          mimeType,
          context,
          modelOverride,
        });
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(blob);
  });
}
