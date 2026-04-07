/**
 * generate-voiceover.ts
 * Calls the ElevenLabs TTS API and saves the MP3 to public/voiceovers/{slug}.mp3
 */

import fs from "fs";
import path from "path";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export interface VoicoverOptions {
  /** Text content to convert to speech */
  text: string;
  /** ElevenLabs voice ID */
  voiceId: string;
  /** Output file slug — saved to public/voiceovers/{slug}.mp3 */
  slug: string;
  /** Override output directory (default: <repo-root>/public/voiceovers) */
  outputDir?: string;
}

export interface VoiceoverResult {
  outputPath: string;
  durationEstimateSeconds: number;
}

interface ElevenLabsVoiceSettings {
  stability: number;
  similarity_boost: number;
}

interface ElevenLabsTTSRequest {
  text: string;
  model_id: string;
  voice_settings: ElevenLabsVoiceSettings;
}

/**
 * Generate a voiceover MP3 from the supplied text using ElevenLabs TTS.
 * Requires ELEVENLABS_API_KEY environment variable.
 */
export async function generateVoiceover(
  options: VoicoverOptions,
): Promise<VoiceoverResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ELEVENLABS_API_KEY environment variable. " +
        "Set it in your .env.local file or system environment.",
    );
  }

  const { text, voiceId, slug, outputDir } = options;

  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../..",
  );
  const targetDir = outputDir ?? path.join(repoRoot, "public", "voiceovers");
  fs.mkdirSync(targetDir, { recursive: true });

  const outputPath = path.join(targetDir, `${slug}.mp3`);

  const body: ElevenLabsTTSRequest = {
    text,
    model_id: "eleven_turbo_v2",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.8,
    },
  };

  console.log(
    `[voiceover] Calling ElevenLabs TTS for voice=${voiceId}, slug=${slug}...`,
  );

  const response = await fetch(
    `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputPath, buffer);

  // Rough estimate: average spoken word rate is ~130 words/minute
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const durationEstimateSeconds = Math.round((wordCount / 130) * 60);

  console.log(
    `[voiceover] Saved to ${outputPath} (~${durationEstimateSeconds}s estimated)`,
  );

  return { outputPath, durationEstimateSeconds };
}
