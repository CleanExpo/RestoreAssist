/**
 * API Route: /api/elevenlabs/voice
 *
 * Proxies TTS requests to Synthex (which holds canonical ElevenLabs
 * credentials and the CEO voice clone aGkVQvWUZi16EH8aZJvT).
 *
 * POST body: { text: string, voice_id?: string }
 * Response: audio/mpeg stream or JSON with base64 audio
 *
 * GET /api/elevenlabs/voice?type=all
 *   List available voices.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generateVoice,
  streamVoice,
  listVoices,
  withBrandVoice,
} from "@/lib/synthex/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, voice_id, stream = false } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 },
      );
    }

    if (text.length > 5000) {
      return NextResponse.json(
        { error: "Text exceeds 5000 character limit" },
        { status: 400 },
      );
    }

    const voiceReq = withBrandVoice({ text, voiceId: voice_id });

    // Stream mode: pipe Synthex stream directly to client
    if (stream) {
      const readable = await streamVoice(voiceReq);
      return new NextResponse(readable, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Transfer-Encoding": "chunked",
          "X-Voice-Id": voiceReq.voiceId ?? "default",
        },
      });
    }

    // Buffer mode: return base64 JSON (easier for client-side playback)
    const result = await generateVoice(voiceReq);

    if (!result.success || !result.audioBase64) {
      return NextResponse.json(
        { error: result.error || "Voice generation failed" },
        { status: 500 },
      );
    }

    // Decode base64 to Uint8Array and return as audio/mpeg
    const binaryString = atob(result.audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": result.contentType ?? "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
        "X-Voice-Id": result.voiceId ?? "default",
        "X-Character-Count": String(result.characterCount ?? 0),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/elevenlabs/voice] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "all";

    if (type === "all") {
      const result = await listVoices();
      return NextResponse.json({
        voices: result.voices,
        defaultVoices: result.defaultVoices,
        brandVoice: withBrandVoice({}),
      });
    }

    return NextResponse.json(
      { error: "Unsupported type. Use ?type=all" },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/elevenlabs/voice] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
