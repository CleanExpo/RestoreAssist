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
import { requireActiveSubscription } from "@/lib/billing/subscription-gate";
import { apiError, fromException } from "@/lib/api-errors";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";
import OpenAI from "openai";

export const maxDuration = 60;

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB

type DetectedAudio = { mediaType: string; extension: string };

function hasAscii(buffer: Buffer, offset: number, value: string) {
  return (
    buffer.length >= offset + value.length &&
    buffer.toString("ascii", offset, offset + value.length) === value
  );
}

function detectAudio(buffer: Buffer): DetectedAudio | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return { mediaType: "audio/webm", extension: "webm" };
  }

  if (hasAscii(buffer, 0, "RIFF") && hasAscii(buffer, 8, "WAVE")) {
    return { mediaType: "audio/wav", extension: "wav" };
  }

  if (buffer.length >= 27 && hasAscii(buffer, 0, "OggS")) {
    return { mediaType: "audio/ogg", extension: "ogg" };
  }

  if (
    (buffer.length >= 10 && hasAscii(buffer, 0, "ID3")) ||
    (buffer.length >= 4 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  ) {
    return { mediaType: "audio/mpeg", extension: "mp3" };
  }

  if (buffer.length >= 12 && hasAscii(buffer, 4, "ftyp")) {
    const brand = buffer.toString("ascii", 8, 12);
    const isM4a = brand === "M4A " || brand === "M4B ";
    return {
      mediaType: "audio/mp4",
      extension: isM4a ? "m4a" : "mp4",
    };
  }

  return null;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  // Rule 5 — subscription gate before any AI spend (Whisper call below).
  const gate = await requireActiveSubscription(session.user.id);
  if (gate) return gate;

  const rateLimited = await applyRateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30, // 30 transcripts/min/user — field workflow doesn't exceed this
    prefix: "voice-note-transcribe",
    key: session.user.id,
    failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
  });
  if (rateLimited) return rateLimited;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError(request, {
      code: "VALIDATION",
      message: "Expected multipart/form-data",
      status: 400,
    });
  }

  const audioEntries = formData.getAll("audio");
  if (audioEntries.length !== 1 || !(audioEntries[0] instanceof File)) {
    return apiError(request, {
      code: "VALIDATION",
      message:
        audioEntries.length > 1
          ? "Exactly one `audio` file is required"
          : "`audio` file field is required",
      status: 400,
    });
  }
  const audioRaw = audioEntries[0];

  if (audioRaw.size > MAX_AUDIO_BYTES) {
    return apiError(request, {
      code: "PAYLOAD_TOO_LARGE",
      message: "Audio exceeds 10 MB limit",
      status: 413,
    });
  }

  if (audioRaw.size === 0) {
    return apiError(request, {
      code: "VALIDATION",
      message: "Unsupported or invalid audio file",
      status: 415,
    });
  }

  const audioBuffer = Buffer.from(await audioRaw.arrayBuffer());
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    return apiError(request, {
      code: "PAYLOAD_TOO_LARGE",
      message: "Audio exceeds 10 MB limit",
      status: 413,
    });
  }

  const detectedAudio = detectAudio(audioBuffer);
  if (!detectedAudio) {
    return apiError(request, {
      code: "VALIDATION",
      message: "Unsupported or invalid audio file",
      status: 415,
    });
  }

  let workspaceKey: { apiKey: string };
  try {
    workspaceKey = await resolveWorkspaceAiKey(session.user.id, "OPENAI");
  } catch (err) {
    if (err instanceof NoWorkspaceKeyError) {
      return apiError(request, {
        code: "PAYMENT_REQUIRED",
        message:
          "Voice transcription requires your own OpenAI API key — add one in Workspace Settings -> AI Providers. The client should fall back to Web Speech API.",
        status: 402,
      });
    }
    throw err;
  }

  const started = Date.now();
  try {
    const openai = new OpenAI({ apiKey: workspaceKey.apiKey });
    const result = await openai.audio.transcriptions.create({
      file: new File([audioBuffer], `voice-note.${detectedAudio.extension}`, {
        type: detectedAudio.mediaType,
      }),
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
    return fromException(request, err, { stage: "transcribe" });
  }
}
