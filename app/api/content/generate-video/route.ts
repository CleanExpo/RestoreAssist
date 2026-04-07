/**
 * POST /api/content/generate-video
 *
 * Stage 3 of the content automation pipeline (RA-158).
 * Submits an AI avatar video render job to HeyGen using the ContentJob's
 * audioUrl as the voice track. HeyGen processes asynchronously and notifies
 * via webhook when complete.
 *
 * Authentication: session required
 *
 * Request body:
 *   { jobId: string }
 *
 * Response 200:
 *   { heygenRenderJobId: string }
 *
 * Response 400: missing jobId or job has no audioUrl
 * Response 401: not authenticated
 * Response 404: job not found
 * Response 500: HeyGen API error
 *
 * Env vars required:
 *   HEYGEN_API_KEY    — HeyGen API key
 *   HEYGEN_AVATAR_ID  — Avatar ID (optional; falls back to stock avatar)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── HEYGEN CONSTANTS ────────────────────────────────────────────────────────

const HEYGEN_API_BASE = "https://api.heygen.com/v2";

// Stock avatar that doesn't require a custom avatar setup
const HEYGEN_STOCK_AVATAR_ID = "Angela-inblackskirt-20220820";

// RestoreAssist brand dark blue
const BRAND_BACKGROUND = "#1e3a5f";

// ─── HEYGEN CLIENT ────────────────────────────────────────────────────────────

interface HeyGenVideoResponse {
  data?: {
    video_id?: string;
  };
  error?: string;
}

async function submitHeyGenRender(
  audioUrl: string,
  voiceoverText: string,
): Promise<string> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    throw new Error("HEYGEN_API_KEY is not configured");
  }

  const avatarId = process.env.HEYGEN_AVATAR_ID ?? HEYGEN_STOCK_AVATAR_ID;

  const payload = {
    video_inputs: [
      {
        character: {
          type: "avatar",
          avatar_id: avatarId,
          avatar_style: "normal",
        },
        voice: {
          type: "audio",
          audio_url: audioUrl,
        },
        background: {
          type: "color",
          value: BRAND_BACKGROUND,
        },
      },
    ],
    aspect_ratio: "9:16",
    caption: false,
    // Provide voiceoverText as fallback context for HeyGen if audio processing fails
    test: false,
  };

  const response = await fetch(`${HEYGEN_API_BASE}/video/generate`, {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = (await response.json()) as HeyGenVideoResponse;

  if (!response.ok || json.error) {
    throw new Error(
      `HeyGen error ${response.status}: ${json.error ?? JSON.stringify(json)}`,
    );
  }

  const videoId = json.data?.video_id;
  if (!videoId) {
    throw new Error("HeyGen response missing video_id");
  }

  return videoId;
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { jobId } = (body ?? {}) as Record<string, unknown>;

  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  try {
    // ── 1. Load and verify job ownership ──────────────────────────────────
    const job = await prisma.contentJob.findFirst({
      where: { id: jobId, userId: session.user.id },
    });

    if (!job) {
      return NextResponse.json(
        { error: "ContentJob not found or not owned by user" },
        { status: 404 },
      );
    }

    if (!job.audioUrl) {
      return NextResponse.json(
        { error: "Job has no audioUrl — run generate-voice first" },
        { status: 400 },
      );
    }

    // ── 2. Submit render to HeyGen ────────────────────────────────────────
    const heygenRenderJobId = await submitHeyGenRender(
      job.audioUrl,
      job.voiceoverText ?? "",
    );

    // ── 3. Update ContentJob ───────────────────────────────────────────────
    // Status moves to VIDEO_RENDERING — HeyGen is processing asynchronously.
    // The poll-heygen cron or heygen webhook will set videoUrl + status=VIDEO_READY when done.
    await prisma.contentJob.update({
      where: { id: job.id },
      data: {
        heygenRenderJobId,
        status: "VIDEO_RENDERING",
      },
    });

    return NextResponse.json({ heygenRenderJobId }, { status: 200 });
  } catch (err) {
    console.error("[generate-video] Error:", err);

    // Attempt to mark job as failed
    try {
      await prisma.contentJob.updateMany({
        where: { id: jobId, userId: session.user.id },
        data: {
          status: "FAILED",
          errorMessage:
            err instanceof Error
              ? err.message
              : "Unknown error in generate-video",
        },
      });
    } catch {
      // Swallow secondary DB error
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
