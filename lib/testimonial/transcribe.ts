/**
 * Testimonial Engine — Whisper transcription wrapper.
 *
 * Turns a recorded clip into caption cues (start/end in ms + trimmed text).
 * The OpenAI client is injectable so the mapping logic is unit-testable without
 * network access or an API key.
 */

import OpenAI, { toFile } from "openai";

export interface CaptionCue {
  startMs: number;
  endMs: number;
  text: string;
}

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}
interface WhisperResponse {
  segments?: WhisperSegment[];
}
export interface WhisperClient {
  audio: {
    transcriptions: {
      create: (args: Record<string, unknown>) => Promise<WhisperResponse>;
    };
  };
}

let cachedDefault: WhisperClient | null = null;
function defaultClient(): WhisperClient {
  if (!cachedDefault) {
    // Cast: we only use the audio.transcriptions.create surface.
    cachedDefault = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    }) as unknown as WhisperClient;
  }
  return cachedDefault;
}

export async function transcribeToCues(
  audio: Buffer,
  opts: { client?: WhisperClient; filename: string },
): Promise<CaptionCue[]> {
  const client = opts.client ?? defaultClient();
  const file = await toFile(audio, opts.filename);
  const res = await client.audio.transcriptions.create({
    model: "whisper-1",
    file,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  const segments = Array.isArray(res?.segments) ? res.segments : [];
  return segments.map((s) => ({
    startMs: Math.round(s.start * 1000),
    endMs: Math.round(s.end * 1000),
    text: String(s.text ?? "").trim(),
  }));
}
