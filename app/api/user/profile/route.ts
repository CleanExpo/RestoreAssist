import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"
import { getUserReportLimits } from "@/lib/report-limits"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        subscriptionId: true,
        stripeCustomerId: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
        creditsRemaining: true,
        totalCreditsUsed: true,
        lastBillingDate: true,
        nextBillingDate: true,
        businessName: true,
        businessAddress: true,
        businessLogo: true,
        businessABN: true,
        businessPhone: true,
        businessEmail: true,
        addonReports: true,
        monthlyReportsUsed: true,
        monthlyResetDate: true,
      }
    })

    if (!user) {
      // Create Stripe customer for new user
      let stripeCustomerId = null
      try {
        const stripeCustomer = await stripe.customers.create({
          email: session.user.email!,
          name: session.user.name || undefined,
          metadata: {
            userId: session.user.id,
          },
        })
        stripeCustomerId = stripeCustomer.id
      } catch (stripeError) {
        console.error('Error creating Stripe customer:', stripeError)
        // Continue without Stripe customer ID - user can still use the app
      }

      // If user doesn't exist in database, create a basic profile
      const newUser = await prisma.user.create({
        data: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email!,
          image: session.user.image,
          subscriptionStatus: 'TRIAL',
          creditsRemaining: 3,
          totalCreditsUsed: 0,
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          stripeCustomerId: stripeCustomerId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
          subscriptionStatus: true,
          subscriptionPlan: true,
          subscriptionId: true,
          stripeCustomerId: true,
          trialEndsAt: true,
          subscriptionEndsAt: true,
          creditsRemaining: true,
          totalCreditsUsed: true,
          lastBillingDate: true,
          nextBillingDate: true,
          businessName: true,
          businessAddress: true,
          businessLogo: true,
          businessABN: true,
          businessPhone: true,
          businessEmail: true,
        }
      })

      return NextResponse.json({ 
        profile: {
          ...newUser,
          createdAt: newUser.createdAt.toISOString(),
          trialEndsAt: newUser.trialEndsAt?.toISOString(),
          subscriptionEndsAt: newUser.subscriptionEndsAt?.toISOString(),
          lastBillingDate: newUser.lastBillingDate?.toISOString(),
          nextBillingDate: newUser.nextBillingDate?.toISOString(),
        }
      })
    }

    // Get report limits for active subscribers
    let reportLimits = null
    if (user.subscriptionStatus === 'ACTIVE') {
      try {
        reportLimits = await getUserReportLimits(user.id)
      } catch (error: any) {
        // Error fetching report limits
      }
    }

    return NextResponse.json({ 
      profile: {
        ...user,
        createdAt: user.createdAt.toISOString(),
        trialEndsAt: user.trialEndsAt?.toISOString(),
        subscriptionEndsAt: user.subscriptionEndsAt?.toISOString(),
        lastBillingDate: user.lastBillingDate?.toISOString(),
        nextBillingDate: user.nextBillingDate?.toISOString(),
        monthlyResetDate: user.monthlyResetDate?.toISOString(),
        reportLimits: reportLimits,
      }
    })
  } catch (error) {
    console.error("Error fetching user profile:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { 
      name, 
      email,
      businessName,
      businessAddress,
      businessLogo,
      businessABN,
      businessPhone,
      businessEmail
    } = body

    // Build update data object
    const updateData: any = {}
    
    if (name !== undefined) updateData.name = name
    if (email !== undefined) {
    // Check if email is already taken by another user
    const existingUser = await prisma.user.findFirst({
      where: {
        email: email,
        id: { not: session.user.id }
      }
    })

    if (existingUser) {
      return NextResponse.json({ error: "Email already in use" }, { status: 400 })
    }
      updateData.email = email
    }
    
    // Business information fields
    if (businessName !== undefined) updateData.businessName = businessName
    if (businessAddress !== undefined) updateData.businessAddress = businessAddress
    if (businessLogo !== undefined) updateData.businessLogo = businessLogo
    if (businessABN !== undefined) updateData.businessABN = businessABN
    if (businessPhone !== undefined) updateData.businessPhone = businessPhone
    if (businessEmail !== undefined) updateData.businessEmail = businessEmail

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        subscriptionId: true,
        stripeCustomerId: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
        creditsRemaining: true,
        totalCreditsUsed: true,
        lastBillingDate: true,
        nextBillingDate: true,
        businessName: true,
        businessAddress: true,
        businessLogo: true,
        businessABN: true,
        businessPhone: true,
        businessEmail: true,
      }
    })

    return NextResponse.json({ 
      profile: {
        ...updatedUser,
        createdAt: updatedUser.createdAt.toISOString(),
        trialEndsAt: updatedUser.trialEndsAt?.toISOString(),
        subscriptionEndsAt: updatedUser.subscriptionEndsAt?.toISOString(),
        lastBillingDate: updatedUser.lastBillingDate?.toISOString(),
        nextBillingDate: updatedUser.nextBillingDate?.toISOString(),
      }
    })
  } catch (error) {
    console.error("Error updating user profile:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
