import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * ADMIN ENDPOINT - Clear test mode Stripe customer IDs
 * DELETE THIS FILE after use!
 *
 * This clears stripeCustomerId from all users so fresh live mode customers can be created
 */
export async function POST() {
  // Only allow authenticated admin users
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Only allow your email (security measure)
  if (session.user.email !== "phill.mcgurk@gmail.com") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    // Find users with customer IDs
    const usersWithCustomers = await prisma.user.findMany({
      where: {
        stripeCustomerId: {
          not: null
        }
      },
      select: {
        id: true,
        email: true,
        stripeCustomerId: true,
      }
    })

    console.log(`[Admin] Found ${usersWithCustomers.length} users with Stripe customer IDs`)

    // Clear all test mode customer IDs
    const result = await prisma.user.updateMany({
      where: {
        stripeCustomerId: {
          not: null
        }
      },
      data: {
        stripeCustomerId: null
      }
    })

    console.log(`[Admin] Cleared ${result.count} test mode customer IDs`)

    return NextResponse.json({
      success: true,
      message: `Cleared ${result.count} test mode customer IDs`,
      users: usersWithCustomers.map(u => ({
        email: u.email,
        oldCustomerId: u.stripeCustomerId,
      })),
    })

  } catch (error: any) {
    console.error('[Admin] Error clearing customer IDs:', error)
    return NextResponse.json({
      error: "Failed to clear customer IDs",
      details: error.message,
    }, { status: 500 })
  }
}
