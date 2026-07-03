/**
 * API Route: /api/elevenlabs/sfx
 *
 * Server-side proxy for ElevenLabs Sound Effects (FX).
 * NOTE: Synthex does not currently proxy SFX — this route requires
 * a direct ELEVENLABS_API_KEY in RestoreAssist env, or disable SFX.
 *
 * POST body:
 *   {
 *     description: string,       // e.g. "calm corporate ambience, warm undertone"
 *     duration_seconds?: number, // 0.5 – 5
 *     prompt_influence?: number, // 0.0 – 1.0
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateSFX } from "@/lib/elevenlabs/client";
import { fromException } from "@/lib/api-errors";
import { applyRateLimit } from "@/lib/rate-limiter";
import { requireActiveSubscription } from "@/lib/billing/subscription-gate";

// RA-6940 — paid proxy hardening. SFX generation spends real ElevenLabs
// credit (direct API key), so a bare session is not enough: gate on an
// active subscription and rate limit fail-closed. No in-repo caller exists
// today — de-exposing entirely is the better end-state, but the route stays
// functional-and-gated for now because an out-of-repo Remotion pipeline may
// consume it.

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = await applyRateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 10,
      prefix: "elevenlabs-sfx",
      key: session.user.id,
      failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
    });
    if (rateLimited) return rateLimited;

    const subscriptionGate = await requireActiveSubscription(session.user.id);
    if (subscriptionGate) return subscriptionGate;

    const body = await request.json();
    const { description, duration_seconds, prompt_influence } = body;

    if (!description || typeof description !== "string") {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 },
      );
    }

    // Enforce duration bounds (ElevenLabs limit)
    const duration = Math.min(Math.max(duration_seconds ?? 3, 0.5), 5);

    const buf = await generateSFX({
      text: description,
      duration_seconds: duration,
      prompt_influence: prompt_influence ?? 0.3,
    });

    // Convert Node Buffer to Uint8Array for web-standard response
    const bytes = Uint8Array.from(buf);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=604800", // 7-day cache (SFX stable)
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/elevenlabs/sfx] Error:", message);
    return fromException(request, error, { stage: "elevenlabs/sfx" });
  }
}
