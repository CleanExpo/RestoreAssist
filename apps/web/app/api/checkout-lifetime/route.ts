import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { applyRateLimit } from "@/lib/rate-limiter"
import { LIFETIME_PRICING_EMAIL, LIFETIME_AMOUNT_CENTS, LIFETIME_PLAN_NAME } from "@/lib/lifetime-pricing"

function getBaseUrl(request: NextRequest): string {
  let baseUrl = process.env.NEXTAUTH_URL
  if (!baseUrl) {
    const origin = request.headers.get('origin')
    const host = request.headers.get('host')
    if (origin) baseUrl = origin
    else if (host) {
      const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
      baseUrl = `${protocol}://${host}`
    } else baseUrl = 'http://localhost:3000'
  }
  return baseUrl
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.user.email.toLowerCase() !== LIFETIME_PRICING_EMAIL.toLowerCase()) {
      return NextResponse.json({ error: "This offer is not available for your account." }, { status: 403 })
    }

    const rateLimited = applyRateLimit(request, { maxRequests: 10, prefix: "checkout-lifetime", key: session.user.id })
    if (rateLimited) return rateLimited

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeCustomerId: true, lifetimeAccess: true }
    })

    if (user?.lifetimeAccess) {
      return NextResponse.json({ error: "You already have lifetime access." }, { status: 400 })
    }

    let customerId = user?.stripeCustomerId
    if (!customerId) {
      const stripeCustomer = await stripe.customers.create({
        email: session.user.email,
        name: session.user.name || undefined,
        metadata: { userId: session.user.id },
      })
      customerId = stripeCustomer.id
      await prisma.user.update({
        where: { id: session.user.id },
        data: { stripeCustomerId: customerId }
      })
    }

    const baseUrl = getBaseUrl(request)

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: 'aud',
            unit_amount: LIFETIME_AMOUNT_CENTS,
            product_data: {
              name: `${LIFETIME_PLAN_NAME} - RestoreAssist`,
              description: 'One-time lifetime access. No monthly fee.',
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/dashboard/success?lifetime=1`,
      cancel_url: `${baseUrl}/dashboard/pricing?canceled=true`,
      metadata: {
        userId: session.user.id,
        type: 'lifetime',
      },
    })

    return NextResponse.json({
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    })
  } catch (error) {
    console.error("Checkout lifetime error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
