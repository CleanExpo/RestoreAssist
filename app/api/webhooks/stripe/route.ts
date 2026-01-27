import { NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import Stripe from "stripe"
import { PRICING_CONFIG } from "@/lib/pricing"
import { sendPaymentFailedEmail, sendSubscriptionCancelledEmail } from "@/lib/email"

const APP_URL = process.env.NEXTAUTH_URL || "https://restoreassist.com.au"

// Cache the model availability check to avoid repeated reflection
let _webhookModelAvailable: boolean | null = null

async function hasWebhookEventModel(): Promise<boolean> {
  if (_webhookModelAvailable !== null) return _webhookModelAvailable
  try {
    if (prisma.stripeWebhookEvent && typeof (prisma.stripeWebhookEvent as any).findFirst === 'function') {
      _webhookModelAvailable = true
      return true
    }
  } catch {
    // Model doesn't exist in this Prisma client generation
  }
  _webhookModelAvailable = false
  return false
}

// Helper to log webhook event (graceful if model doesn't exist)
async function logWebhookEvent(
  stripeEventId: string,
  eventType: string,
  eventData: string,
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED',
  userId?: string,
  errorMessage?: string
) {
  try {
    if (await hasWebhookEventModel()) {
      await (prisma.stripeWebhookEvent as any).upsert({
        where: { stripeEventId },
        create: {
          stripeEventId,
          eventType,
          eventData,
          status,
          userId,
          errorMessage,
          processedAt: status === 'COMPLETED' || status === 'FAILED' ? new Date() : null,
        },
        update: {
          status,
          errorMessage,
          processedAt: status === 'COMPLETED' || status === 'FAILED' ? new Date() : undefined,
          retryCount: status === 'FAILED' ? { increment: 1 } : undefined,
        }
      })
    }
  } catch (error) {
    console.warn('Could not log webhook event:', error)
  }
}

// Helper to check if event was already processed (idempotency)
async function isEventProcessed(stripeEventId: string): Promise<boolean> {
  try {
    if (await hasWebhookEventModel()) {
      const existing = await (prisma.stripeWebhookEvent as any).findUnique({
        where: { stripeEventId }
      })
      return existing?.status === 'COMPLETED'
    }
  } catch {
    // Model doesn't exist, continue processing
  }
  return false
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const headersList = await headers()
  const signature = headersList.get("stripe-signature")

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

  // Check for duplicate event (idempotency)
  if (await isEventProcessed(event.id)) {
    console.log(`Webhook event ${event.id} already processed, skipping`)
    await logWebhookEvent(event.id, event.type, body, 'SKIPPED')
    return NextResponse.json({ received: true, message: 'Already processed' })
  }

  // Log event as processing
  await logWebhookEvent(event.id, event.type, body, 'PROCESSING')

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event)
        break

      case "customer.subscription.created":
        await handleSubscriptionCreated(event)
        break

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event)
        break

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event)
        break

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event)
        break

      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event)
        break

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event)
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    // Log successful processing
    await logWebhookEvent(event.id, event.type, body, 'COMPLETED')
    return NextResponse.json({ received: true })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error("Error processing webhook:", error)
    await logWebhookEvent(event.id, event.type, body, 'FAILED', undefined, errorMessage)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}

// Handler: checkout.session.completed
async function handleCheckoutSessionCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session

  // Handle add-on purchases (one-time payments)
  if (session.mode === 'payment' && session.metadata?.type === 'addon') {
    await processAddonPurchase(session)
  }

  // Handle subscription checkout
  if (session.mode === 'subscription') {
    await processSubscriptionCheckout(session)
  }
}

