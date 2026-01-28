import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/analytics/monthly-volume
 * Returns monthly report volume data for chart visualization
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const months = parseInt(searchParams.get("months") || "12")
    const userIdParam = searchParams.get("userId")

    // Determine target user (same logic as other analytics endpoints)
    let targetUserId = session.user.id
    if (userIdParam && userIdParam !== session.user.id) {
      const isAdmin = session.user.role === "ADMIN"
      const isManager = session.user.role === "MANAGER"

      if (!isAdmin && !isManager) {
        return NextResponse.json(
          { error: "Only Admins and Managers can view other team members' analytics" },
          { status: 403 }
        )
      }

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
          { error: "Managers can only view Technicians' analytics" },
          { status: 403 }
        )
      }

      targetUserId = userIdParam
    }

    // Calculate date range
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
    startDate.setHours(0, 0, 0, 0)

    // Fetch reports grouped by month
    const reports = await prisma.report.findMany({
      where: {
        userId: targetUserId,
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        id: true,
        createdAt: true,
        status: true,
        completionDate: true,
      },
      orderBy: { createdAt: "asc" },
    })

    // Group by month
    const monthlyData = new Map<string, { total: number; completed: number }>()

    // Initialize all months in range
    for (let i = 0; i < months; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      monthlyData.set(monthKey, { total: 0, completed: 0 })
    }

    // Count reports by month
    reports.forEach((report) => {
      const reportDate = new Date(report.createdAt)
      const monthKey = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, "0")}`

      const existing = monthlyData.get(monthKey) || { total: 0, completed: 0 }
      existing.total++
      if (report.status === "COMPLETED" || report.status === "APPROVED" || report.completionDate) {
        existing.completed++
      }
      monthlyData.set(monthKey, existing)
    })

    // Convert to array format for chart
    const chartData = Array.from(monthlyData.entries())
      .map(([monthKey, data]) => {
        const [year, month] = monthKey.split("-")
        const date = new Date(parseInt(year), parseInt(month) - 1, 1)
        return {
          month: date.toLocaleDateString("en-AU", { month: "short", year: "numeric" }),
          monthKey,
          total: data.total,
          completed: data.completed,
          inProgress: data.total - data.completed,
        }
      })
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))

    // Calculate totals
    const totalReports = reports.length
    const totalCompleted = reports.filter(
      (r) => r.status === "COMPLETED" || r.status === "APPROVED" || r.completionDate
    ).length
    const completionRate = totalReports > 0 ? Math.round((totalCompleted / totalReports) * 100) : 0

    return NextResponse.json({
      data: chartData,
      summary: {
        totalReports,
        totalCompleted,
        completionRate,
        averagePerMonth: Math.round(totalReports / months),
      },
    })
  } catch (error) {
    console.error("Error fetching monthly volume:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
