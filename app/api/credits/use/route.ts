import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getEffectiveSubscription, getOrganizationOwner } from "@/lib/organization-credits"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { credits = 1 } = await request.json()

    // Get effective subscription (Admin's for Managers/Technicians)
    const effectiveSub = await getEffectiveSubscription(session.user.id)
    
    if (!effectiveSub) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check if user has enough credits
    if (effectiveSub.subscriptionStatus === 'TRIAL' && (effectiveSub.creditsRemaining || 0) < credits) {
      return NextResponse.json({ 
        error: "Insufficient credits", 
        creditsRemaining: effectiveSub.creditsRemaining || 0,
        upgradeRequired: true 
      }, { status: 402 })
    }

    // Get the organization owner (Admin) - they own the credits
    const ownerId = await getOrganizationOwner(session.user.id)
    const targetUserId = ownerId || session.user.id

    // Get current owner data
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

    // Update credits on the owner's account
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        creditsRemaining: effectiveSub.subscriptionStatus === 'TRIAL' 
          ? Math.max(0, (owner.creditsRemaining || 0) - credits)
          : owner.creditsRemaining, // Unlimited for paid plans
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
