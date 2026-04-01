/**
 * POST /api/content/generate-voice
 *
 * Stage 2 of the content automation pipeline (RA-158).
 * Converts a ContentJob's voiceoverText to MP3 via ElevenLabs, then uploads
 * the audio file to Supabase Storage and stores the public URL on the job.
 *
 * Authentication: session required
 *
 * Request body:
 *   { jobId: string }
 *
 * Response 200:
 *   { audioUrl: string }
 *
 * Response 400: missing jobId or job not in SCRIPT_READY state
 * Response 401: not authenticated
 * Response 404: job not found
 * Response 500: ElevenLabs or Supabase error
 *
 * Env vars required:
 *   ELEVENLABS_API_KEY       — ElevenLabs API key
 *   ELEVENLABS_VOICE_ID      — Voice ID to use for generation
 *   NEXT_PUBLIC_SUPABASE_URL — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key for Storage write
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { createClient } from '@supabase/supabase-js'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─── ELEVENLABS ───────────────────────────────────────────────────────────────

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1'

async function generateVoiceover(text: string, voiceId: string): Promise<Buffer> {
  const url = `${ELEVENLABS_BASE}/text-to-speech/${voiceId}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '',
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

// ─── SUPABASE STORAGE ─────────────────────────────────────────────────────────

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase environment variables are not configured')
  }
  return createClient(url, key)
}

async function uploadAudio(jobId: string, audioBuffer: Buffer): Promise<string> {
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

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { jobId } = (body ?? {}) as Record<string, unknown>

  if (!jobId || typeof jobId !== 'string') {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  }

  try {
    // ── 1. Load and verify job ownership ──────────────────────────────────
    const job = await prisma.contentJob.findFirst({
      where: { id: jobId, userId: session.user.id },
    })

    if (!job) {
      return NextResponse.json({ error: 'ContentJob not found or not owned by user' }, { status: 404 })
    }

    if (!job.voiceoverText) {
      return NextResponse.json(
        { error: 'Job has no voiceoverText — run generate-script first' },
        { status: 400 }
      )
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID
    if (!voiceId) {
      return NextResponse.json({ error: 'ELEVENLABS_VOICE_ID is not configured' }, { status: 500 })
    }

    // ── 2. Generate voiceover via ElevenLabs ──────────────────────────────
    const audioBuffer = await generateVoiceover(job.voiceoverText, voiceId)

    // ── 3. Upload to Supabase Storage ─────────────────────────────────────
    const audioUrl = await uploadAudio(job.id, audioBuffer)

    // ── 4. Update ContentJob ───────────────────────────────────────────────
    await prisma.contentJob.update({
      where: { id: job.id },
      data: {
        audioUrl,
        status: 'VOICE_READY',
      },
    })

    return NextResponse.json({ audioUrl }, { status: 200 })
  } catch (err) {
    console.error('[generate-voice] Error:', err)

    // Attempt to mark job as failed
    try {
      const { jobId: jid } = (body ?? {}) as Record<string, unknown>
      if (jid && typeof jid === 'string') {
        await prisma.contentJob.updateMany({
          where: { id: jid, userId: session.user.id },
          data: {
            status: 'FAILED',
            errorMessage: err instanceof Error ? err.message : 'Unknown error in generate-voice',
          },
        })
      }
    } catch {
      // Swallow secondary DB error to preserve original error response
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
