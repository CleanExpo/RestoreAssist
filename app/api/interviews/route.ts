import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET - List interview sessions for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const status = searchParams.get("status")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "20")
    const skip = (page - 1) * limit

    const where: any = { userId: session.user.id }
    if (status) {
      where.status = status
    }

    const [sessions, total] = await Promise.all([
      prisma.interviewSession.findMany({
        where,
        include: {
          formTemplate: {
            select: { id: true, name: true, formType: true, category: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.interviewSession.count({ where }),
    ])

    return NextResponse.json({
      sessions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error("Error fetching interview sessions:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
