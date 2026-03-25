/**
 * POST /api/videos/[id]/render
 *
 * Triggers an async Remotion Lambda render for a video.
 * Returns 202 immediately — the render runs in the background.
 * Dashboard polls GET /api/videos/[id] every 10s to check status.
 *
 * The render pipeline: ElevenLabs TTS → Remotion Lambda → Cloudinary → DB update
 * Estimated time: 30-90 seconds for a 90-second video (2048MB Lambda config)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { composeVideo } from '@/lib/video-generation/video-composer'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id } = await params

  const video = await prisma.video.findFirst({
    where: { id, library: { userId: session.user.id } },
    select: { id: true, status: true },
  })

  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  }

  if (video.status === 'RENDERING') {
    return NextResponse.json(
      { error: 'This video is already rendering. Please wait for it to complete.' },
      { status: 409 }
    )
  }

  // Fire-and-forget — do NOT await. Response returns 202 immediately.
  composeVideo(id).catch(err => {
    console.error(`[CET Render] Video ${id} failed:`, err)
  })

  return NextResponse.json(
    { message: 'Render started. Check video status in a few minutes.' },
    { status: 202 }
  )
}
