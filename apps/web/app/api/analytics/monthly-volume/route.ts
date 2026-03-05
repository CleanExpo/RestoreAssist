import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface MonthlyData {
  month: string
  monthLabel: string
  reports: number
  revenue: number
  completed: number
  pending: number
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const months = parseInt(searchParams.get("months") || "12")
    const userIdParam = searchParams.get("userId")

    // Validate user access for team member analytics
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
        select: { organizationId: true }
      })

      if (!currentUser?.organizationId) {
        return NextResponse.json(
          { error: "You are not part of an organization" },
          { status: 400 }
        )
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: userIdParam },
        select: { id: true, organizationId: true, role: true }
      })

      if (!targetUser || targetUser.organizationId !== currentUser.organizationId) {
        return NextResponse.json(
          { error: "User not found or not in your organization" },
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
        totalEstimate: true,
      },
      orderBy: { createdAt: "asc" },
    })

    // Group by month
    const monthlyMap = new Map<string, MonthlyData>()

    // Initialize all months
    for (let i = 0; i < months; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const monthLabel = date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })

      monthlyMap.set(monthKey, {
        month: monthKey,
        monthLabel,
        reports: 0,
        revenue: 0,
        completed: 0,
        pending: 0,
      })
    }

    // Aggregate report data
    reports.forEach((report) => {
      const date = new Date(report.createdAt)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

      const data = monthlyMap.get(monthKey)
      if (data) {
        data.reports += 1
        data.revenue += report.totalEstimate || 0

        if (report.status === 'COMPLETED' || report.status === 'APPROVED') {
          data.completed += 1
        } else {
          data.pending += 1
        }
      }
    })

    // Convert to array and sort
    const monthlyData = Array.from(monthlyMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))

    // Calculate trends
    const totalReports = monthlyData.reduce((sum, m) => sum + m.reports, 0)
    const totalRevenue = monthlyData.reduce((sum, m) => sum + m.revenue, 0)
    const avgMonthlyReports = totalReports / months
    const avgMonthlyRevenue = totalRevenue / months

    // Calculate growth (compare last 3 months to previous 3 months)
    const recentMonths = monthlyData.slice(-3)
    const previousMonths = monthlyData.slice(-6, -3)

    const recentTotal = recentMonths.reduce((sum, m) => sum + m.reports, 0)
    const previousTotal = previousMonths.reduce((sum, m) => sum + m.reports, 0)

    let growthRate = 0
    if (previousTotal > 0) {
      growthRate = ((recentTotal - previousTotal) / previousTotal) * 100
    }

    // Find best and worst months
    const sortedByReports = [...monthlyData].sort((a, b) => b.reports - a.reports)
    const bestMonth = sortedByReports[0]
    const worstMonth = sortedByReports[sortedByReports.length - 1]

    // Year-to-date
    const currentYear = now.getFullYear()
    const ytdData = monthlyData.filter(m => m.month.startsWith(String(currentYear)))
    const ytdReports = ytdData.reduce((sum, m) => sum + m.reports, 0)
    const ytdRevenue = ytdData.reduce((sum, m) => sum + m.revenue, 0)

    return NextResponse.json({
      monthlyData,
      summary: {
        totalReports,
        totalRevenue,
        avgMonthlyReports: Math.round(avgMonthlyReports * 10) / 10,
        avgMonthlyRevenue: Math.round(avgMonthlyRevenue),
        growthRate: Math.round(growthRate * 10) / 10,
        bestMonth: bestMonth ? {
          label: bestMonth.monthLabel,
          reports: bestMonth.reports,
        } : null,
        worstMonth: worstMonth ? {
          label: worstMonth.monthLabel,
          reports: worstMonth.reports,
        } : null,
        ytd: {
          reports: ytdReports,
          revenue: ytdRevenue,
        },
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