// Process add-on purchase from checkout session
async function processAddonPurchase(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId
  const addonKey = session.metadata?.addonKey
  const addonReports = parseInt(session.metadata?.addonReports || '0')
  const addon = PRICING_CONFIG.addons[addonKey as keyof typeof PRICING_CONFIG.addons]

  if (!userId) {
    console.error('❌ ADD-ON ERROR: No userId in metadata')
    return
  }
  if (!addonKey) {
    console.error('❌ ADD-ON ERROR: No addonKey in metadata')
    return
  }
  if (addonReports <= 0) {
    console.error('❌ ADD-ON ERROR: Invalid addonReports value:', addonReports)
    return
  }
  if (!addon) {
    console.error('❌ ADD-ON ERROR: Addon not found in PRICING_CONFIG for key:', addonKey)
    return
  }

  const paymentIntentId = session.payment_intent as string | undefined

  // Check for duplicate processing using AddonPurchase table
  let alreadyProcessed = false
  let canUsePurchaseTable = false

  try {
    if (prisma.addonPurchase && typeof (prisma.addonPurchase as any).findUnique === 'function') {
      canUsePurchaseTable = true
      const existingPurchase = await (prisma.addonPurchase as any).findUnique({
        where: { stripeSessionId: session.id }
      })
      if (existingPurchase) {
        alreadyProcessed = true
      }
    }
  } catch {
    canUsePurchaseTable = false
  }

  if (alreadyProcessed) {
    console.log('⚠️ ADD-ON ALREADY PROCESSED (checkout session):', session.id)
    return
  }

  // Create purchase record if table is available
  if (canUsePurchaseTable) {
    try {
      await (prisma.addonPurchase as any).create({
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
      if (purchaseError.code === 'P2002' || purchaseError.message?.includes('Unique constraint')) {
        console.log('⚠️ ADD-ON ALREADY PROCESSED (unique constraint):', session.id)
        return
      }
      console.warn('⚠️ Could not create AddonPurchase record:', purchaseError.message)
    }
  }

  // Update user's addonReports
  await prisma.user.update({
    where: { id: userId },
    data: {
      addonReports: {
        increment: addonReports
      }
    }
  })

  console.log(`✅ ADD-ON PROCESSED: +${addonReports} reports for user ${userId}`)
}

// Process subscription checkout
async function processSubscriptionCheckout(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId

  if (!userId && !session.customer_email) {
    console.error('❌ SUBSCRIPTION ERROR: No userId or email in checkout session')
    return
  }

  // Get subscription details
  let subscriptionEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  let nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  let subscriptionPlan = 'Monthly Plan'
  let periodStartDate = new Date()

  if (session.subscription) {
    try {
      const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription as string)
      subscriptionEndsAt = new Date(stripeSubscription.current_period_end * 1000)
      nextBillingDate = new Date(stripeSubscription.current_period_end * 1000)
      periodStartDate = new Date(stripeSubscription.current_period_start * 1000)

      if (stripeSubscription.items.data[0]?.price?.recurring?.interval === 'year') {
        subscriptionPlan = 'Yearly Plan'
      }
    } catch (err) {
      console.error('Error retrieving subscription:', err)
    }
  }

  // Calculate monthly reset date
  const nextReset = new Date()
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
    lastBillingDate: periodStartDate,
    monthlyReportsUsed: 0,
    monthlyResetDate: nextReset,
    creditsRemaining: 999999,
  }

  // Update user by userId or email
  if (userId) {
    // Check for first subscription (signup bonus)
    const userBefore = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionStatus: true, lastBillingDate: true, addonReports: true }
    })

    let signupBonusApplied = false
    try {
      const userWithBonus = await prisma.user.findUnique({
        where: { id: userId },
        select: { signupBonusApplied: true }
      })
      signupBonusApplied = userWithBonus?.signupBonusApplied || false
    } catch {
      signupBonusApplied = false
    }

    const isFirstSubscription = !signupBonusApplied &&
      (userBefore?.subscriptionStatus !== 'ACTIVE' || !userBefore?.lastBillingDate)

    if (isFirstSubscription) {
      updateData.addonReports = (userBefore?.addonReports || 0) + 10
      updateData.signupBonusApplied = true
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    })

    console.log(`✅ SUBSCRIPTION ACTIVATED for user ${userId}${isFirstSubscription ? ' (signup bonus applied)' : ''}`)
  } else if (session.customer_email) {
    const userByEmail = await prisma.user.findFirst({
      where: { email: session.customer_email },
      select: { id: true, subscriptionStatus: true, lastBillingDate: true, addonReports: true }
    })

    if (userByEmail) {
      let signupBonusApplied = false
      try {
        const userWithBonus = await prisma.user.findFirst({
          where: { email: session.customer_email },
          select: { signupBonusApplied: true }
        })
        signupBonusApplied = userWithBonus?.signupBonusApplied || false
      } catch {
        signupBonusApplied = false
      }

      const isFirstSubscription = !signupBonusApplied &&
        (userByEmail.subscriptionStatus !== 'ACTIVE' || !userByEmail.lastBillingDate)

      if (isFirstSubscription) {
        updateData.addonReports = (userByEmail.addonReports || 0) + 10
        updateData.signupBonusApplied = true
      }

      await prisma.user.updateMany({
        where: { email: session.customer_email },
        data: updateData
      })

      console.log(`✅ SUBSCRIPTION ACTIVATED for email ${session.customer_email}${isFirstSubscription ? ' (signup bonus applied)' : ''}`)
    }
  }
}

