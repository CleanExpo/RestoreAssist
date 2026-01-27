import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { PRICING_CONFIG } from "@/lib/pricing"
import { applyRateLimit } from "@/lib/rate-limiter"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limit: 10 addon purchases per 15 minutes per user
    const rateLimited = applyRateLimit(request, { maxRequests: 10, prefix: "addon-checkout", key: session.user.id })
    if (rateLimited) return rateLimited

    // Get the base URL from the request headers
    let baseUrl = process.env.NEXTAUTH_URL
    
    if (!baseUrl) {
      const origin = request.headers.get('origin')
      const host = request.headers.get('host')
      
      if (origin) {
        baseUrl = origin
      } else if (host) {
        const protocol = request.headers.get('x-forwarded-proto') || 
                        (host.includes('localhost') ? 'http' : 'https')
        baseUrl = `${protocol}://${host}`
      } else {
        baseUrl = 'http://localhost:3000'
      }
    }

    const { addonKey } = await request.json()

    if (!addonKey) {
      return NextResponse.json({ error: "Add-on key is required" }, { status: 400 })
    }

    // Validate addon key
    const addon = PRICING_CONFIG.addons[addonKey as keyof typeof PRICING_CONFIG.addons]
    if (!addon) {
      return NextResponse.json({ error: "Invalid add-on" }, { status: 400 })
    }

    // Check if user has active subscription
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        subscriptionStatus: true,
        stripeCustomerId: true,
        subscriptionId: true,
      }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.subscriptionStatus !== 'ACTIVE') {
      return NextResponse.json({ 
        error: "Active subscription required to purchase add-ons",
        upgradeRequired: true
      }, { status: 403 })
    }

    let customerId = user.stripeCustomerId

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

        await prisma.user.update({
          where: { id: session.user.id },
          data: { stripeCustomerId: customerId }
        })
      } catch (stripeError) {
        console.error('Error creating Stripe customer:', stripeError)
        return NextResponse.json({ error: "Failed to create customer" }, { status: 500 })
      }
    }

    // Create one-time payment checkout session for add-on
    try {
      // Create price for add-on (one-time payment)
      const priceData = {
        unit_amount: Math.round(addon.amount * 100), // Convert to cents
        currency: addon.currency.toLowerCase(),
        product_data: {
          name: addon.name,
          metadata: {
            description: addon.description,
            addonKey: addonKey,
            reportLimit: addon.reportLimit.toString(),
          },
        },
      }
      
      const price = await stripe.prices.create(priceData)

      const checkoutSession = await stripe.checkout.sessions.create({
        mode: 'payment', // One-time payment, not subscription
        payment_method_types: ['card'],
        customer: customerId,
        line_items: [
          {
            price: price.id,
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/dashboard/success?addon=${addonKey}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/dashboard/pricing?canceled=true`,
        metadata: {
          userId: session.user.id,
          addonKey: addonKey,
          addonReports: addon.reportLimit.toString(),
          type: 'addon',
        },
        payment_intent_data: {
          metadata: {
            userId: session.user.id,
            addonKey: addonKey,
            addonReports: addon.reportLimit.toString(),
            type: 'addon',
          },
        },
      })

      return NextResponse.json({ 
        sessionId: checkoutSession.id,
        url: checkoutSession.url,
      })
    } catch (error: any) {
      console.error("Error creating add-on checkout session:", error)
      return NextResponse.json({ 
        error: error.message || "Failed to create checkout session" 
      }, { status: 500 })
    }
  } catch (error) {
    console.error("Error in add-on checkout:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

