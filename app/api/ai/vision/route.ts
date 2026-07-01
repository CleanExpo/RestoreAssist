/**
 * POST /api/ai/vision
 *
 * Analyse a base64-encoded image using the authenticated user's BYOK AI provider.
 * Returns IICRC S500:2021-structured damage assessment that populates inspection fields.
 *
 * Auth: getServerSession required — no anonymous access.
 * Provider: whichever of Claude / GPT / Gemini the user has connected via BYOK.
 *
 * Subscription gate: intentionally absent — this is a BYOK-only route. The user
 * supplies their own API key via Integrations; no platform credits are consumed.
 * Calls will fail at analyseImageWithBYOK() if no key is configured.
 *
 * RA-393: Phase 0.5 — BYOK Vision Extension
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  analyseImageWithBYOK,
  type VisionAnalysisRequest,
} from "@/lib/ai/byok-vision-client";
import { z } from "zod";
import { withIdempotency } from "@/lib/idempotency";
import { apiError } from "@/lib/api-errors";

const VISION_PROVIDER_CONFIGURATION_ERROR = "Vision provider is not configured";

// ─── Request validation ───────────────────────────────────────────────────────

const VisionRequestSchema = z.object({
  imageBase64: z.string().min(1, "imageBase64 is required"),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  context: z.string().max(500).optional(),
  modelOverride: z
    .enum([
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "gemini-3.1-pro",
      "gemini-3.1-flash",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gemma-4-31b-it",
    ])
    .optional(),
});

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorised",
      status: 401,
    });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 20,
    prefix: "ai-vision",
    key: userId,
    failClosedOnUpstashError: true,
  });
  if (rateLimited) return rateLimited;

  // RA-1266: BYOK vision calls are expensive on the user's provider —
  // retry without idempotency doubles the image-analysis bill for the
  // same input.
  return withIdempotency(request, userId, async (rawBody) => {
    let body: unknown;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    const parsed = VisionRequestSchema.safeParse(body);
    if (!parsed.success) {
      // RA-1548 — left raw: rich 422 with `details` sibling (zod flatten()).
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const visionRequest: VisionAnalysisRequest = {
      ...parsed.data,
      userId,
    };

    try {
      const result = await analyseImageWithBYOK(visionRequest);
      return NextResponse.json({ data: result });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Vision analysis failed";

      if (message.includes("No AI provider") || message.includes("API key")) {
        // RA-1548 — left raw: BYOK provider-config 402; __tests__ pin the flat
        // {error:"Vision provider is not configured"} shape.
        console.error("[vision] Provider configuration error:", error);
        return NextResponse.json(
          { error: VISION_PROVIDER_CONFIGURATION_ERROR },
          { status: 402 },
        );
      }

      return apiError(request, {
        code: "INTERNAL",
        message: "Analysis failed",
        status: 500,
        err: error,
        stage: "vision",
      });
    }
  });
}
