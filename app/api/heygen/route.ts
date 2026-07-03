/**
 * API Route: /api/heygen
 *
 * Proxies avatar video generation to Synthex (which holds canonical
 * HeyGen + ElevenLabs credentials and the CEO voice clone).
 *
 * POST body:
 *   {
 *     avatar_id: string,       // optional — Synthex has its own avatar config
 *     voice_id?: string,       // optional — defaults to CEO clone
 *     script: string,          // text to speak
 *     aspect_ratio?: "16:9" | "9:16" | "1:1",
 *   }
 *
 * Response:
 *   { video_id: string, status: "pending", poll_url: string }
 *
 * GET /api/heygen?video_id=xxx&provider=synthesia
 *   Poll for video status + URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fromException } from "@/lib/api-errors";
import { applyRateLimit } from "@/lib/rate-limiter";
import { requireActiveSubscription } from "@/lib/billing/subscription-gate";
import {
  generateAvatarVideo,
  getVideoStatus,
  withBrandVoice,
} from "@/lib/synthex/client";

// RA-6940 — paid proxy hardening. Avatar video generation spends real HeyGen/
// ElevenLabs credit via Synthex, so a bare session is not enough: gate on an
// active subscription and rate limit fail-closed. No in-repo caller exists
// today (grep app/ components/ finds none) — de-exposing entirely is the
// better end-state, but the route stays functional-and-gated for now because
// an out-of-repo Remotion pipeline may consume it.

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = await applyRateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 5,
      prefix: "heygen",
      key: session.user.id,
      failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
    });
    if (rateLimited) return rateLimited;

    const subscriptionGate = await requireActiveSubscription(session.user.id);
    if (subscriptionGate) return subscriptionGate;

    const body = await request.json();
    const { avatar_id, voice_id, script, aspect_ratio } = body;

    if (!script || typeof script !== "string") {
      return NextResponse.json(
        { error: "script is required" },
        { status: 400 },
      );
    }

    if (!avatar_id || typeof avatar_id !== "string") {
      return NextResponse.json(
        { error: "avatar_id is required" },
        { status: 400 },
      );
    }

    // Enforce max script length
    if (script.length > 5000) {
      return NextResponse.json(
        { error: "Script exceeds 5000 character limit" },
        { status: 400 },
      );
    }

    const result = await generateAvatarVideo({
      script,
      avatarId: avatar_id,
      voiceId: voice_id ?? withBrandVoice({}).voiceId,
      aspectRatio: aspect_ratio ?? "16:9",
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Video generation failed" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        video_id: result.videoId,
        status: result.status,
        poll_url: result.pollUrl,
        poll_interval: result.pollInterval,
      },
      { status: 202 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/heygen] Error:", message);
    return fromException(request, error, { stage: "heygen" });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = await applyRateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 30,
      prefix: "heygen-status",
      key: session.user.id,
      failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
    });
    if (rateLimited) return rateLimited;

    const subscriptionGate = await requireActiveSubscription(session.user.id);
    if (subscriptionGate) return subscriptionGate;

    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("video_id");

    if (!videoId) {
      return NextResponse.json(
        { error: "video_id query param required" },
        { status: 400 },
      );
    }

    const result = await getVideoStatus(videoId);

    return NextResponse.json({
      video_id: result.videoId,
      status: result.status,
      video_url: result.videoUrl,
      error: result.error,
      ...(result.status === "processing" && {
        poll_url: result.pollUrl,
        poll_interval: result.pollInterval,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/heygen] GET error:", message);
    return fromException(request, error, { stage: "heygen" });
  }
}
