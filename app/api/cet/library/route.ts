/**
 * GET /api/cet/library?token=[cetToken]
 *
 * Public endpoint used by the CET Capacitor app on device startup.
 * No auth — uses a cetToken (stored on the iPad during device setup).
 *
 * Returns all READY videos for the library, ordered by sortOrder.
 * The CET app uses this to build the video grid and pre-download MP4s.
 *
 * The cetToken is generated when the video library is set up and can be
 * rotated from the dashboard. It is entered once on the CET iPad via QR scan.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token || token.length < 8) {
    return NextResponse.json(
      { error: 'token query parameter is required' },
      { status: 400 }
    )
  }

  const library = await prisma.videoLibrary.findFirst({
    where: { cetToken: token },
    select: {
      id: true,
      companyName: true,
      logoUrl: true,
      primaryColour: true,
      brandingMode: true,
      videos: {
        where: { status: 'READY' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          title: true,
          category: true,
          videoUrl: true,
          thumbnailUrl: true,
          durationSeconds: true,
          sortOrder: true,
        },
      },
    },
  })

  if (!library) {
    return NextResponse.json(
      { error: 'Library not found. Check the CET token on your device.' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    library: {
      companyName: library.companyName,
      logoUrl: library.logoUrl,
      primaryColour: library.primaryColour ?? '#00F5FF',
    },
    videos: library.videos,
  })
}
