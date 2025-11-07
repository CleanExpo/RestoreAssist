import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      console.error('[Customer Portal] Unauthorized request')
      return NextResponse.json(
        { error: "You must be logged in to access the customer portal" },
        { status: 401 }
      )
    }

    console.log('[Customer Portal] Creating portal session for user:', session.user.id)

    // 2. Get user's Stripe customer ID
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        stripeCustomerId: true,
        email: true,
        name: true
      }
    })

    if (!user) {
      console.error('[Customer Portal] User not found in database')
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    let customerId = user.stripeCustomerId

    // 3. Create Stripe customer if they don't have one
    if (!customerId) {
      console.log('[Customer Portal] User has no Stripe customer ID, creating one')

      try {
        const stripeCustomer = await stripe.customers.create({
          email: user.email!,
          name: user.name || undefined,
          metadata: {
            userId: session.user.id,
          },
        })

        customerId = stripeCustomer.id

        // Update user with new Stripe customer ID
        await prisma.user.update({
          where: { id: session.user.id },
          data: { stripeCustomerId: customerId }
        })

        console.log('[Customer Portal] Created Stripe customer:', customerId)
      } catch (error: any) {
        console.error('[Customer Portal] Failed to create Stripe customer:', error.message)
        return NextResponse.json(
          { error: "Failed to create customer account" },
          { status: 500 }
        )
      }
    }

    // 4. Determine return URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
                    request.headers.get('origin') ||
                    `https://${request.headers.get('host')}`

    const returnUrl = `${baseUrl}/dashboard/subscription`

    console.log('[Customer Portal] Creating portal session with return URL:', returnUrl)

    // 5. Create Stripe Customer Portal session
    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      })

      console.log('[Customer Portal] Portal session created:', portalSession.id)

      return NextResponse.json({
        url: portalSession.url
      })
    } catch (error: any) {
      console.error('[Customer Portal] Failed to create portal session:', {
        error: error.message,
        type: error.type,
        code: error.code,
        customerId
      })

      return NextResponse.json(
        {
          error: "Failed to create customer portal session",
          details: error.message
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('[Customer Portal] Unexpected error:', {
      message: error.message,
      stack: error.stack
    })

    return NextResponse.json(
      {
        error: "An unexpected error occurred",
        details: error.message
      },
      { status: 500 }
    )
  }
}
