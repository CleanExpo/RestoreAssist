import { NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import Stripe from "stripe"

export async function POST(request: NextRequest) {
  const body = await request.text()
  const hdrs = await headers()
  const signature = hdrs.get("stripe-signature")

  console.log('Webhook received:', { 
    hasSignature: !!signature, 
    bodyLength: body.length,
    webhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET 
  })

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
    console.log('Processing webhook event:', event.type)
    
    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object as Stripe.Checkout.Session
        console.log('Checkout session completed:', {
          id: session.id,
          mode: session.mode,
          customerEmail: session.customer_email,
          customer: session.customer,
          subscription: session.subscription
        })
        
        if (session.mode === 'subscription' && session.customer_email) {
          console.log('Updating user subscription for:', session.customer_email)
          
          // Update user subscription status
          const checkoutResult = await prisma.user.updateMany({
            where: { email: session.customer_email },
            data: {
              subscriptionStatus: 'ACTIVE',
              stripeCustomerId: session.customer as string,
              subscriptionId: session.subscription as string,
              subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              creditsRemaining: 999999, // Unlimited for paid plans
            }
          })
          
          console.log('User update result:', checkoutResult)
        }
        break

      case "customer.subscription.created":
        const subscription = event.data.object as Stripe.Subscription
        console.log('Subscription created:', {
          id: subscription.id,
          customer: subscription.customer,
          status: subscription.status
        })
        
        // Update user subscription
        if (subscription.customer) {
          console.log('Updating user subscription for customer:', subscription.customer)
          
          const subscriptionResult = await prisma.user.updateMany({
            where: { stripeCustomerId: subscription.customer as string },
            data: {
              subscriptionStatus: 'ACTIVE',
              subscriptionId: subscription.id,
              subscriptionEndsAt: new Date(((subscription as any).current_period_end ?? Math.floor(Date.now() / 1000 + 30 * 24 * 3600)) * 1000),
              nextBillingDate: new Date(((subscription as any).current_period_end ?? Math.floor(Date.now() / 1000 + 30 * 24 * 3600)) * 1000),
              creditsRemaining: 999999,
            }
          })
          
          console.log('Subscription update result:', subscriptionResult)
        }
        break

      case "customer.subscription.updated":
        const updatedSubscription = event.data.object as Stripe.Subscription
        console.log('Subscription updated:', {
          id: updatedSubscription.id,
          status: updatedSubscription.status
        })
        
        const updateResult = await prisma.user.updateMany({
          where: { subscriptionId: updatedSubscription.id },
          data: {
            subscriptionStatus: updatedSubscription.status === 'active' ? 'ACTIVE' : 'CANCELED',
            subscriptionEndsAt: new Date(((updatedSubscription as any).current_period_end ?? Math.floor(Date.now() / 1000 + 30 * 24 * 3600)) * 1000),
            nextBillingDate: new Date(((updatedSubscription as any).current_period_end ?? Math.floor(Date.now() / 1000 + 30 * 24 * 3600)) * 1000),
          }
        })
        
        console.log('Subscription update result:', updateResult)
        break

      case "customer.subscription.deleted":
        const deletedSubscription = event.data.object as Stripe.Subscription
        console.log('Subscription deleted:', {
          id: deletedSubscription.id
        })
        
        const deletionResult = await prisma.user.updateMany({
          where: { subscriptionId: deletedSubscription.id },
          data: {
            subscriptionStatus: 'EXPIRED',
            subscriptionEndsAt: new Date(),
            creditsRemaining: 0,
          }
        })
        
        console.log('Subscription deletion result:', deletionResult)
        break

      case "invoice.payment_succeeded":
        const invoice = event.data.object as Stripe.Invoice
        
        if ((invoice as any).subscription) {
          await prisma.user.updateMany({
            where: { subscriptionId: (invoice as any).subscription as string },
            data: {
              lastBillingDate: new Date(),
              nextBillingDate: new Date(invoice.period_end * 1000),
              creditsRemaining: 999999,
            }
          })
        }
        break

      case "invoice.payment_failed":
        const failedInvoice = event.data.object as Stripe.Invoice
        
        if ((failedInvoice as any).subscription) {
          await prisma.user.updateMany({
            where: { subscriptionId: (failedInvoice as any).subscription as string },
            data: {
              subscriptionStatus: 'PAST_DUE',
            }
          })
        }
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Error processing webhook:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}
