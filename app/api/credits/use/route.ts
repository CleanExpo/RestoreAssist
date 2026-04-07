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
    const rateLimited = await applyRateLimit(request, { maxRequests: 30, prefix: "credits-use", key: session.user.id })
    if (rateLimited) return rateLimited

    const body = await request.json()
    const rawCredits = body.credits ?? 1
    // Validate: credits must be a positive integer between 1 and 100
    if (!Number.isInteger(rawCredits) || rawCredits < 1 || rawCredits > 100) {
      return NextResponse.json(
        { error: "credits must be an integer between 1 and 100" },
        { status: 400 }
      )
    }
    const credits = rawCredits as number

    // Get effective subscription (Admin's for Managers/Technicians)
    const effectiveSub = await getEffectiveSubscription(session.user.id)

    if (!effectiveSub) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Only TRIAL, ACTIVE, and LIFETIME subscriptions may consume credits
    const ALLOWED_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"]
    if (!ALLOWED_STATUSES.includes(effectiveSub.subscriptionStatus ?? "")) {
      return NextResponse.json(
        { error: "Active subscription required", upgradeRequired: true },
        { status: 402 }
      )
    }

    const ownerId = await getOrganizationOwner(session.user.id)
    const targetUserId = ownerId || session.user.id

    // Trial users: unlimited reports during 30-day trial - no deduction
    const isTrialWithinPeriod = effectiveSub.subscriptionStatus === 'TRIAL' &&
      (!effectiveSub.trialEndsAt || new Date() <= new Date(effectiveSub.trialEndsAt))
    if (isTrialWithinPeriod) {
      const owner = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { totalCreditsUsed: true },
      })
      return NextResponse.json({
        success: true,
        creditsRemaining: null,
        totalCreditsUsed: owner?.totalCreditsUsed ?? 0,
        subscriptionStatus: 'TRIAL',
      })
    }

    let updatedUser: { creditsRemaining: number | null; totalCreditsUsed: number | null; subscriptionStatus: string | null } | null

    if (effectiveSub.subscriptionStatus === 'TRIAL') {
      // Atomic compare-and-decrement: only succeeds if balance covers the cost.
      // Prevents two simultaneous requests from both passing the balance check and
      // both spending from the same credit balance (classic read-modify-write race).
      const result = await prisma.user.updateMany({
        where: { id: targetUserId, creditsRemaining: { gte: credits } },
        data: {
          creditsRemaining: { decrement: credits },
          totalCreditsUsed: { increment: credits },
        },
      })
      if (result.count === 0) {
        return NextResponse.json({
          error: "Insufficient credits",
          creditsRemaining: 0,
          upgradeRequired: true,
        }, { status: 402 })
      }
      updatedUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { creditsRemaining: true, totalCreditsUsed: true, subscriptionStatus: true },
      })
    } else {
      // ACTIVE/LIFETIME subscribers: track usage only, no credit deduction
      updatedUser = await prisma.user.update({
        where: { id: targetUserId },
        data: { totalCreditsUsed: { increment: credits } },
        select: { creditsRemaining: true, totalCreditsUsed: true, subscriptionStatus: true },
      })
    }

    return NextResponse.json({
      success: true,
      creditsRemaining: updatedUser?.creditsRemaining ?? null,
      totalCreditsUsed: updatedUser?.totalCreditsUsed ?? 0,
      subscriptionStatus: updatedUser?.subscriptionStatus ?? null,
    })
  } catch (error) {
    console.error("Error using credits:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
