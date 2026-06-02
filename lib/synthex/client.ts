/**
 * Synthex Service Client — RestoreAssist
 *
 * Proxies avatar/voice/media requests to the Synthex platform API.
 * Synthex holds the canonical HeyGen + ElevenLabs credentials and
 * CEO voice clone (jSuBIjxMKhqIfb0wCK1F — Phill McGurk).
 *
 * Auth: X-Service-Token header (shared secret, rotate quarterly).
 *
 * Endpoints consumed:
 *   POST /api/media/generate/voice?action=generate  → TTS MP3
 *   POST /api/media/generate/voice?action=stream    → TTS stream
 *   POST /api/heygen/video                          → avatar video (ElevenLabs audio + HeyGen lip-sync)
 *   GET  /api/heygen/video?videoId=                 → status poll
 *   GET  /api/media/generate/voice?type=all          → voice list
 *
 * Ref: Synthex .env.local → NEXT_PUBLIC_APP_URL="https://synthex.social"
 */

const SYNTHEX_BASE_URL = process.env.SYNTHEX_BASE_URL?.replace(/\/$/, "") ?? "";
const SYNTHEX_SERVICE_TOKEN = process.env.SYNTHEX_SERVICE_TOKEN;

// ─── Types ────────────────────────────────────────────────────────────

export interface SynthexVoiceRequest {
  text: string;
  voiceId?: string;        // default: CEO clone jSuBIjxMKhqIfb0wCK1F
  modelId?: string;        // eleven_multilingual_v2
  stability?: number;
  similarityBoost?: number;
  style?: number;
  outputFormat?: string;
}

export interface SynthexVoiceResponse {
  success: boolean;
  audioBase64?: string;
  contentType?: string;
  voiceId?: string;
  characterCount?: number;
  error?: string;
}

export interface SynthexVideoRequest {
  script: string;
  avatarId?: string;
  voiceId?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
}

export interface SynthexVideoResponse {
  success: boolean;
  provider?: string;
  videoId?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  status?: "pending" | "processing" | "completed" | "failed";
  error?: string;
  pollUrl?: string;
  pollInterval?: number;
}

export interface SynthexVoiceListResponse {
  voices: Array<{
    voiceId: string;
    name: string;
    category: string;
  }>;
  defaultVoices: Record<string, string>;
}

// ─── Core ─────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  if (!SYNTHEX_SERVICE_TOKEN) {
    throw new Error("SYNTHEX_SERVICE_TOKEN is not set in environment");
  }
  return {
    "Content-Type": "application/json",
    "X-Service-Token": SYNTHEX_SERVICE_TOKEN,
    "X-Source-App": "restoreassist",
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  if (!SYNTHEX_BASE_URL) {
    throw new Error("SYNTHEX_BASE_URL is not set in environment");
  }
  const res = await fetch(`${SYNTHEX_BASE_URL}${path}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Synthex API error ${res.status}: ${err}`);
  }
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  if (!SYNTHEX_BASE_URL) {
    throw new Error("SYNTHEX_BASE_URL is not set in environment");
  }
  const res = await fetch(`${SYNTHEX_BASE_URL}${path}`, {
    method: "GET",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Synthex API error ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Generate TTS audio via Synthex → ElevenLabs.
 * Returns base64-encoded MP3 (decode to Buffer on server, or pass to client).
 */
export async function generateVoice(
  req: SynthexVoiceRequest,
): Promise<SynthexVoiceResponse> {
  return post<SynthexVoiceResponse>("/api/media/generate/voice?action=generate", {
    text: req.text,
    voiceId: req.voiceId ?? "jSuBIjxMKhqIfb0wCK1F", // CEO clone
    modelId: req.modelId ?? "eleven_multilingual_v2",
    stability: req.stability ?? 0.55,
    similarityBoost: req.similarityBoost ?? 0.8,
    style: req.style ?? 0.25,
    outputFormat: req.outputFormat ?? "mp3_44100_128",
    saveToLibrary: false, // don't pollute Synthex media library
    });
}

/**
 * Stream TTS audio via Synthex → ElevenLabs.
 * Returns a ReadableStream of MP3 audio bytes.
 */
export async function streamVoice(
  req: SynthexVoiceRequest,
): Promise<ReadableStream<Uint8Array>> {
  if (!SYNTHEX_BASE_URL) {
    throw new Error("SYNTHEX_BASE_URL is not set in environment");
  }
  const res = await fetch(
    `${SYNTHEX_BASE_URL}/api/media/generate/voice?action=stream`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        text: req.text,
        voiceId: req.voiceId ?? "jSuBIjxMKhqIfb0wCK1F",
        modelId: req.modelId ?? "eleven_multilingual_v2",
        stability: req.stability ?? 0.55,
        similarityBoost: req.similarityBoost ?? 0.8,
        style: req.style ?? 0.25,
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Synthex stream error ${res.status}: ${err}`);
  }
  if (!res.body) {
    throw new Error("Synthex stream returned empty body");
  }
  return res.body;
}

/**
 * Generate avatar video via Synthex → HeyGen.
 * Returns videoId for polling. Requires avatarId.
 */
export async function generateAvatarVideo(
  req: SynthexVideoRequest,
): Promise<SynthexVideoResponse> {
  return post<SynthexVideoResponse>("/api/heygen/video", {
    script: req.script,
    avatarId: req.avatarId,
    ...(req.voiceId ? { voiceId: req.voiceId } : {}),
  });
}

/**
 * Poll for avatar video status via Synthex.
 */
export async function getVideoStatus(
  videoId: string,
): Promise<SynthexVideoResponse> {
  return get<SynthexVideoResponse>(
    `/api/heygen/video?videoId=${encodeURIComponent(videoId)}`,
  );
}

/**
 * List available voices from Synthex → ElevenLabs.
 */
export async function listVoices(): Promise<SynthexVoiceListResponse> {
  const data = await get<{
    voices: Array<{ voiceId: string; name: string; category: string }>;
    defaultVoices: Record<string, string>;
  }>("/api/media/generate/voice?type=all");
  return {
    voices: data.voices || [],
    defaultVoices: data.defaultVoices || {},
  };
}

// ─── Brand Defaults ───────────────────────────────────────────────────

export const CEO_VOICE_ID = "jSuBIjxMKhqIfb0wCK1F";

export const BRAND_VOICE_SETTINGS = {
  voice_id: CEO_VOICE_ID,
  model_id: "eleven_multilingual_v2",
  stability: 0.55,
  similarity_boost: 0.8,
  style: 0.25,
} as const;

/**
 * Apply brand voice defaults to a voice request.
 */
export function withBrandVoice(req: Partial<SynthexVoiceRequest>): SynthexVoiceRequest {
  return {
    text: req.text ?? "",
    voiceId: req.voiceId ?? BRAND_VOICE_SETTINGS.voice_id,
    modelId: req.modelId ?? BRAND_VOICE_SETTINGS.model_id,
    stability: req.stability ?? BRAND_VOICE_SETTINGS.stability,
    similarityBoost: req.similarityBoost ?? BRAND_VOICE_SETTINGS.similarity_boost,
    style: req.style ?? BRAND_VOICE_SETTINGS.style,
  };
}
