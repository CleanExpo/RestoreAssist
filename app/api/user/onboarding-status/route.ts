import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/user/onboarding-status
 * Check if user has completed onboarding (API key setup)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({
        hasCompletedOnboarding: false,
        isAuthenticated: false
      })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        hasCompletedOnboarding: true,
        anthropicApiKey: true,
      }
    })

    if (!user) {
      return NextResponse.json({
        hasCompletedOnboarding: false,
        isAuthenticated: true
      })
    }

    // User has completed onboarding if they have the flag set AND have an API key
    const hasCompletedOnboarding = user.hasCompletedOnboarding && !!user.anthropicApiKey

    return NextResponse.json({
      hasCompletedOnboarding,
      isAuthenticated: true
    })
  } catch (error) {
    console.error("Error checking onboarding status:", error)
    return NextResponse.json({
      error: "Internal server error",
      hasCompletedOnboarding: false,
      isAuthenticated: false
    }, { status: 500 })
  }
}
