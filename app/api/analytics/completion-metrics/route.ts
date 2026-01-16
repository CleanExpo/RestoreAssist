import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { average, median, calculatePercentiles } from "@/lib/analytics-utils"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dateRange = searchParams.get("dateRange") || "90days"
    const userIdParam = searchParams.get("userId")

    // If userId is provided, validate that the user belongs to the same organization
    let targetUserId = session.user.id
    if (userIdParam && userIdParam !== session.user.id) {
      const isAdmin = session.user.role === "ADMIN"
      const isManager = session.user.role === "MANAGER"
      
      // Only Admins and Managers can view other users' analytics
      if (!isAdmin && !isManager) {
        return NextResponse.json(
          { error: "Only Admins and Managers can view other team members' analytics" },
          { status: 403 }
        )
      }

      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { organizationId: true, role: true }
      })

      if (!currentUser?.organizationId) {
        return NextResponse.json(
          { error: "You are not part of an organization" },
          { status: 400 }
        )
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: userIdParam },
        select: { id: true, organizationId: true, role: true, managedById: true }
      })

      if (!targetUser || targetUser.organizationId !== currentUser.organizationId) {
        return NextResponse.json(
          { error: "User not found or not in your organization" },
          { status: 403 }
        )
      }

      // Admin: Can view Managers and Technicians (not other Admins)
      if (isAdmin) {
        if (targetUser.role === "ADMIN" && targetUser.id !== session.user.id) {
          return NextResponse.json(
            { error: "Cannot view other Admin accounts" },
            { status: 403 }
          )
        }
      }
      
      // Manager: Can only view Technicians (all Technicians in the organization)
      if (isManager) {
        if (targetUser.role !== "USER") {
          return NextResponse.json(
            { error: "Managers can only view Technicians' analytics" },
            { status: 403 }
          )
        }
        // Managers can view any Technician in their organization (not just the ones they manage)
        // This allows them to see analytics for all Technicians, similar to how Admins see all team members
      }

      targetUserId = userIdParam
    }

    // Get date filter
    const now = new Date()
    let startDate: Date

    switch (dateRange) {
      case "7days":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case "30days":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case "90days":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    }

    // Fetch completed reports
    const reports = await prisma.report.findMany({
      where: {
        userId: targetUserId,
        createdAt: {
          gte: startDate,
        },
        status: {
          in: ["COMPLETED", "APPROVED"],
        },
      },
      orderBy: { createdAt: "asc" },
    })

    // Handle empty data case
    if (reports.length === 0) {
      return NextResponse.json({
        overall: {
          avgDays: 0,
          medianDays: 0,
          p95Days: 0,
          totalReports: 0,
        },
        byHazardType: [],
        timeSeries: [],
        trend: "stable",
      })
    }

    // Calculate completion times (in days)
    const completionTimes: number[] = []
    const timeSeriesData = new Map<string, number[]>()

    reports.forEach((report) => {
      const completionDate = report.completionDate || report.updatedAt
      const days =
        (completionDate.getTime() - report.createdAt.getTime()) /
        (1000 * 60 * 60 * 24)

      if (days > 0 && days < 365) {
        // Reasonable completion time
        completionTimes.push(days)

        // Group by week
        const weekStart = new Date(report.createdAt)
        weekStart.setDate(
          weekStart.getDate() - weekStart.getDay()
        )
        const weekKey = weekStart.toISOString().split("T")[0]

        const weekData = timeSeriesData.get(weekKey) || []
        weekData.push(days)
        timeSeriesData.set(weekKey, weekData)
      }
    })

    // Calculate overall metrics
    const avgDays = average(completionTimes)
    const medianDays = median(completionTimes)
    const percentiles = calculatePercentiles(completionTimes, [95])
    const p95Days = percentiles[95] || 0

    // Group by hazard type
    const hazardMetrics = new Map<
      string,
      {
        hazardType: string
        avgDays: number
        count: number
      }
    >()

    reports.forEach((report) => {
      const completionDate = report.completionDate || report.updatedAt
      const days =
        (completionDate.getTime() - report.createdAt.getTime()) /
        (1000 * 60 * 60 * 24)

      if (days > 0 && days < 365) {
        const hazard = report.hazardType || "Other"
        const existing = hazardMetrics.get(hazard) || {
          hazardType: hazard,
          avgDays: 0,
          count: 0,
        }

        hazardMetrics.set(hazard, {
          hazardType: hazard,
          avgDays: (existing.avgDays * existing.count + days) / (existing.count + 1),
          count: existing.count + 1,
        })
      }
    })

    const byHazardType = Array.from(hazardMetrics.values())
      .sort((a, b) => b.avgDays - a.avgDays)

    // Time series data
    const timeSeries = Array.from(timeSeriesData.entries())
      .map(([date, times]) => ({
        date,
        avgCompletionDays: average(times),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Determine trend
    let trend: "improving" | "stable" | "declining" = "stable"
    if (timeSeries.length >= 2) {
      const firstHalf = timeSeries.slice(
        0,
        Math.floor(timeSeries.length / 2)
      )
      const secondHalf = timeSeries.slice(Math.floor(timeSeries.length / 2))

      const firstAvg =
        firstHalf.reduce((sum, x) => sum + x.avgCompletionDays, 0) /
        firstHalf.length
      const secondAvg =
        secondHalf.reduce((sum, x) => sum + x.avgCompletionDays, 0) /
        secondHalf.length

      const change = ((firstAvg - secondAvg) / firstAvg) * 100

      if (change > 5) trend = "improving"
      else if (change < -5) trend = "declining"
    }

    return NextResponse.json({
      overall: {
        avgDays: Math.round(avgDays * 10) / 10,
        medianDays: Math.round(medianDays * 10) / 10,
        p95Days: Math.round(p95Days * 10) / 10,
        totalReports: reports.length,
      },
      byHazardType,
      timeSeries,
      trend,
    })
  } catch (error) {
    console.error("Error calculating completion metrics:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
