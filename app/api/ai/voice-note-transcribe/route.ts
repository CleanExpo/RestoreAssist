/**
 * RA-1122 — Whisper transcription for technician voice notes.
 *
 * POST multipart/form-data with `audio` file → { transcript, durationMs }
 *
 * Whisper (whisper-1) handles AU/NZ accents + IICRC restoration
 * vocabulary well out of the box. 10MB upload cap (≈ 10 min audio).
 * Rate-limited per user to bound cost ($0.006/min).
 *
 * Offline fallback path: the client queues audio locally (ServiceWorker
 * + IndexedDB, RA-1124) and calls this endpoint once connectivity
 * returns. This route is stateless — no DB writes here; the client
 * attaches the transcript to the field it captured for.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import OpenAI from "openai";

export const maxDuration = 60;

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/m4a",
  "audio/x-m4a",
]);

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await applyRateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30, // 30 transcripts/min/user — field workflow doesn't exceed this
    prefix: "voice-note-transcribe",
    key: session.user.id,
  });
  if (rateLimited) return rateLimited;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Voice transcription unavailable — OPENAI_API_KEY not configured. The client should fall back to Web Speech API.",
      },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const audioRaw = formData.get("audio");
  if (!(audioRaw instanceof File)) {
    return NextResponse.json(
      { error: "`audio` file field is required" },
      { status: 400 },
    );
  }

  if (audioRaw.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: `Audio exceeds 10 MB limit (got ${Math.round(audioRaw.size / 1024)} KB)` },
      { status: 413 },
    );
  }

  if (audioRaw.type && !ALLOWED_MIME.has(audioRaw.type)) {
    return NextResponse.json(
      { error: `Unsupported audio type: ${audioRaw.type}` },
      { status: 415 },
    );
  }

  const started = Date.now();
  try {
    const result = await getOpenAI().audio.transcriptions.create({
      file: audioRaw,
      model: "whisper-1",
      language: "en",
      // Hint Whisper toward restoration vernacular — improves accuracy
      // on IICRC jargon + AU spelling ("mould" not "mold").
      prompt:
        "Restoration industry terminology: Category 1, 2, 3, Class 1, 2, 3, 4 water damage. IICRC S500, S520. Mould, efflorescence, moisture meter, dehumidifier, air mover, HEPA filter, containment, antimicrobial. Australian English.",
      response_format: "verbose_json",
      temperature: 0,
    });

    const durationMs = Date.now() - started;
    return NextResponse.json({
      transcript: result.text,
      // Whisper verbose_json returns `duration` in seconds
      audioDurationSeconds: (result as { duration?: number }).duration ?? null,
      transcribeDurationMs: durationMs,
    });
  } catch (err) {
    console.error(
      "[voice-note-transcribe]",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 },
    );
  }
}
