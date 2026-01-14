/**
 * Interview Analytics API
 * GET /api/forms/interview/analytics
 * GET /api/forms/interview/analytics?userId=<id>
 * GET /api/forms/interview/analytics?templateId=<id>
 * GET /api/forms/interview/analytics?type=aggregate
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { InterviewAnalyticsService } from '@/lib/forms/analytics'

/**
 * GET /api/forms/interview/analytics
 * Retrieve interview analytics based on query parameters
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const templateId = searchParams.get('templateId')
    const type = searchParams.get('type')

    // Get aggregate statistics
    if (type === 'aggregate') {
      const stats = await InterviewAnalyticsService.getAggregateStatistics()
      return NextResponse.json(stats)
    }

    // Get user-specific analytics
    if (userId) {
      // Security: Users can only see their own analytics unless they're admin
      if (userId !== session.user.id && session.user.role !== 'ADMIN') {
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
    const userAnalytics = await InterviewAnalyticsService.getUserAnalyticsSummary(
      session.user.id
    )
    return NextResponse.json(userAnalytics)
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
