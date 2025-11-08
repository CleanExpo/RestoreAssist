import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"

export const dynamic = 'force-dynamic'

/**
 * DEBUG ENDPOINT - Shows Stripe configuration and tests connectivity
 * DELETE THIS FILE after debugging!
 *
 * Visit: https://restoreassist.app/api/debug/stripe-config
 */
export async function GET() {
  // Only allow authenticated users
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Only allow your email (security measure)
  if (session.user.email !== "phill.mcgurk@gmail.com") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    user: {
      id: session.user.id,
      email: session.user.email,
    },
    checks: {}
  }

  // 1. Database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`
    const userCount = await prisma.user.count()
    diagnostics.checks.database = {
      status: "success",
      connected: true,
      userCount,
      databaseUrl: process.env.DATABASE_URL ? 'set (pooled)' : 'not set',
      directUrl: process.env.DIRECT_URL ? 'set (direct)' : 'not set',
    }
  } catch (error: any) {
    diagnostics.checks.database = {
      status: "error",
      error: error.message,
      code: error.code,
    }
  }

  // 2. Stripe configuration
  diagnostics.checks.stripe = {
    secretKey: {
      exists: !!process.env.STRIPE_SECRET_KEY,
      mode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' :
            process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'TEST' : 'UNKNOWN',
      prefix: process.env.STRIPE_SECRET_KEY?.substring(0, 12) + '...',
    },
    publishableKey: {
      exists: !!process.env.STRIPE_PUBLISHABLE_KEY,
      mode: process.env.STRIPE_PUBLISHABLE_KEY?.startsWith('pk_live_') ? 'LIVE' :
            process.env.STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_') ? 'TEST' : 'UNKNOWN',
      prefix: process.env.STRIPE_PUBLISHABLE_KEY?.substring(0, 12) + '...',
    },
    nextPublicKey: {
      exists: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      value: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    },
    webhookSecret: {
      exists: !!process.env.STRIPE_WEBHOOK_SECRET,
      prefix: process.env.STRIPE_WEBHOOK_SECRET?.substring(0, 12) + '...',
    },
    priceIds: {
      freeTrial: process.env.STRIPE_PRICE_FREE_TRIAL || 'NOT SET',
      monthly: process.env.STRIPE_PRICE_MONTHLY || 'NOT SET',
      yearly: process.env.STRIPE_PRICE_YEARLY || 'NOT SET',
    },
  }

  // 3. Stripe API connectivity
  try {
    const account = await stripe.account.retrieve()
    diagnostics.checks.stripeApi = {
      status: "success",
      accountId: account.id,
      country: account.country,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    }

    // Test price retrieval
    const prices = []
    for (const [name, priceId] of Object.entries(diagnostics.checks.stripe.priceIds)) {
      if (priceId && priceId !== 'NOT SET') {
        try {
          const price = await stripe.prices.retrieve(priceId as string)
          prices.push({
            name,
            id: price.id,
            active: price.active,
            livemode: price.livemode,
            amount: price.unit_amount,
            currency: price.currency,
          })
        } catch (priceError: any) {
          prices.push({
            name,
            id: priceId,
            error: priceError.message,
          })
        }
      }
    }
    diagnostics.checks.stripePrices = prices

  } catch (error: any) {
    diagnostics.checks.stripeApi = {
      status: "error",
      error: error.message,
      type: error.type,
      code: error.code,
    }
  }

  // 4. Test checkout session creation
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        stripeCustomerId: true,
        email: true,
      }
    })

    let customerId = user?.stripeCustomerId

    if (!customerId) {
      // Create test customer
      const customer = await stripe.customers.create({
        email: session.user.email!,
        metadata: { test: 'diagnostic', userId: session.user.id },
      })
      customerId = customer.id
      diagnostics.checks.testCustomer = {
        created: true,
        customerId: customer.id,
      }
    } else {
      diagnostics.checks.testCustomer = {
        existing: true,
        customerId,
      }
    }

    // Try creating a checkout session
    const testSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_MONTHLY!,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXTAUTH_URL || 'https://restoreassist.app'}/dashboard/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL || 'https://restoreassist.app'}/dashboard/pricing?canceled=true`,
      metadata: {
        test: 'diagnostic',
        userId: session.user.id,
      },
    })

    diagnostics.checks.checkoutSession = {
      status: "success",
      sessionId: testSession.id,
      url: testSession.url,
      mode: testSession.mode,
    }

  } catch (error: any) {
    diagnostics.checks.checkoutSession = {
      status: "error",
      error: error.message,
      type: error.type,
      code: error.code,
      param: error.param,
    }
  }

  diagnostics.checks.environment = {
    nodeEnv: process.env.NODE_ENV,
    nextauthUrl: process.env.NEXTAUTH_URL || 'not set',
    nextauthSecret: process.env.NEXTAUTH_SECRET ? 'set' : 'not set',
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || 'not set',
  }

  return NextResponse.json(diagnostics, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
  })
}
