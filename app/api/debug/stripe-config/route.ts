import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

/**
 * DEBUG ENDPOINT - Shows Stripe configuration
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

  const config = {
    environment: process.env.NODE_ENV,
    stripe: {
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
    },
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || 'NOT SET',
  }

  return NextResponse.json(config, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
  })
}
