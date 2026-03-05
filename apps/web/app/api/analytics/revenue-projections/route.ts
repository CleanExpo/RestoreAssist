import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { linearRegression, generateForecast } from "@/lib/analytics-utils"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get("days") || "30", 10)
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

    // Get last 90 days of data for regression
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const reports = await prisma.report.findMany({
      where: {
        userId: targetUserId,
        createdAt: {
          gte: ninetyDaysAgo,
        },
      },
      include: {
        estimates: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            totalIncGST: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })

    // Group by day
    const dailyRevenue = new Map<string, number>()
    reports.forEach((report) => {
      const dateKey = report.createdAt.toISOString().split("T")[0]
      const revenue = report.estimates?.[0]?.totalIncGST || report.totalCost || 0
      dailyRevenue.set(dateKey, (dailyRevenue.get(dateKey) || 0) + revenue)
    })

    // Convert to array for regression
    const sortedDates = Array.from(dailyRevenue.keys()).sort()
    
    // Handle case when there are no reports
    if (sortedDates.length === 0 || reports.length === 0) {
      const today = new Date()
      const historicalForChart: Array<{ date: string; revenue: number; isProjected: boolean }> = []
      const projectedData: Array<{
        date: string
        revenue: number
        isProjected: boolean
        confidence: number
      }> = []

      // Generate empty projections starting from today
      for (let i = 1; i <= days; i++) {
        const projectedDate = new Date(today)
        projectedDate.setDate(projectedDate.getDate() + i)
        projectedData.push({
          date: projectedDate.toISOString().split("T")[0],
          revenue: 0,
          isProjected: true,
          confidence: 0.3,
        })
      }

      return NextResponse.json({
        historical: historicalForChart,
        projected: projectedData,
        slope: 0,
        intercept: 0,
        r_squared: 0,
        projectedTotals: {
          days30: 0,
          days60: 0,
          days90: 0,
        },
        trend: "stable",
      })
    }

    const regressionData = sortedDates.map((date, index) => ({
      x: index,
      y: dailyRevenue.get(date) || 0,
    }))

    // Calculate regression
    const regression = linearRegression(regressionData)

    // Generate forecast
    const lastDate = sortedDates[sortedDates.length - 1]
    const lastDateTime = new Date(lastDate).getTime()
    
    // Validate lastDateTime is a valid date
    if (isNaN(lastDateTime)) {
      const today = new Date()
      const historicalForChart: Array<{ date: string; revenue: number; isProjected: boolean }> = []
      const projectedData: Array<{
        date: string
        revenue: number
        isProjected: boolean
        confidence: number
      }> = []

      for (let i = 1; i <= days; i++) {
        const projectedDate = new Date(today)
        projectedDate.setDate(projectedDate.getDate() + i)
        projectedData.push({
          date: projectedDate.toISOString().split("T")[0],
          revenue: 0,
          isProjected: true,
          confidence: 0.3,
        })
      }

      return NextResponse.json({
        historical: historicalForChart,
        projected: projectedData,
        slope: 0,
        intercept: 0,
        r_squared: 0,
        projectedTotals: {
          days30: 0,
          days60: 0,
          days90: 0,
        },
        trend: "stable",
      })
    }

    const historicalForChart = regressionData.map((p, index) => ({
      date: sortedDates[index],
      revenue: p.y,
      isProjected: false,
    }))

    const projectedData: Array<{
      date: string
      revenue: number
      isProjected: boolean
      confidence: number
    }> = []

    // Generate projections
    const lastIndex = regressionData.length - 1
    
    // Only calculate RMSE if we have data
    const rmse = regressionData.length > 0
      ? Math.sqrt(
          regressionData.reduce((sum, p) => {
            const predicted = regression.slope * p.x + regression.intercept
            return sum + Math.pow(p.y - predicted, 2)
          }, 0) / regressionData.length
        )
      : 0

    for (let i = 1; i <= days; i++) {
      const projectedIndex = lastIndex + i
      const projectedRevenue = Math.max(
        0,
        regression.slope * projectedIndex + regression.intercept
      )
      const projectedDate = new Date(lastDateTime + i * 24 * 60 * 60 * 1000)
      
      // Validate the projected date is valid
      if (isNaN(projectedDate.getTime())) {
        // Fallback to today + i days if date is invalid
        const fallbackDate = new Date()
        fallbackDate.setDate(fallbackDate.getDate() + i)
        projectedData.push({
          date: fallbackDate.toISOString().split("T")[0],
          revenue: Math.round(projectedRevenue),
          isProjected: true,
          confidence: 0.3,
        })
      } else {
        const confidenceInterval = (1 - (i / (days * 1.5))) * 0.4 + 0.6 // Decays from ~1 to ~0.6

        projectedData.push({
          date: projectedDate.toISOString().split("T")[0],
          revenue: Math.round(projectedRevenue),
          isProjected: true,
          confidence: Math.max(0.3, confidenceInterval),
        })
      }
    }

    // Calculate 30/60/90 day totals
    const projectedTotals = {
      days30: projectedData
        .slice(0, 30)
        .reduce((sum, p) => sum + p.revenue, 0),
      days60: projectedData
        .slice(0, 60)
        .reduce((sum, p) => sum + p.revenue, 0),
      days90: projectedData
        .slice(0, 90)
        .reduce((sum, p) => sum + p.revenue, 0),
    }

    return NextResponse.json({
      historical: historicalForChart,
      projected: projectedData,
      slope: regression.slope,
      intercept: regression.intercept,
      r_squared: regression.rSquared,
      projectedTotals,
      trend:
        regression.slope > 0
          ? "improving"
          : regression.slope < 0
            ? "declining"
            : "stable",
    })
  } catch (error) {
    console.error("Error calculating revenue projections:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
