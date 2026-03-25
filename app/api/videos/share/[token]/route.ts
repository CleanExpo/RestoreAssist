/**
 * GET /api/videos/share/[token]
 *
 * Public endpoint — no auth required.
 * Resolves a QR share token to the video metadata for the public watch page.
 * Used by /watch/[token] page to render the video player.
 *
 * Only returns READY + isShareable videos.
 * Also increments view count via the /view route (called separately from the frontend).
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const video = await prisma.video.findFirst({
    where: {
      shareToken: token,
      status: 'READY',
      isShareable: true,
    },
    select: {
      id: true,
      title: true,
      description: true,
      videoUrl: true,
      thumbnailUrl: true,
      durationSeconds: true,
      category: true,
      contentSources: true,
      library: {
        select: {
          companyName: true,
          logoUrl: true,
          brandingMode: true,
          primaryColour: true,
        },
      },
    },
  })

  if (!video) {
    return NextResponse.json(
      { error: 'Video not found. The link may have expired or the video is not yet ready.' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    video: {
      id: video.id,
      title: video.title,
      description: video.description,
      videoUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl,
      durationSeconds: video.durationSeconds,
      companyName: video.library.companyName,
      primaryColour: video.library.primaryColour ?? '#00F5FF',
      sources: video.contentSources ? JSON.parse(video.contentSources) : [],
    },
  })
}
