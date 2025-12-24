import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { PRICING_CONFIG } from "@/lib/pricing"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 })
    }

    try {
      // Retrieve the checkout session from Stripe
      const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId as string, {
        expand: ['subscription']
      })

      // Verify this session belongs to the current user
      // Check both metadata userId and customer email
      const userId = checkoutSession.metadata?.userId
      const customerEmail = checkoutSession.customer_email || (checkoutSession.customer_details?.email)
      
      // Allow if userId matches OR if customer email matches current user's email
      const isValid = (userId && userId === session.user.id) || 
                     (customerEmail && customerEmail === session.user.email)
      
      if (!isValid) {
        console.error('Session validation failed:', {
          metadataUserId: userId,
          sessionUserId: session.user.id,
          customerEmail: customerEmail,
          userEmail: session.user.email
        })
        return NextResponse.json({ error: "Invalid session" }, { status: 403 })
      }

      // Check if payment was successful
      if (checkoutSession.payment_status !== 'paid') {
        return NextResponse.json({ 
          error: "Payment not completed",
          payment_status: checkoutSession.payment_status
        }, { status: 400 })
      }

      // Get subscription details
      let subscriptionId = checkoutSession.subscription
      if (typeof subscriptionId === 'object' && subscriptionId) {
        subscriptionId = subscriptionId.id
      }

      if (!subscriptionId) {
        return NextResponse.json({ error: "No subscription found" }, { status: 400 })
      }

      // Retrieve full subscription details from Stripe
      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId as string)
      
      // Determine subscription plan from price
      let subscriptionPlan = 'Monthly Plan' // Default
      if (stripeSubscription.items.data[0]?.price) {
        const price = stripeSubscription.items.data[0].price
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
          stripeCustomerId: checkoutSession.customer as string,
          subscriptionId: subscriptionId as string,
          subscriptionEndsAt: new Date(stripeSubscription.current_period_end * 1000),
          nextBillingDate: new Date(stripeSubscription.current_period_end * 1000),
          lastBillingDate: new Date(stripeSubscription.current_period_start * 1000),
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
    } catch (stripeError: any) {
      console.error('Error verifying subscription:', stripeError)
      return NextResponse.json(
        { error: stripeError.message || "Failed to verify subscription" },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("Error verifying subscription:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

