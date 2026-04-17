/**
 * POST /api/ai/vision
 *
 * Analyse a base64-encoded image using the authenticated user's BYOK AI provider.
 * Returns IICRC S500:2025-structured damage assessment that populates inspection fields.
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
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // RA-1263: rate-limit BYOK vision calls. Even though the user is billed
  // directly by their provider, a compromised session (e.g. XSS or token
  // leak) could loop-call and exhaust their BYOK key. CLAUDE.md rule 10 —
  // key on session.user.id, not IP.
  const rateLimited = await applyRateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 20,
    prefix: "ai-vision",
    key: session.user.id,
  });
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = VisionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const visionRequest: VisionAnalysisRequest = {
    ...parsed.data,
    userId: session.user.id,
  };

  try {
    const result = await analyseImageWithBYOK(visionRequest);
    return NextResponse.json({ data: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Vision analysis failed";

    // Don't expose internal errors for auth/key issues
    if (message.includes("No AI provider") || message.includes("API key")) {
      return NextResponse.json({ error: message }, { status: 402 });
    }

    console.error("[vision] Analysis error:", error);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
