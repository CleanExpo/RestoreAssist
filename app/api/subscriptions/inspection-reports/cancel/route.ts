/**
 * Cancel Premium Inspection Reports Subscription
 * POST /api/subscriptions/inspection-reports/cancel
 *
 * Cancels subscription at period end (user keeps access until then)
 */

import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Stripe is not configured' },
        { status: 500 }
      )
    }

    // Get user's subscription ID
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionId: true }
    })

    if (!user?.subscriptionId) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 }
      )
    }

    // Cancel subscription at period end (user keeps access until then)
    await stripe.subscriptions.update(user.subscriptionId, {
      cancel_at_period_end: true
    })

    return NextResponse.json({
      status: 'success',
      message: 'Subscription cancellation requested',
      note: 'Your premium access will continue until the end of your current billing period',
    })
  } catch (error) {
    console.error('Error cancelling subscription:', error)
    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    )
  }
}
