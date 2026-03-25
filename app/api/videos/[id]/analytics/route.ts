/**
 * GET /api/videos/[id]/analytics
 *
 * Returns aggregate viewing analytics for a video.
 * Requires VideoLibrary.isAnalyticsEnabled = true.
 * Returns 402 with upgradeRequired=true if analytics not enabled.
 *
 * Add-on pricing: $33/month (launch) — controlled via isAnalyticsEnabled flag.
 * Wire to Stripe subscription webhook to toggle this flag automatically.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
    select: {
      id: true,
      title: true,
      durationSeconds: true,
      library: { select: { isAnalyticsEnabled: true } },
    },
  })

  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  }

  // Gate: analytics is an add-on feature ($33/month)
  if (!video.library.isAnalyticsEnabled) {
    return NextResponse.json(
      {
        error: 'Analytics is not enabled for your account.',
        upgradeRequired: true,
        upgradeMessage: 'Add the Analytics add-on ($33/month) in Settings → Subscription to access detailed viewing data.',
      },
      { status: 402 }
    )
  }

  const views = await prisma.videoView.findMany({
    where: { videoId: id },
    orderBy: { viewedAt: 'desc' },
    select: { sessionId: true, completionPercent: true, deviceType: true, platform: true, viewedAt: true },
  })

  const totalViews = views.length
  const uniqueSessions = new Set(views.map(v => v.sessionId)).size
  const avgCompletion =
    totalViews > 0
      ? Math.round(views.reduce((sum, v) => sum + v.completionPercent, 0) / totalViews)
      : 0

  // Completion buckets: 0-25%, 26-50%, 51-75%, 76-100%
  const completionBuckets = {
    '0-25': views.filter(v => v.completionPercent <= 25).length,
    '26-50': views.filter(v => v.completionPercent > 25 && v.completionPercent <= 50).length,
    '51-75': views.filter(v => v.completionPercent > 50 && v.completionPercent <= 75).length,
    '76-100': views.filter(v => v.completionPercent > 75).length,
  }

  // Fully watched (>=90%) — strong engagement metric
  const fullyWatched = views.filter(v => v.completionPercent >= 90).length

  // Views by day (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentViews = views.filter(v => v.viewedAt > thirtyDaysAgo)
  const viewsByDay: Record<string, number> = {}
  for (const view of recentViews) {
    const day = view.viewedAt.toISOString().split('T')[0]
    viewsByDay[day] = (viewsByDay[day] ?? 0) + 1
  }

  return NextResponse.json({
    videoId: id,
    title: video.title,
    totalViews,
    uniqueSessions,
    avgCompletion,
    fullyWatched,
    completionBuckets,
    viewsByDay,
    recentViews: recentViews.slice(0, 50), // Last 50 view events
  })
}
