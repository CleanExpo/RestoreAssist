/**
 * POST /api/videos/[id]/view
 *
 * Records an anonymous viewing session from the CET Capacitor app.
 * No auth required — the CET app has no user session.
 * No PII collected — sessionId is a random UUID generated on the device.
 *
 * Called periodically during playback (e.g. every 10% completion)
 * and on video end.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Verify video exists and is playable
  const video = await prisma.video.findFirst({
    where: { id, status: 'READY' },
    select: { id: true },
  })

  if (!video) {
    return NextResponse.json({ error: 'Video not found or not ready' }, { status: 404 })
  }

  let body: {
    sessionId?: unknown
    completionPercent?: unknown
    deviceType?: unknown
    platform?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const sessionId = String(body.sessionId ?? '').slice(0, 36)
  const completionPercent = Math.min(100, Math.max(0, Number(body.completionPercent) || 0))
  const deviceType = body.deviceType ? String(body.deviceType).slice(0, 32) : null
  const platform = body.platform ? String(body.platform).slice(0, 32) : null

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
  }

  await prisma.videoView.create({
    data: { videoId: id, sessionId, completionPercent, deviceType, platform },
  })

  return NextResponse.json({ ok: true })
}
