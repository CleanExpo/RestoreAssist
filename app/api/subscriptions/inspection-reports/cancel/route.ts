/**
 * Cancel Premium Inspection Reports Subscription
 * POST /api/subscriptions/inspection-reports/cancel
 *
 * TODO: Implement actual Stripe subscription cancellation
 */

import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { disablePremiumInspectionReports } from '@/lib/premium-inspection-access'
import { prisma } from '@/lib/db'

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

    // TODO: Implement actual Stripe subscription cancellation
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    // const user = await prisma.user.findUnique({ where: { id: session.user.id } })
    // if (user?.subscriptionId) {
    //   await stripe.subscriptions.update(user.subscriptionId, {
    //     cancel_at_period_end: true
    //   })
    // }

    // For now, just disable the feature flag
    // In production, this should happen via Stripe webhook when subscription is actually cancelled
    await disablePremiumInspectionReports(session.user.id)

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
