import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getEffectiveSubscription, getOrganizationOwner } from "@/lib/organization-credits"
import { applyRateLimit } from "@/lib/rate-limiter"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limit: 30 credit operations per 15 minutes per user
    const rateLimited = applyRateLimit(request, { maxRequests: 30, prefix: "credits-use", key: session.user.id })
    if (rateLimited) return rateLimited

    const { credits = 1 } = await request.json()

    // Get effective subscription (Admin's for Managers/Technicians)
    const effectiveSub = await getEffectiveSubscription(session.user.id)
    
    if (!effectiveSub) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const ownerId = await getOrganizationOwner(session.user.id)
    const targetUserId = ownerId || session.user.id
    const owner = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        creditsRemaining: true,
        totalCreditsUsed: true,
        subscriptionStatus: true,
      }
    })

    if (!owner) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Trial users: unlimited reports during 30-day trial - no deduction
    const isTrialWithinPeriod = effectiveSub.subscriptionStatus === 'TRIAL' &&
      (!effectiveSub.trialEndsAt || new Date() <= new Date(effectiveSub.trialEndsAt))
    if (isTrialWithinPeriod) {
      return NextResponse.json({
        success: true,
        creditsRemaining: null,
        totalCreditsUsed: owner.totalCreditsUsed ?? 0,
        subscriptionStatus: 'TRIAL',
      })
    }

    if (effectiveSub.subscriptionStatus === 'TRIAL' && (effectiveSub.creditsRemaining || 0) < credits) {
      return NextResponse.json({
        error: "Insufficient credits",
        creditsRemaining: effectiveSub.creditsRemaining || 0,
        upgradeRequired: true
      }, { status: 402 })
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        creditsRemaining: effectiveSub.subscriptionStatus === 'TRIAL'
          ? Math.max(0, (owner.creditsRemaining || 0) - credits)
          : owner.creditsRemaining,
        totalCreditsUsed: (owner.totalCreditsUsed || 0) + credits,
      },
      select: {
        creditsRemaining: true,
        totalCreditsUsed: true,
        subscriptionStatus: true,
      }
    })

    return NextResponse.json({
      success: true,
      creditsRemaining: updatedUser.creditsRemaining,
      totalCreditsUsed: updatedUser.totalCreditsUsed,
      subscriptionStatus: updatedUser.subscriptionStatus,
    })
  } catch (error) {
    console.error("Error using credits:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
