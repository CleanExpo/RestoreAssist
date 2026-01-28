import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/analytics/activity-feed
 * Returns team activity feed (report creation, completion, updates)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "50")
    const userIdParam = searchParams.get("userId")

    // Get user's organization
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true, role: true },
    })

    if (!currentUser?.organizationId) {
      return NextResponse.json(
        { error: "You are not part of an organization" },
        { status: 400 }
      )
    }

    // Determine target user
    let targetUserId: string | null = null
    if (userIdParam && userIdParam !== session.user.id) {
      const isAdmin = currentUser.role === "ADMIN"
      const isManager = currentUser.role === "MANAGER"

      if (!isAdmin && !isManager) {
        return NextResponse.json(
          { error: "Only Admins and Managers can view other team members' activity" },
          { status: 403 }
        )
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: userIdParam },
        select: { id: true, organizationId: true, role: true },
      })

      if (!targetUser || targetUser.organizationId !== currentUser.organizationId) {
        return NextResponse.json(
          { error: "User not found or not in your organization" },
          { status: 403 }
        )
      }

      if (isAdmin && targetUser.role === "ADMIN" && targetUser.id !== session.user.id) {
        return NextResponse.json(
          { error: "Cannot view other Admin accounts" },
          { status: 403 }
        )
      }

      if (isManager && targetUser.role !== "USER") {
        return NextResponse.json(
          { error: "Managers can only view Technicians' activity" },
          { status: 403 }
        )
      }

      targetUserId = userIdParam
    }

    // Build where clause
    const where: any = {}
    if (targetUserId) {
      where.userId = targetUserId
    } else {
      // Get all users in the organization
      const orgUsers = await prisma.user.findMany({
        where: { organizationId: currentUser.organizationId },
        select: { id: true },
      })
      where.userId = { in: orgUsers.map((u) => u.id) }
    }

    // Fetch recent reports with user info
    const reports = await prisma.report.findMany({
      where,
      select: {
        id: true,
        title: true,
        clientName: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        completionDate: true,
        userId: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    })

    // Format activity feed items
    const activities = reports.map((report) => {
      const user = report.user
      let activityType: string
      let description: string
      let timestamp: Date

      if (report.completionDate && report.status === "COMPLETED") {
        activityType = "completed"
        description = `Completed report: ${report.title || report.clientName}`
        timestamp = report.completionDate
      } else if (report.updatedAt.getTime() - report.createdAt.getTime() > 60000) {
        // Updated (more than 1 minute after creation)
        activityType = "updated"
        description = `Updated report: ${report.title || report.clientName}`
        timestamp = report.updatedAt
      } else {
        activityType = "created"
        description = `Created report: ${report.title || report.clientName}`
        timestamp = report.createdAt
      }

      return {
        id: `${report.id}-${activityType}`,
        type: activityType,
        description,
        timestamp: timestamp.toISOString(),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        report: {
          id: report.id,
          title: report.title,
          clientName: report.clientName,
          status: report.status,
        },
      }
    })

    // Sort by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json({
      activities,
      total: activities.length,
    })
  } catch (error) {
    console.error("Error fetching activity feed:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
