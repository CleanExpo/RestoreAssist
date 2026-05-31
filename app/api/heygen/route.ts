/**
 * API Route: /api/heygen
 *
 * Server-side proxy for HeyGen video generation.
 * Receives a script from the frontend, triggers HeyGen avatar video,
 * and returns the video_id for polling.
 *
 * POST body:
 *   {
 *     avatar_id: string,
 *     voice_id?: string,
 *     script: string,          // text to speak
 *     background_color?: string,
 *   }
 *
 * Response:
 *   { video_id: string, status: "pending" }
 */

import { NextRequest, NextResponse } from "next/server";
import { generateVideo, withBrandDefaults } from "@/lib/heygen/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { avatar_id, voice_id, script, background_color } = body;

    if (!avatar_id || !script) {
      return NextResponse.json(
        { error: "avatar_id and script are required" },
        { status: 400 },
      );
    }

    // Enforce max script length (HeyGen limits vary by plan)
    if (script.length > 5000) {
      return NextResponse.json(
        { error: "Script exceeds 5000 character limit" },
        { status: 400 },
      );
    }

    const result = await generateVideo(
      withBrandDefaults({
        avatar_id,
        voice_id,
        input_text: script,
        background_color: background_color ?? "#1C2E47",
      }),
    );

    return NextResponse.json(
      {
        video_id: result.data.video_id,
        status: result.data.status,
      },
      { status: 202 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/heygen] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/heygen?video_id=xxx
 * Poll for video status + URL.
 */
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

    // Lazy import to avoid top-level API key checks at build time
    const { getVideoStatus } = await import("@/lib/heygen/client");
    const result = await getVideoStatus(videoId);

    return NextResponse.json(result.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/heygen] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
