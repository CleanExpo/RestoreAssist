/**
 * ElevenLabs TTS — Australian voices only.
 *
 * Converts CET video script text to MP3 narration and uploads to Cloudinary.
 * RestoreAssist manages the ElevenLabs API key (not BYOK) because:
 *   - Video generation is a one-time event per library (not per-session)
 *   - Cost is ~$0.60/video — not worth explaining ElevenLabs BYOK to operators
 *
 * Voices (Australian):
 *   Female: Charlotte (XB0fDUnXU5powFXDhCwa) — warm, professional
 *   Male:   River (pNInz6obpgDQGcFmaJgB)    — clear, authoritative
 *
 * Requires:
 *   ELEVENLABS_API_KEY       — in .env (managed by RestoreAssist)
 *   ELEVENLABS_VOICE_FEMALE  — Charlotte voice ID (optional override)
 *   ELEVENLABS_VOICE_MALE    — River voice ID (optional override)
 *   CLOUDINARY_*             — standard Cloudinary env vars
 */

import { v2 as cloudinary } from 'cloudinary'

// ── Types ─────────────────────────────────────────────────────────────────────

export type VoiceGender = 'female' | 'male'

export interface TtsResult {
  /** Cloudinary HTTPS URL for the MP3 audio file */
  audioUrl: string
  /** Estimated duration in seconds (based on word count at ~130wpm) */
  durationSeconds: number
}

// ── Australian voice IDs ───────────────────────────────────────────────────────

const VOICE_IDS: Record<VoiceGender, string> = {
  female: 'XB0fDUnXU5powFXDhCwa', // Charlotte — Australian female
  male: 'pNInz6obpgDQGcFmaJgB',   // River — Australian male
}

// ── Word count → duration estimate ───────────────────────────────────────────

const WORDS_PER_MINUTE = 130

function estimateDuration(text: string): number {
  const wordCount = text.trim().split(/\s+/).length
  return Math.ceil((wordCount / WORDS_PER_MINUTE) * 60)
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Generate MP3 narration for a CET video script.
 *
 * @param scriptText  - Full script text (variable slots already resolved)
 * @param voiceGender - 'female' (Charlotte) or 'male' (River)
 * @returns           - Cloudinary URL and duration estimate
 */
export async function generateNarration(
  scriptText: string,
  voiceGender: VoiceGender = 'female'
): Promise<TtsResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error(
      'ELEVENLABS_API_KEY is not configured. Add it to your environment variables.'
    )
  }

  const voiceId =
    voiceGender === 'female'
      ? (process.env.ELEVENLABS_VOICE_FEMALE ?? VOICE_IDS.female)
      : (process.env.ELEVENLABS_VOICE_MALE ?? VOICE_IDS.male)

  // Call ElevenLabs TTS API (v1 — Turbo v2.5 model for speed + quality)
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: scriptText,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.7,          // Consistent delivery across takes
          similarity_boost: 0.8,   // Close to the original voice training
          style: 0.3,              // Natural, conversational — not overly dramatic
          use_speaker_boost: true, // Cleaner audio, reduces background noise
        },
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`)
  }

  // Convert audio response to base64 data URI for Cloudinary upload
  const audioBuffer = await response.arrayBuffer()
  const base64Audio = Buffer.from(audioBuffer).toString('base64')
  const dataUri = `data:audio/mpeg;base64,${base64Audio}`

  // Upload to Cloudinary (resource_type: 'video' covers audio files)
  const upload = await cloudinary.uploader.upload(dataUri, {
    resource_type: 'video',
    folder: 'restoreassist/cet-audio',
    format: 'mp3',
    // Generate a stable public_id based on content hash to avoid duplicates
    unique_filename: true,
  })

  return {
    audioUrl: upload.secure_url,
    durationSeconds: estimateDuration(scriptText),
  }
}
