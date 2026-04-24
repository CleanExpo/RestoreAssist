/**
 * RA-1494 — Margot image generation helper (v2 inc3).
 *
 * Calls Gemini "Nano Banana 2" (gemini-3.1-flash-image-preview) to generate
 * an image, uploads the bytes to Supabase Storage bucket `margot-generations`,
 * and returns a public URL. Kept as a pure helper so the Margot chat route
 * can wrap it with a `tool(...)` definition.
 */

import { createHash } from "crypto";
import { GoogleGenAI } from "@google/genai";
import { getSupabaseServerClient } from "./supabase-server";

const BUCKET = "margot-generations";
const MODEL = "gemini-3.1-flash-image-preview";

// Approx per-image cost (USD) by output size tier. Source: Gemini API pricing
// for Nano Banana 2 (Jan 2026).
const COST_BY_SIZE: Record<ImageSize, number> = {
  "1K": 0.045,
  "2K": 0.067,
  "4K": 0.151,
};

export type AspectRatio = "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
export type ImageSize = "1K" | "2K" | "4K";

export interface ImageGenInput {
  prompt: string;
  aspect_ratio?: AspectRatio;
  image_size?: ImageSize;
  reference_image_url?: string;
}

export interface ImageGenSuccess {
  image_url: string;
  prompt: string;
  model: string;
  aspect_ratio: AspectRatio;
  image_size: ImageSize;
  cost_usd_approx: number;
}

export interface ImageGenError {
  error: string;
  retryable: boolean;
}

export type ImageGenResult = ImageGenSuccess | ImageGenError;

async function ensureBucket(): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.storage.getBucket(BUCKET);
  if (data) return;
  // getBucket returns an error when the bucket does not exist — try to create.
  if (error) {
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
      public: true,
    });
    if (createErr && !/already exists/i.test(createErr.message)) {
      throw new Error(`createBucket failed: ${createErr.message}`);
    }
  }
}

async function fetchReferenceBytes(url: string): Promise<{
  bytes: Uint8Array;
  mimeType: string;
}> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `reference_image_url fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  const mimeType = res.headers.get("content-type") ?? "image/png";
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, mimeType };
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * Generate an image via Nano Banana 2 and upload to Supabase Storage.
 * Never throws — caller receives either success or { error, retryable }.
 */
export async function generateAndStoreImage(
  input: ImageGenInput,
): Promise<ImageGenResult> {
  const aspect_ratio: AspectRatio = input.aspect_ratio ?? "16:9";
  const image_size: ImageSize = input.image_size ?? "1K";

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        error: "image_generate failed: GEMINI_API_KEY not configured",
        retryable: false,
      };
    }
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return {
        error:
          "image_generate failed: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured",
        retryable: false,
      };
    }

    const ai = new GoogleGenAI({ apiKey });

    // Build contents array. If reference image given, include it as an
    // inlineData part alongside the prompt.
    type Part = { text?: string; inlineData?: { data: string; mimeType: string } };
    const parts: Part[] = [{ text: input.prompt }];
    if (input.reference_image_url) {
      const ref = await fetchReferenceBytes(input.reference_image_url);
      parts.push({
        inlineData: {
          data: toBase64(ref.bytes),
          mimeType: ref.mimeType,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: aspect_ratio, imageSize: image_size },
      },
    } as Parameters<typeof ai.models.generateContent>[0]);

    // Extract first inline_data part.
    const candidates = (
      response as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              inlineData?: { data?: string; mimeType?: string };
            }>;
          };
        }>;
      }
    ).candidates;
    const imgPart = candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData?.data,
    );
    const b64 = imgPart?.inlineData?.data;
    const mimeType = imgPart?.inlineData?.mimeType ?? "image/png";

    if (!b64) {
      return {
        error: "image_generate failed: no image bytes in Gemini response",
        retryable: true,
      };
    }

    const imageBytes = Buffer.from(b64, "base64");

    // Upload to Supabase Storage.
    await ensureBucket();
    const supabase = getSupabaseServerClient();
    const shaShort = createHash("sha256")
      .update(imageBytes)
      .digest("hex")
      .slice(0, 10);
    const filename = `gen-${Date.now()}-${shaShort}.png`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(filename, imageBytes, {
        contentType: mimeType,
        upsert: false,
      });
    if (uploadErr) {
      return {
        error: `image_generate upload failed: ${uploadErr.message}`,
        retryable: true,
      };
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(filename);

    return {
      image_url: urlData.publicUrl,
      prompt: input.prompt,
      model: MODEL,
      aspect_ratio,
      image_size,
      cost_usd_approx: COST_BY_SIZE[image_size],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const retryable =
      /rate|quota|timeout|network|ECONN|5\d\d|unavailable/i.test(msg);
    return { error: `image_generate failed: ${msg}`, retryable };
  }
}
