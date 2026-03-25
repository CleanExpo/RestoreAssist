/**
 * GET /api/videos/[id]/qr
 *
 * Returns a PNG QR code image for the video's public share link.
 * Only works for videos with isShareable=true and status=READY.
 *
 * The QR code encodes: https://restoreassist.com.au/watch/[shareToken]
 * Clients scan this on their phone BEFORE the tech arrives, or during the inspection.
 *
 * Requires: npm install qrcode && npm install --save-dev @types/qrcode
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import QRCode from 'qrcode'

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
    where: {
      id,
      isShareable: true,
      status: 'READY',
      library: { userId: session.user.id },
    },
    select: { shareToken: true, title: true },
  })

  if (!video?.shareToken) {
    return NextResponse.json(
      { error: 'Video not found, not shareable, or not yet rendered' },
      { status: 404 }
    )
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://restoreassist.com.au'
  const watchUrl = `${baseUrl}/watch/${video.shareToken}`

  const pngBuffer = await QRCode.toBuffer(watchUrl, {
    type: 'png',
    width: 400,
    margin: 2,
    color: {
      dark: '#050505',   // OLED black dots
      light: '#FFFFFF',  // White background
    },
    errorCorrectionLevel: 'M',
  })

  return new NextResponse(pngBuffer, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="qr-${video.shareToken}.png"`,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
    },
  })
}
