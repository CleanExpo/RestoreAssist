import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteContext = {
  params: Promise<{ id: string }>
}

// GET - Get audit logs for a specific inspection
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await context.params
    const { searchParams } = new URL(request.url)

    const actionFilter = searchParams.get("action")
    const fromParam = searchParams.get("from")
    const toParam = searchParams.get("to")

    // Verify the inspection belongs to the current user
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    // Build dynamic where clause
    const where: {
      inspectionId: string
      action?: { contains: string; mode: "insensitive" }
      timestamp?: { gte?: Date; lte?: Date }
    } = { inspectionId: id }

    if (actionFilter && actionFilter !== "all") {
      where.action = { contains: actionFilter, mode: "insensitive" }
    }

    if (fromParam || toParam) {
      where.timestamp = {}
      if (fromParam) {
        const from = new Date(fromParam)
        if (!isNaN(from.getTime())) where.timestamp.gte = from
      }
      if (toParam) {
        const to = new Date(toParam)
        if (!isNaN(to.getTime())) where.timestamp.lte = to
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
      }),
      prisma.auditLog.count({ where }),
    ])

    return NextResponse.json({ logs, total })
  } catch (error) {
    console.error("Error fetching audit logs:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
