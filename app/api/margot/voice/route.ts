/**
 * POST /api/margot/voice — RA-6998 Part B.
 *
 * Optional text-to-speech for Margot. Margot's chat reply is text (a streaming
 * response from /api/margot/chat); the dashboard calls THIS route with the final
 * text to hear it spoken in the workspace's own ElevenLabs voice.
 *
 * Zero-platform-cost / BYOK: the audio is synthesised with the calling
 * WORKSPACE's own ElevenLabs key AND its configured Voice ID (from #1801's
 * `{ apiKey, voiceId }` credential blob) — never the platform key and never the
 * hardcoded brand default voice. When the workspace has no ElevenLabs key, or no
 * Voice ID configured, the route fails closed with a clear non-audio signal so
 * the client gracefully stays text-only.
 *
 * Auth: admin-only, matching the other Margot routes (verifyAdminFromDb).
 *
 * POST body: { text: string }
 * Success:   200 audio/mpeg (MP3 bytes)
 * Fallback:  402 { voiceUnavailable: true } — no workspace ElevenLabs key
 *            422 { voiceUnavailable: true } — key present but no Voice ID set
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { apiError, fromException } from "@/lib/api-errors";
import { textToSpeech } from "@/lib/elevenlabs/client";
import {
  resolveWorkspaceElevenLabsKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TTS_CHARS = 5000;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;
    const userId = auth.user!.id;

    const body = (await request.json()) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return apiError(request, {
        code: "VALIDATION",
        message: "text is required",
        status: 400,
      });
    }

    // Resolve the workspace's own ElevenLabs key + Voice ID. Fail closed to a
    // text-only signal when absent — never fall through to a platform key.
    let workspace: { apiKey: string; voiceId?: string };
    try {
      workspace = await resolveWorkspaceElevenLabsKey(userId);
    } catch (err) {
      if (err instanceof NoWorkspaceKeyError) {
        return NextResponse.json(
          {
            error:
              "Voice requires your own ElevenLabs API key — add one in Workspace Settings -> AI Providers.",
            voiceUnavailable: true,
          },
          { status: 402 },
        );
      }
      throw err;
    }

    // The Voice ID must come from the workspace's stored { apiKey, voiceId }
    // blob (#1801) — never the hardcoded brand default. No Voice ID → stay
    // text-only rather than pick a default voice the workspace didn't choose.
    if (!workspace.voiceId) {
      return NextResponse.json(
        {
          error:
            "No ElevenLabs Voice ID configured — set a default in Workspace Settings -> AI Providers.",
          voiceUnavailable: true,
        },
        { status: 422 },
      );
    }

    const buf = await textToSpeech(
      { text: text.slice(0, MAX_TTS_CHARS) },
      { apiKey: workspace.apiKey, voiceId: workspace.voiceId },
    );
    const bytes = Uint8Array.from(buf);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "margot/voice" });
  }
}
