/**
 * API Route: /api/elevenlabs/sfx
 *
 * Server-side proxy for ElevenLabs Sound Effects (FX).
 * Returns MP3 audio bytes.
 *
 * POST body:
 *   {
 *     description: string,       // e.g. "calm corporate ambience, warm undertone"
 *     duration_seconds?: number, // 0.5 – 5
 *     prompt_influence?: number, // 0.0 – 1.0
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { generateSFX } from "@/lib/elevenlabs/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { description, duration_seconds, prompt_influence } = body;

    if (!description || typeof description !== "string") {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 },
      );
    }

    // Enforce duration bounds (ElevenLabs limit)
    const duration = Math.min(
      Math.max(duration_seconds ?? 3, 0.5),
      5,
    );

    const buf = await generateSFX({
      text: description,
      duration_seconds: duration,
      prompt_influence: prompt_influence ?? 0.3,
    });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=604800", // 7-day cache (SFX stable)
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/elevenlabs/sfx] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