// Handler: customer.subscription.created
async function handleSubscriptionCreated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription

  if (!subscription.customer) return

  const subscriptionPlan = subscription.items.data[0]?.price?.recurring?.interval === 'year'
    ? 'Yearly Plan'
    : 'Monthly Plan'

  const nextReset = new Date()
  nextReset.setMonth(nextReset.getMonth() + 1)
  nextReset.setDate(1)
  nextReset.setHours(0, 0, 0, 0)

  const userByCustomer = await prisma.user.findFirst({
    where: { stripeCustomerId: subscription.customer as string },
    select: { id: true, subscriptionStatus: true, lastBillingDate: true, addonReports: true }
  })

  if (!userByCustomer) {
    console.log(`No user found for Stripe customer: ${subscription.customer}`)
    return
  }

  let signupBonusApplied = false
  try {
    const userWithBonus = await prisma.user.findFirst({
      where: { stripeCustomerId: subscription.customer as string },
      select: { signupBonusApplied: true }
    })
    signupBonusApplied = userWithBonus?.signupBonusApplied || false
  } catch {
    signupBonusApplied = false
  }

  const isFirstSubscription = !signupBonusApplied &&
    (userByCustomer.subscriptionStatus !== 'ACTIVE' || !userByCustomer.lastBillingDate)

  const updateData: any = {
    subscriptionStatus: 'ACTIVE',
    subscriptionPlan: subscriptionPlan,
    subscriptionId: subscription.id,
    subscriptionEndsAt: new Date(subscription.current_period_end * 1000),
    nextBillingDate: new Date(subscription.current_period_end * 1000),
    lastBillingDate: new Date(subscription.current_period_start * 1000),
    monthlyReportsUsed: 0,
    monthlyResetDate: nextReset,
  }

  if (isFirstSubscription) {
    updateData.addonReports = (userByCustomer.addonReports || 0) + 10
    updateData.signupBonusApplied = true
  }

  await prisma.user.updateMany({
    where: { stripeCustomerId: subscription.customer as string },
    data: updateData
  })

  console.log(`✅ SUBSCRIPTION CREATED for customer ${subscription.customer}${isFirstSubscription ? ' (signup bonus applied)' : ''}`)
}

// Map Stripe subscription status to our SubscriptionStatus enum
function mapStripeStatus(stripeStatus: string): 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED' {
  switch (stripeStatus) {
    case 'active':
      return 'ACTIVE'
    case 'trialing':
      return 'TRIAL'
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE'
    case 'canceled':
    case 'incomplete_expired':
      return 'CANCELED'
    case 'incomplete':
    case 'paused':
      return 'EXPIRED'
    default:
      return 'CANCELED'
  }
}

// Handler: customer.subscription.updated
async function handleSubscriptionUpdated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription
  const mappedStatus = mapStripeStatus(subscription.status)

  await prisma.user.updateMany({
    where: { subscriptionId: subscription.id },
    data: {
      subscriptionStatus: mappedStatus,
      subscriptionEndsAt: new Date(subscription.current_period_end * 1000),
      nextBillingDate: new Date(subscription.current_period_end * 1000),
    }
  })

  console.log(`✅ SUBSCRIPTION UPDATED: ${subscription.id} -> ${subscription.status} (mapped to ${mappedStatus})`)
}

// Handler: customer.subscription.deleted
async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription

  // Find user before updating
  const user = await prisma.user.findFirst({
    where: { subscriptionId: subscription.id },
    select: {
      id: true,
      email: true,
      name: true,
      subscriptionPlan: true,
    }
  })

  // Use the subscription's period end (user paid through this date) or ended_at timestamp
  const endDate = subscription.ended_at
    ? new Date(subscription.ended_at * 1000)
    : subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : new Date()

  // Update user status
  await prisma.user.updateMany({
    where: { subscriptionId: subscription.id },
    data: {
      subscriptionStatus: 'CANCELED',
      subscriptionEndsAt: endDate,
      // Don't zero credits immediately — user paid through the period
    }
  })

  // Send cancellation email
  if (user?.email) {
    await sendSubscriptionCancelledEmail({
      recipientEmail: user.email,
      recipientName: user.name || 'Valued Customer',
      subscriptionPlan: user.subscriptionPlan || 'Subscription',
      expiresAt: endDate.toLocaleDateString('en-AU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      resubscribeUrl: `${APP_URL}/dashboard/subscription`,
    })
  }

  console.log(`✅ SUBSCRIPTION DELETED: ${subscription.id}`)
}

