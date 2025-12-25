import { NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import Stripe from "stripe"
import { PRICING_CONFIG } from "@/lib/pricing"

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = headers().get("stripe-signature")

  if (!signature) {
    console.error('No signature provided')
    return NextResponse.json({ error: "No signature" }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error("Webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object as Stripe.Checkout.Session
        
        // Handle add-on purchases (one-time payments)
        if (session.mode === 'payment' && session.metadata?.type === 'addon') {
          const userId = session.metadata?.userId
          const addonKey = session.metadata?.addonKey
          const addonReports = parseInt(session.metadata?.addonReports || '0')
          const addon = PRICING_CONFIG.addons[addonKey as keyof typeof PRICING_CONFIG.addons]
          
          if (!userId) {
            console.error('❌ ADD-ON ERROR: No userId in metadata')
          }
          if (!addonKey) {
            console.error('❌ ADD-ON ERROR: No addonKey in metadata')
          }
          if (addonReports <= 0) {
            console.error('❌ ADD-ON ERROR: Invalid addonReports value:', addonReports)
          }
          if (!addon) {
            console.error('❌ ADD-ON ERROR: Addon not found in PRICING_CONFIG for key:', addonKey)
          }
          
          if (userId && addonReports > 0 && addon) {
            try {
              // Get current user data before update
              const userBefore = await prisma.user.findUnique({
                where: { id: userId },
                select: { addonReports: true }
              })
              
              // Get payment intent ID if available
              const paymentIntentId = session.payment_intent as string | undefined
              
              // Check if AddonPurchase model is available and check for duplicates
              let alreadyProcessed = false
              let canUsePurchaseTable = false
              
              try {
                // Try to access the model - if it exists, it will be an object with methods
                if (prisma.addonPurchase && typeof (prisma.addonPurchase as any).findUnique === 'function') {
                  canUsePurchaseTable = true
                  const existingPurchase = await (prisma.addonPurchase as any).findUnique({
                    where: { stripeSessionId: session.id }
                  })
                  if (existingPurchase) {
                    alreadyProcessed = true
                  }
                }
              } catch (error: any) {
                // Model doesn't exist or not available
                canUsePurchaseTable = false
              }
              
              if (alreadyProcessed) {
                return NextResponse.json({ received: true, message: 'Already processed' })
              }
              
              // Try to create purchase record if table is available
              let addonPurchase = null
              if (canUsePurchaseTable) {
                try {
                  addonPurchase = await (prisma.addonPurchase as any).create({
                    data: {
                      userId: userId,
                      addonKey: addonKey,
                      addonName: addon.name,
                      reportLimit: addonReports,
                      amount: addon.amount,
                      currency: addon.currency,
                      stripeSessionId: session.id,
                      stripePaymentIntentId: paymentIntentId,
                      status: 'COMPLETED',
                    }
                  })
                } catch (purchaseError: any) {
                  // If record already exists (unique constraint), skip processing
                  if (purchaseError.code === 'P2002' || purchaseError.message?.includes('Unique constraint') || purchaseError.message?.includes('unique')) {
                    return NextResponse.json({ received: true, message: 'Already processed' })
                  }
                  console.warn('⚠️ Could not create AddonPurchase record:', purchaseError.message)
                  canUsePurchaseTable = false // Fall back to user field only
                }
              }
              
              // ALWAYS update user's addonReports field (works even if table doesn't exist)
              const updatedUser = await prisma.user.update({
              where: { id: userId },
              data: {
                addonReports: {
                  increment: addonReports
                }
                },
                select: {
                  addonReports: true,
                  id: true
              }
            })
            
              
            } catch (error: any) {
              console.error('❌ ADD-ON PROCESSING ERROR:', {
                error: error.message,
                stack: error.stack,
                userId,
                addonReports
              })
              throw error
            }
          } else {
            console.error('❌ ADD-ON VALIDATION FAILED - Not processing')
          }
        } else {
            mode: session.mode,
            type: session.metadata?.type
          })
        }
        
        if (session.mode === 'subscription') {
          // Use userId from metadata if available (more reliable), otherwise fall back to email
          let userId = session.metadata?.userId
          
          if (userId) {
            
            // Get subscription details to calculate billing dates
            let subscriptionEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default 30 days
            let nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            
            if (session.subscription) {
              try {
                const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription as string)
                subscriptionEndsAt = new Date(stripeSubscription.current_period_end * 1000)
                nextBillingDate = new Date(stripeSubscription.current_period_end * 1000)
              } catch (err) {
                console.error('Error retrieving subscription:', err)
              }
            }
            
            // Determine subscription plan from price or metadata
            let subscriptionPlan = 'Monthly Plan' // Default
            if (session.subscription) {
              try {
                const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription as string)
                if (stripeSubscription.items.data[0]?.price) {
                  const price = stripeSubscription.items.data[0].price
                  if (price.recurring?.interval === 'year') {
                    subscriptionPlan = 'Yearly Plan'
                  } else {
                    subscriptionPlan = 'Monthly Plan'
                  }
                }
              } catch (err) {
                console.error('Error determining plan:', err)
              }
            }
            
            // Check if this is the user's first subscription (signup bonus eligibility)
            const userBefore = await prisma.user.findUnique({
              where: { id: userId },
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
                where: { id: userId },
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
            
            // Calculate monthly reset date (first day of next month)
            const now = new Date()
            const nextReset = new Date(now)
            nextReset.setMonth(nextReset.getMonth() + 1)
            nextReset.setDate(1)
            nextReset.setHours(0, 0, 0, 0)
            
            // Prepare update data
            const updateData: any = {
                subscriptionStatus: 'ACTIVE',
                subscriptionPlan: subscriptionPlan,
                stripeCustomerId: session.customer as string,
                subscriptionId: session.subscription as string,
                subscriptionEndsAt: subscriptionEndsAt,
                nextBillingDate: nextBillingDate,
              lastBillingDate: new Date(stripeSubscription?.current_period_start * 1000 || Date.now()),
              monthlyReportsUsed: 0,
              monthlyResetDate: nextReset,
                creditsRemaining: 999999, // Unlimited for paid plans
              }
            
            // Grant signup bonus (10 reports) if first subscription
            // Note: signupBonusApplied field will be set after migration is run
            if (isFirstSubscription) {
              const currentAddonReports = userBefore?.addonReports || 0
              updateData.addonReports = currentAddonReports + 10
            }
            
            // Update user subscription status using userId
            const checkoutResult = await prisma.user.update({
              where: { id: userId },
              data: updateData
            })
            
          } else if (session.customer_email) {
            // Fallback to email if metadata userId not available
          
            let subscriptionEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            let nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            
            if (session.subscription) {
              try {
                const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription as string)
                subscriptionEndsAt = new Date(stripeSubscription.current_period_end * 1000)
                nextBillingDate = new Date(stripeSubscription.current_period_end * 1000)
              } catch (err) {
                console.error('Error retrieving subscription:', err)
              }
            }
            
            // Determine subscription plan from price
            let subscriptionPlan = 'Monthly Plan' // Default
            if (session.subscription) {
              try {
                const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription as string)
                if (stripeSubscription.items.data[0]?.price) {
                  const price = stripeSubscription.items.data[0].price
                  if (price.recurring?.interval === 'year') {
                    subscriptionPlan = 'Yearly Plan'
                  } else {
                    subscriptionPlan = 'Monthly Plan'
                  }
                }
              } catch (err) {
                console.error('Error determining plan:', err)
              }
            }
            
          // Get user to check if first subscription
          const userByEmail = await prisma.user.findFirst({
            where: { email: session.customer_email },
            select: {
              id: true,
              subscriptionStatus: true,
              lastBillingDate: true,
              addonReports: true
            }
          })
          
          if (userByEmail) {
            // Check if signupBonusApplied field exists (may not exist if migration not run)
            let signupBonusApplied = false
            try {
              const userWithBonus = await prisma.user.findFirst({
                where: { email: session.customer_email },
                select: {
                  signupBonusApplied: true
                }
              })
              signupBonusApplied = userWithBonus?.signupBonusApplied || false
            } catch (e) {
              // Field doesn't exist yet, assume false
              signupBonusApplied = false
            }
            
            const isFirstSubscription = !signupBonusApplied && 
                                      (userByEmail.subscriptionStatus !== 'ACTIVE' || !userByEmail.lastBillingDate)
            
            // Calculate monthly reset date
            const now = new Date()
            const nextReset = new Date(now)
            nextReset.setMonth(nextReset.getMonth() + 1)
            nextReset.setDate(1)
            nextReset.setHours(0, 0, 0, 0)
            
            // Prepare update data
            const updateData: any = {
              subscriptionStatus: 'ACTIVE',
                subscriptionPlan: subscriptionPlan,
              stripeCustomerId: session.customer as string,
              subscriptionId: session.subscription as string,
                subscriptionEndsAt: subscriptionEndsAt,
                nextBillingDate: nextBillingDate,
              lastBillingDate: new Date(),
              monthlyReportsUsed: 0,
              monthlyResetDate: nextReset,
              creditsRemaining: 999999, // Unlimited for paid plans
            }
            
            // Grant signup bonus (10 reports) if first subscription
            // Note: signupBonusApplied field will be set after migration is run
            if (isFirstSubscription) {
              const currentAddonReports = userByEmail.addonReports || 0
              updateData.addonReports = currentAddonReports + 10
            }
            
            const checkoutResult = await prisma.user.updateMany({
              where: { email: session.customer_email },
              data: updateData
            })
          }
          
          }
        }
        break

      case "customer.subscription.created":
        const subscription = event.data.object as Stripe.Subscription
          id: subscription.id,
          customer: subscription.customer,
          status: subscription.status
        })
        
        // Update user subscription
        if (subscription.customer) {
          
          // Determine subscription plan from price
          let subscriptionPlan = 'Monthly Plan' // Default
          if (subscription.items.data[0]?.price) {
            const price = subscription.items.data[0].price
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
          
          // Get user to check if first subscription
          const userByCustomer = await prisma.user.findFirst({
            where: { stripeCustomerId: subscription.customer as string },
            select: {
              id: true,
              subscriptionStatus: true,
              lastBillingDate: true,
              addonReports: true
            }
          })
          
          if (userByCustomer) {
            // Check if signupBonusApplied field exists (may not exist if migration not run)
            let signupBonusApplied = false
            try {
              const userWithBonus = await prisma.user.findFirst({
                where: { stripeCustomerId: subscription.customer as string },
                select: {
                  signupBonusApplied: true
                }
              })
              signupBonusApplied = userWithBonus?.signupBonusApplied || false
            } catch (e) {
              // Field doesn't exist yet, assume false
              signupBonusApplied = false
            }
            
            const isFirstSubscription = !signupBonusApplied && 
                                      (userByCustomer.subscriptionStatus !== 'ACTIVE' || !userByCustomer.lastBillingDate)
            
            // Prepare update data
            const updateData: any = {
              subscriptionStatus: 'ACTIVE',
              subscriptionPlan: subscriptionPlan,
              subscriptionId: subscription.id,
              subscriptionEndsAt: new Date(subscription.current_period_end * 1000),
              nextBillingDate: new Date(subscription.current_period_end * 1000),
              lastBillingDate: new Date(subscription.current_period_start * 1000),
              monthlyReportsUsed: 0,
              monthlyResetDate: nextReset,
              // Don't set creditsRemaining for active subscriptions - they use monthly limits
            }
            
            // Grant signup bonus (10 reports) if first subscription
            // Note: signupBonusApplied field will be set after migration is run
            if (isFirstSubscription) {
              const currentAddonReports = userByCustomer.addonReports || 0
              updateData.addonReports = currentAddonReports + 10
            }
            
            const subscriptionResult = await prisma.user.updateMany({
              where: { stripeCustomerId: subscription.customer as string },
              data: updateData
            })
          }
          
        }
        break

      case "customer.subscription.updated":
        const updatedSubscription = event.data.object as Stripe.Subscription
          id: updatedSubscription.id,
          status: updatedSubscription.status
        })
        
        const updateResult = await prisma.user.updateMany({
          where: { subscriptionId: updatedSubscription.id },
          data: {
            subscriptionStatus: updatedSubscription.status === 'active' ? 'ACTIVE' : 'CANCELED',
            subscriptionEndsAt: new Date(updatedSubscription.current_period_end * 1000),
            nextBillingDate: new Date(updatedSubscription.current_period_end * 1000),
          }
        })
        
        break

      case "customer.subscription.deleted":
        const deletedSubscription = event.data.object as Stripe.Subscription
        
        const deletionResult = await prisma.user.updateMany({
          where: { subscriptionId: deletedSubscription.id },
          data: {
            subscriptionStatus: 'EXPIRED',
            subscriptionEndsAt: new Date(),
            creditsRemaining: 0,
          }
        })
        
        break

      case "invoice.payment_succeeded":
        const invoice = event.data.object as Stripe.Invoice
        
        if (invoice.subscription) {
          // Reset monthly usage on successful payment
          const now = new Date()
          const nextReset = new Date(now)
          nextReset.setMonth(nextReset.getMonth() + 1)
          nextReset.setDate(1)
          nextReset.setHours(0, 0, 0, 0)
          
          await prisma.user.updateMany({
            where: { subscriptionId: invoice.subscription as string },
            data: {
              lastBillingDate: new Date(),
              nextBillingDate: new Date(invoice.period_end * 1000),
              monthlyReportsUsed: 0,
              monthlyResetDate: nextReset,
              // Don't set creditsRemaining for active subscriptions - they use monthly limits
            }
          })
        }
        break

      case "payment_intent.succeeded":
        // Handle add-on purchases via payment intent (backup to checkout.session.completed)
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        
        
        // Check if this is an add-on purchase
        if (paymentIntent.metadata?.type === 'addon') {
          const userId = paymentIntent.metadata?.userId
          const addonKey = paymentIntent.metadata?.addonKey
          const addonReports = parseInt(paymentIntent.metadata?.addonReports || '0')
          const addon = PRICING_CONFIG.addons[addonKey as keyof typeof PRICING_CONFIG.addons]
          
          if (userId && addonReports > 0 && addon) {
            // Check if purchase already exists
            const existingPurchase = await prisma.addonPurchase.findUnique({
              where: { stripePaymentIntentId: paymentIntent.id }
            })
            
            if (!existingPurchase) {
              
              // Create add-on purchase record FIRST (acts as unique lock)
              let addonPurchase = null
              try {
                addonPurchase = await prisma.addonPurchase.create({
                  data: {
                    userId: userId,
                    addonKey: addonKey,
                    addonName: addon.name,
                    reportLimit: addonReports,
                    amount: addon.amount,
                    currency: addon.currency,
                    stripePaymentIntentId: paymentIntent.id,
                    status: 'COMPLETED',
                  }
                })
              } catch (purchaseError: any) {
                // If record already exists (unique constraint), skip processing
                if (purchaseError.code === 'P2002' || purchaseError.message?.includes('Unique constraint') || purchaseError.message?.includes('unique')) {
                  return NextResponse.json({ received: true, message: 'Already processed' })
                }
                console.error('❌ Error creating purchase record:', purchaseError.message)
                return NextResponse.json({ received: true, message: 'Failed to create purchase record' })
              }
              
              // Only update user if we successfully created the record
              if (addonPurchase) {
                await prisma.user.update({
                  where: { id: userId },
                  data: {
                    addonReports: {
                      increment: addonReports
                    }
                  }
                })
                
              }
            } else {
            }
          }
        }
        break

      case "invoice.payment_failed":
        const failedInvoice = event.data.object as Stripe.Invoice
        
        if (failedInvoice.subscription) {
          await prisma.user.updateMany({
            where: { subscriptionId: failedInvoice.subscription as string },
            data: {
              subscriptionStatus: 'PAST_DUE',
            }
          })
        }
        break

      default:
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Error processing webhook:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}
