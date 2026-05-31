/**
 * API Route: /api/elevenlabs/voice
 *
 * Server-side proxy for ElevenLabs Text-to-Speech.
 * StreamsMP3 audio back to the client.
 *
 * POST body: { text: string, voice_id?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { textToSpeech, withBrandVoice } from "@/lib/elevenlabs/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, voice_id } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 },
      );
    }

    // Enforce character limit per ElevenLabs plan generosity
    if (text.length > 5000) {
      return NextResponse.json(
        { error: "Text exceeds 5000 character limit" },
        { status: 400 },
      );
    }

    const buf = await textToSpeech(withBrandVoice({ text, voice_id }));

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400", // 24h cache for stable scripts
        "X-ElevenLabs-Voice": voice_id ?? "default",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/elevenlabs/voice] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
