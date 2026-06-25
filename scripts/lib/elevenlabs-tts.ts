/**
 * Shared ElevenLabs TTS helper. SSOT for voice settings so the bulk generator
 * (scripts/generate-narration.ts) and one-off generators stay in lock-step.
 */
import fs from "fs/promises";

export interface TtsBody {
  text: string;
  model_id: string;
  voice_settings: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  };
}

export function buildTtsBody(text: string): TtsBody {
  return {
    text,
    model_id: "eleven_multilingual_v2",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    },
  };
}

export async function generateAudio(
  text: string,
  outputPath: string,
  opts: { apiKey: string; voiceId: string },
): Promise<void> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": opts.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(buildTtsBody(text)),
    },
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
}
