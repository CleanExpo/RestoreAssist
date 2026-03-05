import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { PRICING_CONFIG } from "@/lib/pricing"
import { LIFETIME_PRICING_EMAIL } from "@/lib/lifetime-pricing"

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
        subscriptionId: true,
        lifetimeAccess: true,
        subscriptionStatus: true,
        subscriptionPlan: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Lifetime one-time payers have no Stripe subscription; treat as active
    if (user.lifetimeAccess || (user.subscriptionStatus === 'ACTIVE' && user.subscriptionPlan === 'Lifetime')) {
      return NextResponse.json({
        success: true,
        subscription: {
          status: 'ACTIVE',
          plan: 'Lifetime',
          creditsRemaining: 999999
        }
      })
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

        // Calculate monthly reset date (first day of next month)
        const now = new Date()
        const nextReset = new Date(now)
        nextReset.setMonth(nextReset.getMonth() + 1)
        nextReset.setDate(1)
        nextReset.setHours(0, 0, 0, 0)

        // Check if this is the user's first subscription (signup bonus eligibility)
        const userBefore = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            subscriptionStatus: true,
            lastBillingDate: true,
            addonReports: true
          }
        })
        
        // Check if signupBonusApplied field exists (may not exist if migration not run)
        let signupBonusApplied = false
        try {
          const userWithBonus = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
              signupBonusApplied: true
            }
          })
          signupBonusApplied = userWithBonus?.signupBonusApplied || false
        } catch (e) {
          // Field doesn't exist yet, assume false
          signupBonusApplied = false
        }
        
        // Determine if this is first-time subscription (never had ACTIVE status before)
        const isFirstSubscription = !signupBonusApplied && 
                                  (userBefore?.subscriptionStatus !== 'ACTIVE' || !userBefore?.lastBillingDate)

        // Prepare update data
        const updateData: any = {
            subscriptionStatus: 'ACTIVE',
            subscriptionPlan: subscriptionPlan,
            stripeCustomerId: customerId,
            subscriptionId: activeSubscription.id,
            subscriptionEndsAt: new Date(activeSubscription.current_period_end * 1000),
            nextBillingDate: new Date(activeSubscription.current_period_end * 1000),
            lastBillingDate: new Date(activeSubscription.current_period_start * 1000),
          monthlyReportsUsed: 0,
          monthlyResetDate: nextReset,
          // Don't set creditsRemaining for active subscriptions - they use monthly limits
        }
        
        // Grant signup bonus (10 reports) if first subscription
        // Note: signupBonusApplied field will be set after migration is run
        if (isFirstSubscription) {
          const currentAddonReports = userBefore?.addonReports || 0
          updateData.addonReports = currentAddonReports + 10
        }

        // Update user subscription in database
        const updatedUser = await prisma.user.update({
          where: { id: session.user.id },
          data: updateData
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
        // Fallback: lifetime one-time payer — webhook/verify may not have run yet
        if (user.email === LIFETIME_PRICING_EMAIL && customerId) {
          try {
            const sessions = await stripe.checkout.sessions.list({
              customer: customerId,
              limit: 10
            })
            const lifetimePaid = sessions.data.find(
              s => s.mode === 'payment' && s.metadata?.type === 'lifetime' && s.payment_status === 'paid'
            )
            if (lifetimePaid) {
              await prisma.user.update({
                where: { id: user.id },
                data: {
                  lifetimeAccess: true,
                  subscriptionStatus: 'ACTIVE',
                  subscriptionPlan: 'Lifetime',
                  creditsRemaining: 999999
                }
              })
              return NextResponse.json({
                success: true,
                subscription: { status: 'ACTIVE', plan: 'Lifetime', creditsRemaining: 999999 }
              })
            }
          } catch (e) {
            console.error('Error checking lifetime checkout:', e)
          }
        }
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

