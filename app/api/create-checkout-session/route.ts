import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

// Validation schema
const CheckoutRequestSchema = z.object({
  priceId: z.string().min(1, "Price ID is required"),
})

// Price mapping for backwards compatibility
const PRICE_MAPPING: Record<string, string> = {
  'MONTHLY_PLAN': process.env.STRIPE_PRICE_MONTHLY || 'price_1SK6GPBY5KEPMwxd43EBhwXx',
  'YEARLY_PLAN': process.env.STRIPE_PRICE_YEARLY || 'price_1SK6I7BY5KEPMwxdC451vfBk',
  'FREE_TRIAL': process.env.STRIPE_PRICE_FREE_TRIAL || 'price_1SK6CHBY5KEPMwxdjZxT8CKH',
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      console.error('[Stripe Checkout] Unauthorized request')
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Validate request body
    const body = await request.json()
    const validation = CheckoutRequestSchema.safeParse(body)

    if (!validation.success) {
      console.error('[Stripe Checkout] Validation failed:', validation.error.errors)
      return NextResponse.json({
        error: "Invalid request",
        details: validation.error.errors
      }, { status: 400 })
    }

    let { priceId } = validation.data

    // 3. Map legacy price IDs to actual Stripe price IDs
    if (PRICE_MAPPING[priceId]) {
      console.log(`[Stripe Checkout] Mapping ${priceId} to ${PRICE_MAPPING[priceId]}`)
      priceId = PRICE_MAPPING[priceId]
    }

    // 4. Validate price ID format
    if (!priceId.startsWith('price_')) {
      console.error('[Stripe Checkout] Invalid price ID format:', priceId)
      return NextResponse.json({
        error: "Invalid price ID format. Must start with 'price_'"
      }, { status: 400 })
    }

    // 5. Get or create Stripe customer
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        stripeCustomerId: true,
        email: true,
        name: true
      }
    })

    if (!user) {
      console.error('[Stripe Checkout] User not found:', session.user.id)
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    let customerId = user.stripeCustomerId

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      try {
        console.log('[Stripe Checkout] Creating new Stripe customer for:', user.email)

        const stripeCustomer = await stripe.customers.create({
          email: user.email!,
          name: user.name || undefined,
          metadata: {
            userId: session.user.id,
          },
        })

        customerId = stripeCustomer.id
        console.log('[Stripe Checkout] Created Stripe customer:', customerId)

        // Update user with Stripe customer ID
        await prisma.user.update({
          where: { id: session.user.id },
          data: { stripeCustomerId: customerId }
        })
      } catch (stripeError: any) {
        console.error('[Stripe Checkout] Error creating Stripe customer:', {
          message: stripeError.message,
          type: stripeError.type,
          code: stripeError.code,
          statusCode: stripeError.statusCode,
          userId: session.user.id,
          email: user.email
        })
        return NextResponse.json({
          error: "Failed to create customer",
          details: process.env.NODE_ENV === 'development' ? stripeError.message : undefined
        }, { status: 500 })
      }
    }

    // 6. Verify the price exists in Stripe before creating checkout session
    try {
      const price = await stripe.prices.retrieve(priceId)
      console.log('[Stripe Checkout] Price verified:', {
        priceId: price.id,
        amount: price.unit_amount,
        currency: price.currency,
        type: price.type
      })
    } catch (priceError: any) {
      console.error('[Stripe Checkout] Price not found:', {
        priceId,
        error: priceError.message,
        code: priceError.code
      })
      return NextResponse.json({
        error: "Invalid price ID. Price does not exist in Stripe.",
        details: process.env.NODE_ENV === 'development' ? priceError.message : undefined
      }, { status: 400 })
    }

    // 7. Create checkout session
    const baseUrl = process.env.NEXTAUTH_URL || 'https://restoreassist.app'

    console.log('[Stripe Checkout] Creating checkout session:', {
      customerId,
      priceId,
      userId: session.user.id,
      baseUrl
    })

    let checkoutSession
    try {
      checkoutSession = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer: customerId,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/dashboard/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/dashboard/pricing?canceled=true`,
        metadata: {
          userId: session.user.id,
          priceId: priceId,
        },
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        customer_update: {
          address: 'auto',
          name: 'auto',
        },
        subscription_data: {
          metadata: {
            userId: session.user.id,
          },
        },
      })

      console.log('[Stripe Checkout] Checkout session created:', {
        sessionId: checkoutSession.id,
        url: checkoutSession.url,
        customerId
      })

      return NextResponse.json({
        sessionId: checkoutSession.id,
        url: checkoutSession.url,
        customerId: customerId
      })
    } catch (checkoutError: any) {
      console.error('[Stripe Checkout] Error creating checkout session:', {
        message: checkoutError.message,
        type: checkoutError.type,
        code: checkoutError.code,
        statusCode: checkoutError.statusCode,
        param: checkoutError.param,
        customerId,
        priceId,
        raw: checkoutError.raw
      })

      return NextResponse.json({
        error: "Failed to create checkout session",
        details: process.env.NODE_ENV === 'development' ? checkoutError.message : undefined,
        type: checkoutError.type || 'unknown',
        code: checkoutError.code
      }, { status: 500 })
    }
  } catch (error: any) {
    console.error("[Stripe Checkout] Unexpected error:", {
      message: error.message,
      type: error.type,
      code: error.code,
      statusCode: error.statusCode,
      stack: error.stack,
    })

    return NextResponse.json({
      error: "Internal server error",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      type: error.type || 'unknown'
    }, { status: 500 })
  }
}
