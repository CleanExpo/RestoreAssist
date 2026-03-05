import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { PRICING_CONFIG } from "@/lib/pricing"

/**
 * Manual verification endpoint for add-on purchases
 * This can be called from the success page or subscription page to verify and process add-on purchases
 */
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
      const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent']
      })

      // Verify this session belongs to the current user
      const userId = checkoutSession.metadata?.userId
      if (userId !== session.user.id) {
        console.error('❌ USER ID MISMATCH:', { sessionUserId: userId, currentUserId: session.user.id })
        return NextResponse.json({ error: "Invalid session" }, { status: 403 })
      }

      // Check if this is an add-on purchase
      if (checkoutSession.mode !== 'payment' || checkoutSession.metadata?.type !== 'addon') {
        return NextResponse.json({ error: "Not an add-on purchase" }, { status: 400 })
      }

      // Check if payment was successful
      if (checkoutSession.payment_status !== 'paid') {
        return NextResponse.json({ 
          error: "Payment not completed",
          payment_status: checkoutSession.payment_status
        }, { status: 400 })
      }

      const addonKey = checkoutSession.metadata?.addonKey
      const addonReports = parseInt(checkoutSession.metadata?.addonReports || '0')
      const addon = PRICING_CONFIG.addons[addonKey as keyof typeof PRICING_CONFIG.addons]

      if (!addonKey || addonReports <= 0 || !addon) {
        return NextResponse.json({ error: "Invalid add-on data" }, { status: 400 })
      }

      // Check if already processed
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { addonReports: true }
      })

      // Check if purchase record already exists
      let existingPurchase = null
      try {
        existingPurchase = await prisma.addonPurchase.findFirst({
          where: {
            stripeSessionId: checkoutSession.id
          }
        })
      } catch (error: any) {
        // Table not available
      }

      if (existingPurchase) {
        return NextResponse.json({ 
          success: true,
          message: "Add-on already processed",
          addonReports: user?.addonReports
        })
      }

      // Process the add-on purchase
      const paymentIntentId = checkoutSession.payment_intent as string | undefined

      // Create add-on purchase record FIRST (acts as unique lock)
      let purchaseRecord = null
      try {
        purchaseRecord = await prisma.addonPurchase.create({
          data: {
            userId: session.user.id,
            addonKey: addonKey,
            addonName: addon.name,
            reportLimit: addonReports,
            amount: addon.amount,
            currency: addon.currency,
            stripeSessionId: checkoutSession.id,
            stripePaymentIntentId: paymentIntentId,
            status: 'COMPLETED',
          }
        })
      } catch (error: any) {
        // If record already exists (unique constraint), skip processing
        if (error.code === 'P2002' || error.message?.includes('Unique constraint') || error.message?.includes('unique')) {
          return NextResponse.json({ 
            success: true,
            message: "Add-on purchase already processed",
            addonReports: user?.addonReports || 0
          })
        }
        console.warn('⚠️ Could not create AddonPurchase record:', error.message)
        // If table doesn't exist, continue with user update
      }

      // Only update user if we successfully created the record (or table doesn't exist)
      const updatedUser = await prisma.user.update({
        where: { id: session.user.id },
        data: {
          addonReports: {
            increment: addonReports
          }
        },
        select: {
          addonReports: true
        }
      })

      return NextResponse.json({
        success: true,
        message: "Add-on purchase processed successfully",
        addonReports: updatedUser.addonReports,
        increment: addonReports
      })
    } catch (stripeError: any) {
      console.error('❌ STRIPE ERROR:', stripeError)
      return NextResponse.json(
        { error: stripeError.message || "Failed to verify add-on purchase" },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("❌ ERROR IN ADD-ON VERIFICATION:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

