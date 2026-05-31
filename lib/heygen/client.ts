/**
 * HeyGen API Client — RestoreAssist
 *
 * Thin wrapper around the HeyGen (LiveAvatar) API for:
 *   - GENERATE: avatar video from text / script
 *   - STREAMING: interactive avatar sessions
 *   - LIST: available avatars and voices
 *
 * Ref: https://developers.heygen.com/docs/
 */

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
const HEYGEN_BASE_URL = "https://api.heygen.com/v2";

// ─── Types ────────────────────────────────────────────────────────────

export interface AvatarListResponse {
  data: Array<{
    avatar_id: string;
    avatar_name: string;
    gender: string;
    preview_image_url: string;
    preview_video_url?: string;
  }>;
}

export interface VoiceListResponse {
  data: Array<{
    voice_id: string;
    display_name: string;
    gender: string;
    language: string;
    preview_audio: string;
  }>;
}

export interface GenerateVideoRequest {
  avatar_id: string;
  voice_id?: string;
  input_text: string;
  video_quality?: "high" | "medium" | "low";
  background_color?: string; // hex, e.g. "#1C2E47"
  width?: number;  // default 1920
  height?: number; // default 1080
}

export interface GenerateVideoResponse {
  data: {
    video_id: string;
    status: "pending" | "processing" | "completed" | "failed";
    video_url?: string;
    thumbnail_url?: string;
  };
}

export interface StreamingTokenResponse {
  data: {
    token: string;
    expires_at: number;
  };
}

// ─── Core ─────────────────────────────────────────────────────────────

function getHeaders() {
  if (!HEYGEN_API_KEY) {
    throw new Error("HEYGEN_API_KEY is not set in environment");
  }
  return {
    "Content-Type": "application/json",
    "X-Api-Key": HEYGEN_API_KEY,
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${HEYGEN_BASE_URL}${path}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HeyGen API error ${res.status}: ${err}`);
  }
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${HEYGEN_BASE_URL}${path}`, {
    method: "GET",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HeyGen API error ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * List available avatars (stock + custom).
 */
export async function listAvatars(): Promise<AvatarListResponse> {
  return get<AvatarListResponse>("/avatar/list");
}

/**
 * List available voices.
 */
export async function listVoices(): Promise<VoiceListResponse> {
  return get<VoiceListResponse>("/voices");
}

/**
 * Generate a talking-head video from text + avatar.
 * Returns a video_id — poll getVideoStatus() until status === "completed".
 */
export async function generateVideo(
  req: GenerateVideoRequest,
): Promise<GenerateVideoResponse> {
  return post<GenerateVideoResponse>("/video/generate", {
    ...req,
    video_quality: req.video_quality ?? "high",
    width: req.width ?? 1920,
    height: req.height ?? 1080,
  });
}

/**
 * Get status + URL for a previously generated video.
 */
export async function getVideoStatus(videoId: string): Promise<GenerateVideoResponse> {
  return get<GenerateVideoResponse>(`/video/status?video_id=${videoId}`);
}

/**
 * Get a streaming token for interactive avatar (LiveAvatar).
 * Token is short-lived (~5 min); request one per session.
 */
export async function getStreamingToken(avatarId: string): Promise<StreamingTokenResponse> {
  return post<StreamingTokenResponse>("/streaming/token", { avatar_id: avatarId });
}

/**
 * Use the "LiveAvatar Lite" iframe embed URL (simplest web integration).
 * Returns a URL you put in an <iframe> — no WebSocket required.
 */
export function buildLiteEmbedUrl(
  avatarId: string,
  token: string,
  greeting?: string,
): string {
  const base = "https://labs.heygen.com/streaming-embed";
  const params = new URLSearchParams({
    token,
    avatar: avatarId,
  });
  if (greeting) params.set("greeting", greeting);
  return `${base}?${params.toString()}`;
}

/**
 * Brand-aware default: restoreassist navy background + default quality.
 */
export function withBrandDefaults(req: Partial<GenerateVideoRequest>): GenerateVideoRequest {
  return {
    avatar_id: req.avatar_id ?? "",
    voice_id: req.voice_id ?? "2d5b0e6cf36f460aa7fb6a862da5d26c", // Luca
    input_text: req.input_text ?? "",
    video_quality: req.video_quality ?? "high",
    background_color: req.background_color ?? "#1C2E47",
    width: req.width ?? 1920,
    height: req.height ?? 1080,
  };
}
