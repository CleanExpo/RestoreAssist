/**
 * GET    /api/videos/[id]   — get video detail
 * PATCH  /api/videos/[id]   — update title or scriptText
 * DELETE /api/videos/[id]   — delete video
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
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
    include: {
      library: {
        select: { companyName: true, isAnalyticsEnabled: true, brandingMode: true },
      },
    },
  })

  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  }

  return NextResponse.json({ video })
}

// ── PATCH — update script or title ───────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
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
    return NextResponse.json({ error: 'Cannot edit a video that is currently rendering' }, { status: 409 })
  }

  const body = await request.json() as { title?: string; scriptText?: string }

  const updated = await prisma.video.update({
    where: { id },
    data: {
      title: body.title,
      scriptText: body.scriptText,
      // Reset to DRAFT when script is edited — needs re-render
      status: body.scriptText ? 'DRAFT' : undefined,
    },
  })

  return NextResponse.json({ video: updated })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
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
    select: { id: true },
  })
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  }

  await prisma.video.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
