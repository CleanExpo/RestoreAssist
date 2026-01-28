import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST - Delete multiple interview sessions (user must own all)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const body = await request.json()
    const ids = Array.isArray(body.ids) ? body.ids : []

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "At least one session id is required" },
        { status: 400 }
      )
    }

    const deleted = await prisma.interviewSession.deleteMany({
      where: {
        id: { in: ids },
        userId: user.id,
      },
    })

    return NextResponse.json({
      success: true,
      deletedCount: deleted.count,
    })
  } catch (error) {
    console.error("Error bulk deleting interview sessions:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
