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

    const { priceId } = await request.json()

    if (!priceId) {
      return NextResponse.json({ error: "Price ID is required" }, { status: 400 })
    }

    // Get user's Stripe customer ID
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeCustomerId: true }
    })

    let customerId = user?.stripeCustomerId

    // If no Stripe customer ID exists, create one
    if (!customerId) {
      try {
        const stripeCustomer = await stripe.customers.create({
          email: session.user.email!,
          name: session.user.name || undefined,
          metadata: {
            userId: session.user.id,
          },
        })
        customerId = stripeCustomer.id

        // Update user with Stripe customer ID
        await prisma.user.update({
          where: { id: session.user.id },
          data: { stripeCustomerId: customerId }
        })
      } catch (stripeError) {
        console.error('Error creating Stripe customer:', stripeError)
        return NextResponse.json({ error: "Failed to create customer" }, { status: 500 })
      }
    }

    // Create Stripe checkout session
    let checkoutSession
    try {
      checkoutSession = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer: customerId,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${process.env.NEXTAUTH_URL}/dashboard/success`,
        cancel_url: `${process.env.NEXTAUTH_URL}/dashboard/pricing?canceled=true`,
        metadata: {
          userId: session.user.id,
        },
      })
    } catch (priceError: any) {
      // If price doesn't exist, create it dynamically
      if (priceError.code === 'resource_missing') {
        console.log('Price not found, creating dynamic price...')
        
        // Create price based on the priceId
        let priceData
        if (priceId === 'MONTHLY_PLAN' || priceId.includes('MONTHLY')) {
          priceData = {
            unit_amount: 4950, // $49.50 in cents
            currency: 'aud',
            recurring: { interval: 'month' },
            product_data: {
              name: 'Monthly Plan',
            },
          }
        } else if (priceId === 'YEARLY_PLAN' || priceId.includes('YEARLY')) {
          priceData = {
            unit_amount: 52800, // $528 in cents
            currency: 'aud',
            recurring: { interval: 'year' },
            product_data: {
              name: 'Yearly Plan',
            },
          }
        } else if (priceId === 'FREE_TRIAL' || priceId.includes('FREE')) {
          // Free trial doesn't need a price
          return NextResponse.json({ error: "Free trial doesn't require payment" }, { status: 400 })
        } else {
          throw new Error('Invalid price ID')
        }
        
        const newPrice = await stripe.prices.create(priceData)
        
        checkoutSession = await stripe.checkout.sessions.create({
          mode: 'subscription',
          payment_method_types: ['card'],
          customer: customerId,
          line_items: [
            {
              price: newPrice.id,
              quantity: 1,
            },
          ],
          success_url: `${process.env.NEXTAUTH_URL}/dashboard/success`,
          cancel_url: `${process.env.NEXTAUTH_URL}/dashboard/pricing?canceled=true`,
          metadata: {
            userId: session.user.id,
          },
        })
      } else {
        throw priceError
      }
    }

    return NextResponse.json({ 
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
      customerId: customerId
    })
  } catch (error) {
    console.error("Error creating checkout session:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
