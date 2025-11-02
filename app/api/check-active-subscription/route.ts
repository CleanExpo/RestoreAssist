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
        id: true,
        email: true,
        stripeCustomerId: true,
        subscriptionId: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    let customerId = user.stripeCustomerId

    // If no customer ID, try to find customer by email
    if (!customerId) {
      try {
        const customers = await stripe.customers.list({
          email: user.email!,
          limit: 1
        })
        if (customers.data.length > 0) {
          customerId = customers.data[0].id
          // Update user with customer ID
          await prisma.user.update({
            where: { id: user.id },
            data: { stripeCustomerId: customerId }
          })
        }
      } catch (error) {
        console.error('Error finding customer:', error)
      }
    }

    if (!customerId) {
      return NextResponse.json({ error: "No Stripe customer found" }, { status: 404 })
    }

    // Find active subscriptions for this customer
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 10
      })

      // Find the most recent active subscription
      const activeSubscription = subscriptions.data
        .filter(sub => sub.status === 'active' || sub.status === 'trialing')
        .sort((a, b) => b.created - a.created)[0]

      if (activeSubscription && activeSubscription.status === 'active') {
        // Determine subscription plan from price
        let subscriptionPlan = 'Monthly Plan' // Default
        if (activeSubscription.items.data[0]?.price) {
          const price = activeSubscription.items.data[0].price
          if (price.recurring?.interval === 'year') {
            subscriptionPlan = 'Yearly Plan'
          } else {
            subscriptionPlan = 'Monthly Plan'
          }
        }

        // Update user subscription in database
        const updatedUser = await prisma.user.update({
          where: { id: session.user.id },
          data: {
            subscriptionStatus: 'ACTIVE',
            subscriptionPlan: subscriptionPlan,
            stripeCustomerId: customerId,
            subscriptionId: activeSubscription.id,
            subscriptionEndsAt: new Date(activeSubscription.current_period_end * 1000),
            nextBillingDate: new Date(activeSubscription.current_period_end * 1000),
            lastBillingDate: new Date(activeSubscription.current_period_start * 1000),
            creditsRemaining: 999999, // Unlimited for paid plans
          }
        })

        return NextResponse.json({
          success: true,
          subscription: {
            status: updatedUser.subscriptionStatus,
            plan: updatedUser.subscriptionPlan,
            creditsRemaining: updatedUser.creditsRemaining
          }
        })
      } else {
        return NextResponse.json({ 
          error: "No active subscription found",
          foundSubscriptions: subscriptions.data.length
        }, { status: 404 })
      }
    } catch (stripeError: any) {
      console.error('Error checking subscriptions:', stripeError)
      return NextResponse.json(
        { error: stripeError.message || "Failed to check subscriptions" },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("Error checking subscription:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

