import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST - Delete multiple inspections (user must own all)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const ids = Array.isArray(body.ids) ? body.ids : []

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "At least one inspection id is required" },
        { status: 400 }
      )
    }

    // Only delete inspections that belong to the current user
    const deleted = await prisma.inspection.deleteMany({
      where: {
        id: { in: ids },
        userId: session.user.id,
      },
    })

    return NextResponse.json({
      success: true,
      deletedCount: deleted.count,
    })
  } catch (error) {
    console.error("Error bulk deleting inspections:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
