import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteContext = {
  params: Promise<{ id: string }>
}

// GET - Returns AuditLog entries for an inspection (most recent first)
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await context.params

    // Confirm the inspection belongs to the requesting user
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    // Fetch audit log entries — exclude large change-diff fields
    const entries = await prisma.auditLog.findMany({
      where: { inspectionId: id },
      orderBy: { timestamp: "desc" },
      take: 20,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        device: true,
        userId: true,
        timestamp: true,
      },
    })

    // Resolve user names in a single query
    const userIds = [...new Set(entries.map((e) => e.userId))]
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    })
    const userMap: Record<string, string | null> = {}
    for (const u of users) {
      userMap[u.id] = u.name
    }

    const activity = entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      device: entry.device,
      createdAt: entry.timestamp.toISOString(),
      userName: userMap[entry.userId] ?? null,
    }))

    return NextResponse.json({ activity })
  } catch (error) {
    console.error("Error fetching inspection activity:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
