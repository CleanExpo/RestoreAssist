/**
 * ElevenLabs API Client — RestoreAssist
 *
 * Provides three ElevenLabs services:
 *   1. TEXT-TO-SPEECH — voiceover narration
 *   2. SOUND EFFECTS   — brand ambience, transitions
 *   3. VOICE-ISOLATION — clean audio from noisy recordings
 *
 * RA-6920 / RA-6998 (BYOK — Margot zero-platform-cost model): every function
 * takes the CALLING WORKSPACE's own ElevenLabs API key as an explicit argument.
 * This module NEVER reads a platform `process.env.ELEVENLABS_API_KEY` — a
 * customer TTS/SFX call must spend the client's own key, resolved by the route
 * via `resolveWorkspaceElevenLabsKey` and failed-closed to a 402 when absent.
 *
 * Ref: https://elevenlabs.io/docs
 */

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

// ─── Types ────────────────────────────────────────────────────────────

export interface TTSRequest {
  text: string;
  voice_id?: string;          // falls back to the workspace's default Voice ID
  model_id?: string;          // eleven_multilingual_v2
  stability?: number;         // 0.0 – 1.0
  similarity_boost?: number;  // 0.0 – 1.0
  style?: number;             // 0.0 – 1.0 (expressiveness)
}

export interface SFXRequest {
  text: string;               // desc: "calm brand ambience, warm tone, 3 seconds"
  duration_seconds?: number;
  prompt_influence?: number;  // 0.0 – 1.0
}

export interface VoiceListResponse {
  voices: Array<{
    voice_id: string;
    name: string;
    category: string;
    labels: Record<string, string>;
    preview_url: string;
  }>;
}

// ─── Core ─────────────────────────────────────────────────────────────

/** Workspace-owned ElevenLabs credentials injected by the calling route. */
export interface ElevenLabsCredentials {
  /** The workspace's own ElevenLabs API key (BYOK — never the platform key). */
  apiKey: string;
  /** Optional workspace default Voice ID, used when a request omits voice_id. */
  voiceId?: string;
}

function getHeaders(apiKey: string, isMultipart = false): Record<string, string> {
  if (!apiKey) {
    throw new Error("ElevenLabs API key is required");
  }
  return {
    "xi-api-key": apiKey,
    ...(isMultipart ? {} : { "Content-Type": "application/json" }),
  };
}

// ─── Public API: Text-to-Speech ───────────────────────────────────────

/**
 * Convert text to MP3 audio bytes using ElevenLabs TTS.
 * Returns a Buffer — save to file or stream directly.
 * Spends the injected workspace credentials — never a platform key.
 */
export async function textToSpeech(
  req: TTSRequest,
  credentials: ElevenLabsCredentials,
): Promise<Buffer> {
  const voiceId = req.voice_id ?? credentials.voiceId;
  if (!voiceId) {
    throw new Error(
      "No ElevenLabs Voice ID provided — set a default in Workspace Settings or pass voice_id",
    );
  }
  const modelId = req.model_id ?? "eleven_multilingual_v2";

  const body: Record<string, unknown> = {
    text: req.text,
    model_id: modelId,
    voice_settings: {
      stability: req.stability ?? 0.5,
      similarity_boost: req.similarity_boost ?? 0.75,
      style: req.style ?? 0.3,
    },
  };

  const res = await fetch(
    `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: getHeaders(credentials.apiKey),
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS error ${res.status}: ${err}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Simple convenience: writes TTS to a file path.
 */
export async function textToSpeechFile(
  req: TTSRequest & { outputPath: string },
  credentials: ElevenLabsCredentials,
): Promise<string> {
  const buf = await textToSpeech(req, credentials);
  const fs = await import("fs");
  fs.writeFileSync(req.outputPath, buf);
  return req.outputPath;
}

// ─── Public API: Sound Effects ────────────────────────────────────────

/**
 * Generate an AI sound effect as MP3 bytes.
 * Description examples:
 *   - "calm corporate ambience, warm undertone, 3 seconds"
 *   - "gentle whoosh, transition, 0.5 seconds"
 *   - "subtle notification ding, 2 seconds"
 */
export async function generateSFX(
  req: SFXRequest,
  apiKey: string,
): Promise<Buffer> {
  const body: Record<string, unknown> = {
    text: req.text,
    duration_seconds: req.duration_seconds ?? 3,
    prompt_influence: req.prompt_influence ?? 0.3,
  };

  const res = await fetch(`${ELEVENLABS_BASE_URL}/sound-generation`, {
    method: "POST",
    headers: getHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs SFX error ${res.status}: ${err}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Public API: Voice Isolation ──────────────────────────────────────

/**
 * Strip background noise from an audio file.
 * Useful for cleaning up field recordings (site audio, technician voice notes).
 */
export async function isolateVoice(
  audioBuffer: Buffer,
  apiKey: string,
): Promise<Buffer> {
  const form = new FormData();
  const array = new Uint8Array(audioBuffer);
  const blob = new Blob([array], { type: "audio/mpeg" });
  form.append("audio", blob, "input.mp3");

  const res = await fetch(`${ELEVENLABS_BASE_URL}/audio-isolation`, {
    method: "POST",
    headers: getHeaders(apiKey, true),
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs isolation error ${res.status}: ${err}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Public API: Voice Listing ────────────────────────────────────────

export async function listVoices(apiKey: string): Promise<VoiceListResponse> {
  const res = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
    method: "GET",
    headers: getHeaders(apiKey),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs list voices error ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── Brand Defaults ───────────────────────────────────────────────────

export const BRAND_VOICE_SETTINGS = {
  /** Luca — calm, authoritative, Australian-resonant */
  voice_id: "onwK4e9ZLuTAKqWW03F9",
  /** ElevenLabs Multilingual v2 — best for English with Australian warmth */
  model_id: "eleven_multilingual_v2",
  /** Conservative stability → natural cadence without drift */
  stability: 0.55,
  /** Lip-sync fidelity */
  similarity_boost: 0.8,
  /** Slightly expressive but not theatrical */
  style: 0.25,
} as const;

/**
 * Apply brand voice defaults to a TTS request.
 */
export function withBrandVoice(req: Partial<TTSRequest>): TTSRequest {
  return {
    text: req.text ?? "",
    voice_id: req.voice_id ?? BRAND_VOICE_SETTINGS.voice_id,
    model_id: req.model_id ?? BRAND_VOICE_SETTINGS.model_id,
    stability: req.stability ?? BRAND_VOICE_SETTINGS.stability,
    similarity_boost: req.similarity_boost ?? BRAND_VOICE_SETTINGS.similarity_boost,
    style: req.style ?? BRAND_VOICE_SETTINGS.style,
  };
}

/**
 * Brand SFX prompts for RestoreAssist content.
 */
export const BRAND_SFX_PROMPTS = {
  /** Warm intro/outro bed — 3s */
  AMBIENCE_WARM: "calm corporate ambience, warm undertone, subtle synthesiser pad, 3 seconds",
  /** Gentle transition whoosh — 0.5s */
  WHOOSH_TRANSITION: "gentle air whoosh, clean transition, 0.5 seconds",
  /** Subtle notification pop — 0.8s */
  POP_NOTIFICATION: "subtle soft pop, clean high frequency, 0.8 seconds",
  /** Low bass hit — 1s */
  IMPACT_LOW: "low cinematic impact, subtle bass thump, 1 second",
} as const;
