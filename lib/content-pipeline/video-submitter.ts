/**
 * Video Submitter — Pure function for HeyGen video render submission
 *
 * Extracted from app/api/content/generate-video/route.ts.
 * No session auth, no Prisma — accepts audioUrl + voiceoverText,
 * returns the HeyGen render job ID.
 *
 * @module lib/content-pipeline/video-submitter
 */

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface VideoSubmitterInput {
  audioUrl: string;
  voiceoverText: string;
}

interface HeyGenVideoResponse {
  data?: {
    video_id?: string;
  };
  error?: string;
}

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const HEYGEN_API_BASE = "https://api.heygen.com/v2";

/** Stock avatar that doesn't require a custom avatar setup */
const HEYGEN_STOCK_AVATAR_ID = "Angela-inblackskirt-20220820";

/** RestoreAssist brand dark blue */
const BRAND_BACKGROUND = "#1e3a5f";

// ─── MAIN FUNCTION ──────────────────────────────────────────────────────────

/**
 * Submit an AI avatar video render job to HeyGen.
 *
 * Pure function — no auth, no database access.
 * Returns the HeyGen render job ID (video_id).
 * HeyGen processes asynchronously; poll or use webhooks for completion.
 * Throws on API error or missing video_id in response.
 */
export async function submitVideo(input: VideoSubmitterInput): Promise<string> {
  const { audioUrl, voiceoverText } = input;

  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    throw new Error("HEYGEN_API_KEY is not configured");
  }

  const avatarId = process.env.HEYGEN_AVATAR_ID ?? HEYGEN_STOCK_AVATAR_ID;

  const payload = {
    video_inputs: [
      {
        character: {
          type: "avatar",
          avatar_id: avatarId,
          avatar_style: "normal",
        },
        voice: {
          type: "audio",
          audio_url: audioUrl,
        },
        background: {
          type: "color",
          value: BRAND_BACKGROUND,
        },
      },
    ],
    aspect_ratio: "9:16",
    caption: false,
    test: false,
  };

  const response = await fetch(`${HEYGEN_API_BASE}/video/generate`, {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = (await response.json()) as HeyGenVideoResponse;

  if (!response.ok || json.error) {
    throw new Error(
      `HeyGen error ${response.status}: ${json.error ?? JSON.stringify(json)}`,
    );
  }

  const videoId = json.data?.video_id;
  if (!videoId) {
    throw new Error("HeyGen response missing video_id");
  }

  return videoId;
}
