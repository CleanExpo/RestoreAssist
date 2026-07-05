/**
 * API Route: /api/elevenlabs/sfx
 *
 * Server-side proxy for ElevenLabs Sound Effects (FX).
 *
 * RA-6920 / RA-6998 — SFX spends real ElevenLabs credit, so it runs on the
 * calling WORKSPACE's own ElevenLabs key (BYOK), never the platform key. If the
 * workspace has no ElevenLabs key configured, the route fails closed with a 402
 * "add your key" upsell — the same contract the Anthropic/OpenAI AI routes use.
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
import {
  resolveWorkspaceElevenLabsKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";
import { fromException } from "@/lib/api-errors";
import { applyRateLimit } from "@/lib/rate-limiter";
import { requireActiveSubscription } from "@/lib/billing/subscription-gate";

// RA-6940 — paid proxy hardening. SFX generation spends real ElevenLabs
// credit, so a bare session is not enough: gate on an active subscription and
// rate limit fail-closed. RA-6920 — the credit spent is the CLIENT's own
// (resolveWorkspaceElevenLabsKey), never the platform key.

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

    // RA-6920 — resolve the workspace's own ElevenLabs key; fail closed to a 402
    // when absent. Never fall through to a platform env key.
    let workspaceKey: { apiKey: string };
    try {
      workspaceKey = await resolveWorkspaceElevenLabsKey(session.user.id);
    } catch (err) {
      if (err instanceof NoWorkspaceKeyError) {
        return NextResponse.json(
          {
            error:
              "Sound effects require your own ElevenLabs API key — add one in Workspace Settings -> AI Providers.",
            upgradeRequired: true,
          },
          { status: 402 },
        );
      }
      throw err;
    }

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

    const buf = await generateSFX(
      {
        text: description,
        duration_seconds: duration,
        prompt_influence: prompt_influence ?? 0.3,
      },
      workspaceKey.apiKey,
    );

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