// Handler: invoice.payment_succeeded
async function handleInvoicePaymentSucceeded(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice

  if (!invoice.subscription) return

  const nextReset = new Date()
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
    }
  })

  console.log(`✅ INVOICE PAYMENT SUCCEEDED for subscription ${invoice.subscription}`)
}

// Handler: payment_intent.succeeded (backup for add-ons)
async function handlePaymentIntentSucceeded(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent

  if (paymentIntent.metadata?.type !== 'addon') return

  const userId = paymentIntent.metadata?.userId
  const addonKey = paymentIntent.metadata?.addonKey
  const addonReports = parseInt(paymentIntent.metadata?.addonReports || '0')
  const addon = PRICING_CONFIG.addons[addonKey as keyof typeof PRICING_CONFIG.addons]

  if (!userId || addonReports <= 0 || !addon) return

  // Check for duplicate
  try {
    const existingPurchase = await prisma.addonPurchase.findUnique({
      where: { stripePaymentIntentId: paymentIntent.id }
    })

    if (existingPurchase) {
      console.log('⚠️ ADD-ON ALREADY PROCESSED (payment intent):', paymentIntent.id)
      return
    }

    // Create purchase record
    await prisma.addonPurchase.create({
      data: {
        userId: userId,
        addonKey: addonKey!,
        addonName: addon.name,
        reportLimit: addonReports,
        amount: addon.amount,
        currency: addon.currency,
        stripePaymentIntentId: paymentIntent.id,
        status: 'COMPLETED',
      }
    })

    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: {
        addonReports: {
          increment: addonReports
        }
      }
    })

    console.log(`✅ ADD-ON PROCESSED (payment intent): +${addonReports} reports for user ${userId}`)
  } catch (error: any) {
    if (error.code === 'P2002') {
      console.log('⚠️ ADD-ON ALREADY PROCESSED (unique constraint):', paymentIntent.id)
      return
    }
    throw error
  }
}

// Handler: invoice.payment_failed
async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice

  if (!invoice.subscription) return

  // Update user status to PAST_DUE
  await prisma.user.updateMany({
    where: { subscriptionId: invoice.subscription as string },
    data: {
      subscriptionStatus: 'PAST_DUE',
    }
  })

  // Find user to send dunning email
  const user = await prisma.user.findFirst({
    where: { subscriptionId: invoice.subscription as string },
    select: {
      id: true,
      email: true,
      name: true,
      subscriptionPlan: true,
      stripeCustomerId: true,
    }
  })

  if (user?.email) {
    // Get failure reason from the invoice
    let failureReason: string | undefined
    if (invoice.last_finalization_error?.message) {
      failureReason = invoice.last_finalization_error.message
    } else if (invoice.charge) {
      try {
        const charge = await stripe.charges.retrieve(invoice.charge as string)
        failureReason = charge.failure_message || undefined
      } catch {
        // Ignore charge retrieval errors
      }
    }

    // Generate Stripe billing portal URL for payment update
    let updatePaymentUrl = `${APP_URL}/dashboard/subscription`
    if (user.stripeCustomerId) {
      try {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: user.stripeCustomerId,
          return_url: `${APP_URL}/dashboard/subscription`,
        })
        updatePaymentUrl = portalSession.url
      } catch {
        // Fallback to dashboard subscription page
      }
    }

    // Send dunning email
    await sendPaymentFailedEmail({
      recipientEmail: user.email,
      recipientName: user.name || 'Valued Customer',
      subscriptionPlan: user.subscriptionPlan || 'Subscription',
      amount: ((invoice.amount_due || 0) / 100).toFixed(2),
      currency: (invoice.currency || 'aud').toUpperCase(),
      failureReason,
      updatePaymentUrl,
    })
  }

  console.log(`⚠️ INVOICE PAYMENT FAILED for subscription ${invoice.subscription}`)
}
