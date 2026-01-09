/**
 * Get Premium Inspection Reports Subscription Status
 * GET /api/subscriptions/inspection-reports/status
 */

import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getPremiumStatus } from '@/lib/premium-inspection-access'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const status = await getPremiumStatus(session.user.id)

    return NextResponse.json(status)
  } catch (error) {
    console.error('Error fetching subscription status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subscription status' },
      { status: 500 }
    )
  }
}
