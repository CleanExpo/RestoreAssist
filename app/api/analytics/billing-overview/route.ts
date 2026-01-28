import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/analytics/billing-overview
 * Returns revenue/billing overview for admin users
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only admins can access billing overview
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, organizationId: true },
    })

    if (user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admins can view billing overview" },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const months = parseInt(searchParams.get("months") || "12")

    // Calculate date range
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
    startDate.setHours(0, 0, 0, 0)

    // Get all users in the organization
    const orgUsers = await prisma.user.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true },
    })

    // Fetch all reports with revenue data
    const reports = await prisma.report.findMany({
      where: {
        userId: { in: orgUsers.map((u) => u.id) },
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        id: true,
        totalCost: true,
        createdAt: true,
        status: true,
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
      orderBy: { createdAt: "desc" },
    })

    // Calculate monthly revenue
    const monthlyRevenue = new Map<string, number>()
    const monthlyReports = new Map<string, number>()

    // Initialize all months
    for (let i = 0; i < months; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      monthlyRevenue.set(monthKey, 0)
      monthlyReports.set(monthKey, 0)
    }

    // Aggregate revenue by month
    let totalRevenue = 0
    let totalReports = 0
    reports.forEach((report) => {
      const reportDate = new Date(report.createdAt)
      const monthKey = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, "0")}`

      const revenue = report.totalCost || 0
      totalRevenue += revenue
      totalReports++

      monthlyRevenue.set(monthKey, (monthlyRevenue.get(monthKey) || 0) + revenue)
      monthlyReports.set(monthKey, (monthlyReports.get(monthKey) || 0) + 1)
    })

    // Convert to chart data
    const chartData = Array.from(monthlyRevenue.entries())
      .map(([monthKey, revenue]) => {
        const [year, month] = monthKey.split("-")
        const date = new Date(parseInt(year), parseInt(month) - 1, 1)
        return {
          month: date.toLocaleDateString("en-AU", { month: "short", year: "numeric" }),
          monthKey,
          revenue: Math.round(revenue),
          reports: monthlyReports.get(monthKey) || 0,
        }
      })
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))

    // Calculate revenue by user role
    const revenueByRole = new Map<string, { revenue: number; reports: number }>()
    reports.forEach((report) => {
      const role = report.user.role
      const existing = revenueByRole.get(role) || { revenue: 0, reports: 0 }
      existing.revenue += report.totalCost || 0
      existing.reports++
      revenueByRole.set(role, existing)
    })

    // Top revenue generators
    const userRevenue = new Map<string, { user: any; revenue: number; reports: number }>()
    reports.forEach((report) => {
      const existing = userRevenue.get(report.userId) || {
        user: report.user,
        revenue: 0,
        reports: 0,
      }
      existing.revenue += report.totalCost || 0
      existing.reports++
      userRevenue.set(report.userId, existing)
    })

    const topGenerators = Array.from(userRevenue.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((item) => ({
        userId: item.user.id,
        userName: item.user.name || item.user.email,
        userEmail: item.user.email,
        userRole: item.user.role,
        revenue: Math.round(item.revenue),
        reports: item.reports,
      }))

    return NextResponse.json({
      summary: {
        totalRevenue: Math.round(totalRevenue),
        totalReports,
        averageRevenuePerReport: totalReports > 0 ? Math.round(totalRevenue / totalReports) : 0,
        averageRevenuePerMonth: Math.round(totalRevenue / months),
      },
      chartData,
      revenueByRole: Array.from(revenueByRole.entries()).map(([role, data]) => ({
        role,
        revenue: Math.round(data.revenue),
        reports: data.reports,
      })),
      topGenerators,
    })
  } catch (error) {
    console.error("Error fetching billing overview:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
