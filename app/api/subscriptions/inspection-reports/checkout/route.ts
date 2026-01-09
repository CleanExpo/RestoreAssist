/**
 * Create Stripe Checkout Session for Premium Inspection Reports
 * POST /api/subscriptions/inspection-reports/checkout
 *
 * Creates a Stripe checkout session for $49 AUD/month subscription
 * Handles customer creation/retrieval and returns checkout URL
 */

import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
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

    // Get or create Stripe customer
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeCustomerId: true, email: true }
    })

    let customerId = user?.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user?.email || session.user?.email,
        metadata: { userId: session.user.id }
      })
      customerId = customer.id

      await prisma.user.update({
        where: { id: session.user.id },
        data: { stripeCustomerId: customerId }
      })
    }

    // Get price ID or create dynamically
    const priceId = process.env.STRIPE_PREMIUM_INSPECTION_PRICE_ID
    let finalPriceId = priceId

    if (!priceId) {
      // Fallback: Create price dynamically if not configured
      const price = await stripe.prices.create({
        unit_amount: 4900, // $49.00 AUD
        currency: 'aud',
        recurring: { interval: 'month' },
        product_data: {
          name: 'Premium Inspection Reports',
          description: '3-stakeholder PDF generator with IICRC S500 compliance'
        }
      })
      finalPriceId = price.id
    }

    // Detect base URL from request
    const host = req.headers.get('host')
    const protocol = host?.includes('localhost') ? 'http' : 'https'
    const baseUrl = `${protocol}://${host}`

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [{ price: finalPriceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard/subscriptions/inspection-reports?success=true`,
      cancel_url: `${baseUrl}/dashboard/subscriptions/inspection-reports?canceled=true`,
      metadata: {
        userId: session.user.id,
        type: 'premium_inspection_reports'
      }
    })

    return NextResponse.json({ checkoutUrl: checkoutSession.url })
  } catch (error) {
    console.error('Error creating checkout session:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
