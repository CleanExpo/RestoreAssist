/**
 * Interview Analytics API
 * GET /api/forms/interview/analytics
 * GET /api/forms/interview/analytics?userId=<id>
 * GET /api/forms/interview/analytics?templateId=<id>
 * GET /api/forms/interview/analytics?type=aggregate
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { InterviewAnalyticsService } from '@/lib/forms/analytics'

/**
 * GET /api/forms/interview/analytics
 * Retrieve interview analytics based on query parameters
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from database to get userId
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const templateId = searchParams.get('templateId')
    const type = searchParams.get('type')

    // Get aggregate statistics (user-scoped for dashboard KPIs)
    if (type === 'aggregate') {
      const stats = await InterviewAnalyticsService.getAggregateStatisticsForUser(user.id)
      return NextResponse.json(stats)
    }

    // Get user-specific analytics
    if (userId) {
      // Security: Users can only see their own analytics unless they're admin
      if (userId !== user.id && user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const summary = await InterviewAnalyticsService.getUserAnalyticsSummary(userId)
      return NextResponse.json(summary)
    }

    // Get template performance analytics
    if (templateId) {
      const analytics = await InterviewAnalyticsService.getTemplatePerformanceAnalytics(
        templateId
      )
      return NextResponse.json(analytics)
    }

    // Default: Get current user analytics
    const userAnalytics = await InterviewAnalyticsService.getUserAnalyticsSummary(user.id)
    return NextResponse.json(userAnalytics)
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
