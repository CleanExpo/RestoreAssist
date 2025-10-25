import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        stripeCustomerId: true,
        subscriptionId: true,
        subscriptionStatus: true,
      }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // If user has a Stripe customer ID, check for active subscriptions
    if (user.stripeCustomerId) {
      try {
        // Get all subscriptions for this customer
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'all',
          limit: 10,
        })

        console.log('Found subscriptions for customer:', subscriptions.data.length)

        // Find the most recent active subscription
        const activeSubscription = subscriptions.data.find(sub => 
          sub.status === 'active' || sub.status === 'trialing'
        )

        if (activeSubscription) {
          console.log('Found active subscription:', activeSubscription.id)
          
          // Get price details
          const price = await stripe.prices.retrieve(activeSubscription.items.data[0].price.id)
          
          // Update user subscription in database
          const updatedUser = await prisma.user.update({
            where: { id: session.user.id },
            data: {
              subscriptionStatus: activeSubscription.status === 'active' ? 'ACTIVE' : 'TRIAL',
              subscriptionId: activeSubscription.id,
              subscriptionEndsAt: new Date(activeSubscription.current_period_end * 1000),
              nextBillingDate: new Date(activeSubscription.current_period_end * 1000),
              lastBillingDate: new Date(activeSubscription.current_period_start * 1000),
              creditsRemaining: activeSubscription.status === 'active' ? 999999 : user.creditsRemaining || 3,
              subscriptionPlan: price.nickname || 'Subscription',
            }
          })

          console.log('Updated user subscription:', updatedUser.subscriptionStatus)

          return NextResponse.json({
            success: true,
            subscription: {
              id: activeSubscription.id,
              status: activeSubscription.status,
              currentPeriodStart: activeSubscription.current_period_start,
              currentPeriodEnd: activeSubscription.current_period_end,
              plan: {
                name: price.nickname || 'Subscription',
                amount: price.unit_amount || 0,
                currency: price.currency,
                interval: price.recurring?.interval || 'month',
              },
            }
          })
        } else {
          console.log('No active subscription found')
          return NextResponse.json({
            success: false,
            message: 'No active subscription found'
          })
        }
      } catch (stripeError) {
        console.error('Error checking Stripe subscriptions:', stripeError)
        return NextResponse.json({ 
          error: "Failed to check subscription status",
          details: stripeError instanceof Error ? stripeError.message : 'Unknown error'
        }, { status: 500 })
      }
    } else {
      return NextResponse.json({
        success: false,
        message: 'No Stripe customer ID found'
      })
    }
  } catch (error) {
    console.error("Error checking subscription:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
