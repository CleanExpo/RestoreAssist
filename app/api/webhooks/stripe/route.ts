import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { stripe, validateWebhookSignature } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import Stripe from "stripe"

// Disable body parsing for webhook routes
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const headersList = await headers()
  const signature = headersList.get("stripe-signature")

  if (!signature) {
    console.error('[Stripe Webhook] Missing stripe-signature header')
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = validateWebhookSignature(body, signature)
    console.log('[Stripe Webhook] Event received:', event.type, event.id)
  } catch (err: any) {
    console.error('[Stripe Webhook] Signature validation failed:', err.message)
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err.message}` },
      { status: 400 }
    )
  }

  try {
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('[Stripe Webhook] Error processing webhook:', {
      type: event.type,
      error: error.message,
      stack: error.stack
    })
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    )
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('[Stripe Webhook] Checkout session completed:', session.id)

  const userId = session.metadata?.userId
  if (!userId) {
    console.error('[Stripe Webhook] No userId in session metadata')
    return
  }

  const customerId = session.customer as string
  const subscriptionId = session.subscription as string

  // Update user with Stripe customer ID and subscription ID
  await prisma.user.update({
    where: { id: userId },
    data: {
      stripeCustomerId: customerId,
      subscriptionId: subscriptionId,
      subscriptionStatus: 'ACTIVE',
      updatedAt: new Date(),
    },
  })

  console.log('[Stripe Webhook] User updated after checkout:', userId)
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log('[Stripe Webhook] Subscription created:', subscription.id)

  const userId = subscription.metadata?.userId
  if (!userId) {
    // Try to find user by customer ID
    const user = await prisma.user.findFirst({
      where: { stripeCustomerId: subscription.customer as string }
    })
    if (!user) {
      console.error('[Stripe Webhook] No user found for customer:', subscription.customer)
      return
    }
    await updateSubscriptionStatus(user.id, subscription)
  } else {
    await updateSubscriptionStatus(userId, subscription)
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log('[Stripe Webhook] Subscription updated:', subscription.id)

  const user = await prisma.user.findFirst({
    where: { subscriptionId: subscription.id }
  })

  if (!user) {
    console.error('[Stripe Webhook] No user found for subscription:', subscription.id)
    return
  }

  await updateSubscriptionStatus(user.id, subscription)
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('[Stripe Webhook] Subscription deleted:', subscription.id)

  const user = await prisma.user.findFirst({
    where: { subscriptionId: subscription.id }
  })

  if (!user) {
    console.error('[Stripe Webhook] No user found for subscription:', subscription.id)
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: 'CANCELED',
      subscriptionEndsAt: new Date(subscription.current_period_end * 1000),
      updatedAt: new Date(),
    },
  })

  console.log('[Stripe Webhook] Subscription canceled for user:', user.id)
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  console.log('[Stripe Webhook] Invoice paid:', invoice.id)

  const subscriptionId = invoice.subscription as string
  if (!subscriptionId) return

  const user = await prisma.user.findFirst({
    where: { subscriptionId }
  })

  if (!user) {
    console.error('[Stripe Webhook] No user found for subscription:', subscriptionId)
    return
  }

  // Update billing dates
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastBillingDate: new Date(invoice.created * 1000),
      nextBillingDate: invoice.period_end ? new Date(invoice.period_end * 1000) : undefined,
      updatedAt: new Date(),
    },
  })

  console.log('[Stripe Webhook] Billing dates updated for user:', user.id)
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log('[Stripe Webhook] Invoice payment failed:', invoice.id)

  const subscriptionId = invoice.subscription as string
  if (!subscriptionId) return

  const user = await prisma.user.findFirst({
    where: { subscriptionId }
  })

  if (!user) {
    console.error('[Stripe Webhook] No user found for subscription:', subscriptionId)
    return
  }

  // Update subscription status to PAST_DUE
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: 'PAST_DUE',
      updatedAt: new Date(),
    },
  })

  console.log('[Stripe Webhook] Subscription marked as PAST_DUE for user:', user.id)
}

async function updateSubscriptionStatus(userId: string, subscription: Stripe.Subscription) {
  const status = mapStripeStatus(subscription.status)
  const priceId = subscription.items.data[0]?.price.id
  const planName = getPlanNameFromPriceId(priceId)

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionId: subscription.id,
      subscriptionStatus: status,
      subscriptionPlan: planName,
      subscriptionEndsAt: new Date(subscription.current_period_end * 1000),
      nextBillingDate: new Date(subscription.current_period_end * 1000),
      updatedAt: new Date(),
    },
  })

  console.log('[Stripe Webhook] Subscription status updated:', { userId, status, planName })
}

function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): 'TRIAL' | 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'EXPIRED' {
  switch (stripeStatus) {
    case 'active':
      return 'ACTIVE'
    case 'trialing':
      return 'TRIAL'
    case 'canceled':
    case 'unpaid':
      return 'CANCELED'
    case 'past_due':
      return 'PAST_DUE'
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
    default:
      return 'EXPIRED'
  }
}

function getPlanNameFromPriceId(priceId?: string): string {
  if (!priceId) return 'Unknown'

  const priceMapping: Record<string, string> = {
    'price_1SK6CHBY5KEPMwxdjZxT8CKH': 'Free Trial',
    'price_1SK6GPBY5KEPMwxd43EBhwXx': 'Monthly Plan',
    'price_1SK6I7BY5KEPMwxdC451vfBk': 'Yearly Plan',
  }

  return priceMapping[priceId] || 'Custom Plan'
}
