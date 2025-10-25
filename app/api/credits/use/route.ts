import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { credits = 1 } = await request.json()

    // Get current user data
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        subscriptionStatus: true,
        creditsRemaining: true,
        totalCreditsUsed: true,
      }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check if user has enough credits
    if (user.subscriptionStatus === 'TRIAL' && user.creditsRemaining < credits) {
      return NextResponse.json({ 
        error: "Insufficient credits", 
        creditsRemaining: user.creditsRemaining,
        upgradeRequired: true 
      }, { status: 402 })
    }

    // Update credits
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        creditsRemaining: user.subscriptionStatus === 'TRIAL' 
          ? Math.max(0, user.creditsRemaining - credits)
          : user.creditsRemaining, // Unlimited for paid plans
        totalCreditsUsed: user.totalCreditsUsed + credits,
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
