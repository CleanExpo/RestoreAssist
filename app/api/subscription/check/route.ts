import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/subscription/check
 *
 * Check user's subscription status and credits
 *
 * @returns {Object} Subscription status information
 * @property {boolean} hasActiveSubscription - Whether user has an active subscription
 * @property {string} subscriptionStatus - Current subscription status (TRIAL, ACTIVE, CANCELED, EXPIRED, PAST_DUE)
 * @property {string} subscriptionTier - Subscription plan/tier name
 * @property {number} creditsRemaining - Number of credits remaining
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Fetch user's subscription data
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        subscriptionStatus: true,
        subscriptionPlan: true,
        creditsRemaining: true,
        subscriptionEndsAt: true,
        trialEndsAt: true,
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    // Determine if subscription is active
    const now = new Date()
    const isTrialActive = user.subscriptionStatus === 'TRIAL' &&
                         user.trialEndsAt &&
                         new Date(user.trialEndsAt) > now

    const isSubscriptionActive = user.subscriptionStatus === 'ACTIVE' &&
                                 (!user.subscriptionEndsAt || new Date(user.subscriptionEndsAt) > now)

    const hasActiveSubscription = isTrialActive || isSubscriptionActive

    // Return subscription status
    return NextResponse.json({
      hasActiveSubscription,
      subscriptionStatus: user.subscriptionStatus || 'TRIAL',
      subscriptionTier: user.subscriptionPlan || 'trial',
      creditsRemaining: user.creditsRemaining ?? 0,
    })
  } catch (error) {
    console.error("Error checking subscription:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
