import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"
import { getUserReportLimits } from "@/lib/report-limits"
import { getEffectiveSubscription } from "@/lib/organization-credits"
import { getTrialStatus, checkAndUpdateTrialStatus } from "@/lib/trial-handling"

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
        organizationId: true,
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
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day free trial
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

    // Get effective subscription (Admin's for Managers/Technicians, own for Admins)
    const effectiveSub = await getEffectiveSubscription(user.id)
    
    // Get organization owner (Admin) for business information
    const { getOrganizationOwner } = await import("@/lib/organization-credits")
    const ownerId = await getOrganizationOwner(user.id)
    
    // For Managers/Technicians, get Admin's business information
    let businessInfo = {
      businessName: user.businessName,
      businessAddress: user.businessAddress,
      businessLogo: user.businessLogo,
      businessABN: user.businessABN,
      businessPhone: user.businessPhone,
      businessEmail: user.businessEmail,
    }
    
    if (ownerId && ownerId !== user.id) {
      // User is a Manager/Technician - get Admin's business info
      const owner = await prisma.user.findUnique({
        where: { id: ownerId },
        select: {
          businessName: true,
          businessAddress: true,
          businessLogo: true,
          businessABN: true,
          businessPhone: true,
          businessEmail: true,
        }
      })
      
      if (owner) {
        businessInfo = {
          businessName: owner.businessName,
          businessAddress: owner.businessAddress,
          businessLogo: owner.businessLogo,
          businessABN: owner.businessABN,
          businessPhone: owner.businessPhone,
          businessEmail: owner.businessEmail,
        }
      }
    }
    
    // Use effective subscription data for team members
    const subscriptionStatus = effectiveSub?.subscriptionStatus || user.subscriptionStatus
    const subscriptionPlan = effectiveSub?.subscriptionPlan || user.subscriptionPlan
    const creditsRemaining = effectiveSub?.creditsRemaining ?? user.creditsRemaining

    // Get report limits for active subscribers (use owner's account for team members)
    let reportLimits = null
    if (subscriptionStatus === 'ACTIVE') {
      try {
        // For team members, get limits from owner's account
        const targetUserId = ownerId || user.id
        reportLimits = await getUserReportLimits(targetUserId)
      } catch (error: any) {
        // Error fetching report limits
      }
    }

    // Get trial status for trial users
    let trialStatus = null
    if (subscriptionStatus === 'TRIAL') {
      // Check and update trial status if expired
      await checkAndUpdateTrialStatus(user.id)
      trialStatus = await getTrialStatus(user.id)
    }

    return NextResponse.json({
      profile: {
        ...user,
        // Override with effective subscription for team members
        subscriptionStatus: trialStatus?.hasTrialExpired ? 'EXPIRED' : subscriptionStatus,
        subscriptionPlan: subscriptionPlan,
        creditsRemaining: creditsRemaining,
        // Override with Admin's business info for team members
        businessName: businessInfo.businessName,
        businessAddress: businessInfo.businessAddress,
        businessLogo: businessInfo.businessLogo,
        businessABN: businessInfo.businessABN,
        businessPhone: businessInfo.businessPhone,
        businessEmail: businessInfo.businessEmail,
        // Include organizationId to check if user is linked to Admin
        organizationId: user.organizationId,
        createdAt: user.createdAt.toISOString(),
        trialEndsAt: user.trialEndsAt?.toISOString(),
        subscriptionEndsAt: user.subscriptionEndsAt?.toISOString(),
        lastBillingDate: user.lastBillingDate?.toISOString(),
        nextBillingDate: user.nextBillingDate?.toISOString(),
        monthlyResetDate: user.monthlyResetDate?.toISOString(),
        reportLimits: reportLimits,
        // Trial status info
        trialStatus: trialStatus ? {
          isTrialActive: trialStatus.isTrialActive,
          daysRemaining: trialStatus.daysRemaining,
          hasTrialExpired: trialStatus.hasTrialExpired,
          creditsRemaining: trialStatus.creditsRemaining,
        } : null,
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

    // Get user's role to check permissions
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const isAdmin = user.role === "ADMIN"

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
    
    // All users can update their name
    if (name !== undefined) updateData.name = name
    
    // Email updates (if needed in future)
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
    
    // Business information fields - only Admins can update
    if (isAdmin) {
      if (businessName !== undefined) updateData.businessName = businessName
      if (businessAddress !== undefined) updateData.businessAddress = businessAddress
      if (businessLogo !== undefined) updateData.businessLogo = businessLogo
      if (businessABN !== undefined) updateData.businessABN = businessABN
      if (businessPhone !== undefined) updateData.businessPhone = businessPhone
      if (businessEmail !== undefined) updateData.businessEmail = businessEmail
    } else {
      // Managers/Technicians cannot update business info
      // If they try, ignore those fields (they're read-only)
      if (businessName !== undefined || businessAddress !== undefined || businessLogo !== undefined || 
          businessABN !== undefined || businessPhone !== undefined || businessEmail !== undefined) {
      }
    }

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
        role: true,
        organizationId: true,
      }
    })

    // For Managers/Technicians, get Admin's business info
    let businessInfo = {
      businessName: updatedUser.businessName,
      businessAddress: updatedUser.businessAddress,
      businessLogo: updatedUser.businessLogo,
      businessABN: updatedUser.businessABN,
      businessPhone: updatedUser.businessPhone,
      businessEmail: updatedUser.businessEmail,
    }
    
    if (!isAdmin && updatedUser.organizationId) {
      const { getOrganizationOwner } = await import("@/lib/organization-credits")
      const ownerId = await getOrganizationOwner(updatedUser.id)
      
      if (ownerId && ownerId !== updatedUser.id) {
        const owner = await prisma.user.findUnique({
          where: { id: ownerId },
          select: {
            businessName: true,
            businessAddress: true,
            businessLogo: true,
            businessABN: true,
            businessPhone: true,
            businessEmail: true,
          }
        })
        
        if (owner) {
          businessInfo = {
            businessName: owner.businessName,
            businessAddress: owner.businessAddress,
            businessLogo: owner.businessLogo,
            businessABN: owner.businessABN,
            businessPhone: owner.businessPhone,
            businessEmail: owner.businessEmail,
          }
        }
      }
    }

    return NextResponse.json({ 
      profile: {
        ...updatedUser,
        // Override with Admin's business info for Managers/Technicians
        businessName: businessInfo.businessName,
        businessAddress: businessInfo.businessAddress,
        businessLogo: businessInfo.businessLogo,
        businessABN: businessInfo.businessABN,
        businessPhone: businessInfo.businessPhone,
        businessEmail: businessInfo.businessEmail,
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
