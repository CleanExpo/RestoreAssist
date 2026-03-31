/**
 * Voice Generator — Pure function for ElevenLabs TTS + Supabase upload
 *
 * Extracted from app/api/content/generate-voice/route.ts.
 * No session auth, no Prisma — accepts text + voiceId + jobId,
 * returns the public audio URL.
 *
 * @module lib/content-pipeline/voice-generator
 */

import { createClient } from '@supabase/supabase-js'

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface VoiceGeneratorInput {
  text: string
  voiceId: string
  jobId: string
}

// ─── ELEVENLABS ─────────────────────────────────────────────────────────────

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1'

async function callElevenLabs(text: string, voiceId: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured')
  }

  const url = `${ELEVENLABS_BASE}/text-to-speech/${voiceId}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.6,
        similarity_boost: 0.75,
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`ElevenLabs error ${response.status}: ${errorText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// ─── SUPABASE STORAGE ───────────────────────────────────────────────────────

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase environment variables are not configured')
  }
  return createClient(url, key)
}

async function uploadAudioToStorage(
  jobId: string,
  audioBuffer: Buffer
): Promise<string> {
  const supabase = getSupabaseClient()
  const path = `content/audio/${jobId}.mp3`

  const { error } = await supabase.storage
    .from('sketch-media')
    .upload(path, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    })

  if (error) {
    throw new Error(`Supabase upload error: ${error.message}`)
  }

  const { data } = supabase.storage.from('sketch-media').getPublicUrl(path)
  return data.publicUrl
}

// ─── MAIN FUNCTION ──────────────────────────────────────────────────────────

/**
 * Generate a voiceover MP3 via ElevenLabs and upload to Supabase Storage.
 *
 * Pure function — no auth, no database access.
 * Returns the public URL of the uploaded audio file.
 * Throws on ElevenLabs or Supabase errors.
 */
export async function generateVoice(input: VoiceGeneratorInput): Promise<string> {
  const { text, voiceId, jobId } = input

  // 1. Generate audio via ElevenLabs TTS
  const audioBuffer = await callElevenLabs(text, voiceId)

  // 2. Upload to Supabase Storage
  const audioUrl = await uploadAudioToStorage(jobId, audioBuffer)

  return audioUrl
}
