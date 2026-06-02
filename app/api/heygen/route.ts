/**
 * API Route: /api/heygen
 *
 * Proxies HeyGen avatar video generation to Synthex.
 *
 * POST body:
 *   {
 *     avatar_id: string,       // required — HeyGen avatar ID
 *     voice_id?: string,       // optional — defaults to CEO clone
 *     script: string,          // text to speak (max 5000 chars)
 *   }
 *
 * Response:
 *   { video_id: string, status: "pending" }
 *
 * GET /api/heygen?video_id=xxx
 *   Poll for video status + URL.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generateAvatarVideo,
  getVideoStatus,
  withBrandVoice,
} from "@/lib/synthex/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { avatar_id, voice_id, script } = body;

    if (!script || typeof script !== "string") {
      return NextResponse.json(
        { error: "script is required" },
        { status: 400 },
      );
    }

    if (!avatar_id) {
      return NextResponse.json(
        { error: "avatar_id is required (no default avatar configured for RestoreAssist yet)" },
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
        video_url: result.videoUrl,
        thumbnail_url: result.thumbnailUrl,
      },
      { status: 202 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/heygen] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/heygen] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
