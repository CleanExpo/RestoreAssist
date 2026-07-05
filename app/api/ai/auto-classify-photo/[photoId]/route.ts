/**
 * RA-1123 — Claude Vision auto-classifier for inspection photos.
 *
 * POST /api/ai/auto-classify-photo/[photoId]
 *   (optional body: { model?: "claude-sonnet-4.5" | "claude-opus-4-7" })
 *
 * Fetches the photo's Cloudinary URL, sends it to Claude Vision with a
 * prompt tuned for AU water-damage vernacular + IICRC S500 label
 * schema (RA-446), parses the JSON response, and writes to
 * InspectionPhoto.aiLabels + aiConfidence + aiModel + aiRunAt.
 *
 * The technician UI then shows the suggestion next to each field —
 * accepting copies values into the label columns and flips labelledBy
 * to "AI_ACCEPTED". This PR ships the backend + DB fields; the UI
 * accept/reject surface is a follow-up (needs coordination with the
 * existing photo-labels form).
 *
 * Auth: user must own the inspection. Rate-limited per user. When
 * ANTHROPIC_API_KEY is missing the endpoint returns 503 with a clear
 * message so the inspection-photo POST handler can no-op gracefully
 * on the fire-and-forget call.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { requireActiveSubscription } from "@/lib/billing/subscription-gate";
import { Prisma } from "@prisma/client";
import { autoClassifyPhoto } from "@/lib/services/ai/auto-classify-photo";
import { apiError, fromException } from "@/lib/api-errors";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";

export const maxDuration = 60;

interface ClassifyResponse {
  labels: Record<string, unknown>;
  confidence: number;
  model: string;
  runAt: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // RA-6940 — subscription gate before any paid Claude Vision spend.
  // CANCELED / PAST_DUE users must not trigger autoClassifyPhoto (402).
  const subscriptionGate = await requireActiveSubscription(userId);
  if (subscriptionGate) return subscriptionGate;

  const rateLimited = await applyRateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    prefix: "auto-classify-photo",
    key: userId,
    failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
  });
  if (rateLimited) return rateLimited;

  // RA-6921 (P0) — resolve the workspace's own BYOK key; never spend the
  // platform's ANTHROPIC_API_KEY on a client's vision-classification workload.
  let apiKey: string;
  try {
    apiKey = (await resolveWorkspaceAiKey(userId, "ANTHROPIC")).apiKey;
  } catch (err) {
    if (!(err instanceof NoWorkspaceKeyError)) throw err;
    console.error("[AutoClassifyPhoto]", {
      userId,
      reason: "KEY_MISSING",
      detail: "No workspace Anthropic key configured",
    });
    // RA-1548 — left raw: {error:<reason-code>} contract (parallels the
    // !result.ok block below); __tests__ pin {error:"KEY_MISSING"}.
    return NextResponse.json({ error: "KEY_MISSING" }, { status: 402 });
  }

  const { photoId } = await params;

  // Ownership check — photo must belong to an inspection the caller owns
  const photo = await prisma.inspectionPhoto.findFirst({
    where: { id: photoId, inspection: { userId } },
    select: { id: true, url: true, mimeType: true },
  });
  if (!photo) {
    return apiError(request, {
      code: "NOT_FOUND",
      message: "Photo not found",
      status: 404,
    });
  }

  try {
    const result = await autoClassifyPhoto({
      apiKey,
      imageUrl: photo.url,
    });

    if (!result.ok) {
      // RA-1548 — left raw: {error: result.reason} dynamic-status block
      // (402/429/503/502/500) + Retry-After header; __tests__ pin
      // {error:"API_ERROR"}.
      console.error("[AutoClassifyPhoto]", {
        userId,
        photoId: photo.id,
        reason: result.reason,
        detail: result.detail,
      });
      const status =
        result.reason === "KEY_MISSING"
          ? 402
          : result.reason === "RATE_LIMITED"
            ? 429
            : result.reason === "MODEL_OVERLOADED"
              ? 503
              : result.reason === "PARSE_FAILED"
                ? 502
                : 500;
      const headers: Record<string, string> =
        result.retryAfterMs != null
          ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }
          : {};
      return NextResponse.json({ error: result.reason }, { status, headers });
    }

    const { labels, confidence, model } = result.data;

    const runAt = new Date();
    await prisma.inspectionPhoto.update({
      where: { id: photo.id },
      data: {
        // Prisma's JSON input type requires a cast from a generic object.
        aiLabels: labels as Prisma.InputJsonValue,
        aiConfidence: confidence,
        aiModel: model,
        aiRunAt: runAt,
      },
    });

    const response: ClassifyResponse = {
      labels,
      confidence: confidence ?? 0,
      model,
      runAt: runAt.toISOString(),
    };
    return NextResponse.json(response);
  } catch (err) {
    return fromException(request, err, { stage: "classify" });
  }
}
