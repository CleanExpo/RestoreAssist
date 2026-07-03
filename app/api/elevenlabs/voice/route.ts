/**
 * API Route: /api/elevenlabs/voice
 *
 * Proxies TTS requests to Synthex (which holds canonical ElevenLabs
 * credentials and the CEO voice clone jSuBIjxMKhqIfb0wCK1F).
 *
 * POST body: { text: string, voice_id?: string }
 * Response: audio/mpeg stream or JSON with base64 audio
 *
 * GET /api/elevenlabs/voice?type=all
 *   List available voices.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fromException } from "@/lib/api-errors";
import { applyRateLimit } from "@/lib/rate-limiter";
import { requireActiveSubscription } from "@/lib/billing/subscription-gate";
import {
  generateVoice,
  streamVoice,
  listVoices,
  withBrandVoice,
} from "@/lib/synthex/client";

// RA-6940 — paid proxy hardening. TTS spends real ElevenLabs credit via
// Synthex, so a bare session is not enough: gate on an active subscription
// and rate limit fail-closed. No in-repo caller exists today — de-exposing
// entirely is the better end-state, but the route stays functional-and-gated
// for now because an out-of-repo Remotion pipeline may consume it.

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = await applyRateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 10,
      prefix: "elevenlabs-voice",
      key: session.user.id,
      failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
    });
    if (rateLimited) return rateLimited;

    const subscriptionGate = await requireActiveSubscription(session.user.id);
    if (subscriptionGate) return subscriptionGate;

    const body = await request.json();
    const { text, voice_id, stream = false } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
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
    return fromException(request, error, { stage: "elevenlabs/voice" });
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
      maxRequests: 20,
      prefix: "elevenlabs-voices-list",
      key: session.user.id,
      failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
    });
    if (rateLimited) return rateLimited;

    const subscriptionGate = await requireActiveSubscription(session.user.id);
    if (subscriptionGate) return subscriptionGate;

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
    return fromException(request, error, { stage: "elevenlabs/voice" });
  }
}
