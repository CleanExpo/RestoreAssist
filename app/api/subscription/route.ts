import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const forceRefresh = searchParams.get('refresh') === 'true'

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        subscriptionStatus: true,
        subscriptionPlan: true,
        subscriptionId: true,
        stripeCustomerId: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
        creditsRemaining: true,
        totalCreditsUsed: true,
        lastBillingDate: true,
        nextBillingDate: true,
      }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // If user has a Stripe subscription, get details from Stripe
    if (user.subscriptionId && user.stripeCustomerId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(user.subscriptionId)
        const price = await stripe.prices.retrieve(subscription.items.data[0].price.id)

        // Update database with latest subscription data
        await prisma.user.update({
          where: { id: session.user.id },
          data: {
            subscriptionStatus: subscription.status === 'active' ? 'ACTIVE' : 
                              subscription.status === 'canceled' ? 'CANCELED' : 
                              subscription.status === 'past_due' ? 'PAST_DUE' : 'EXPIRED',
            subscriptionEndsAt: new Date(subscription.current_period_end * 1000),
            nextBillingDate: new Date(subscription.current_period_end * 1000),
            lastBillingDate: new Date(subscription.current_period_start * 1000),
            // Don't set creditsRemaining for active subscriptions - they use monthly limits
          }
        })

        return NextResponse.json({
          subscription: {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: subscription.current_period_start,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            plan: {
              name: price.nickname || user.subscriptionPlan || 'Subscription',
              amount: price.unit_amount || 0,
              currency: price.currency,
              interval: price.recurring?.interval || 'month',
            },
          },
        })
      } catch (stripeError) {
        console.error("Error fetching Stripe subscription:", stripeError)
        // Fall back to database data
      }
    }

    // Return database subscription data
    return NextResponse.json({
      subscription: user.subscriptionStatus !== 'TRIAL' ? {
        id: user.subscriptionId,
        status: user.subscriptionStatus.toLowerCase(),
        currentPeriodStart: user.lastBillingDate ? Math.floor(new Date(user.lastBillingDate).getTime() / 1000) : null,
        currentPeriodEnd: user.nextBillingDate ? Math.floor(new Date(user.nextBillingDate).getTime() / 1000) : null,
        cancelAtPeriodEnd: user.subscriptionStatus === 'CANCELED',
        plan: {
          name: user.subscriptionPlan || 'Subscription',
          amount: 0,
          currency: 'AUD',
          interval: 'month',
        },
      } : null
    })
  } catch (error) {
    console.error("Error fetching subscription:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
