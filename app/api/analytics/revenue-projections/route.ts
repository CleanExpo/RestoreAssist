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

    // Get last 90 days of data for regression
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const reports = await prisma.report.findMany({
      where: {
        userId: session.user.id,
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
    const regressionData = sortedDates.map((date, index) => ({
      x: index,
      y: dailyRevenue.get(date) || 0,
    }))

    // Calculate regression
    const regression = linearRegression(regressionData)

    // Generate forecast
    const lastDate = sortedDates[sortedDates.length - 1]
    const lastDateTime = new Date(lastDate).getTime()

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
    const rmse = Math.sqrt(
      regressionData.reduce((sum, p) => {
        const predicted = regression.slope * p.x + regression.intercept
        return sum + Math.pow(p.y - predicted, 2)
      }, 0) / regressionData.length
    )

    for (let i = 1; i <= days; i++) {
      const projectedIndex = lastIndex + i
      const projectedRevenue = Math.max(
        0,
        regression.slope * projectedIndex + regression.intercept
      )
      const projectedDate = new Date(lastDateTime + i * 24 * 60 * 60 * 1000)
      const confidenceInterval = (1 - (i / (days * 1.5))) * 0.4 + 0.6 // Decays from ~1 to ~0.6

      projectedData.push({
        date: projectedDate.toISOString().split("T")[0],
        revenue: Math.round(projectedRevenue),
        isProjected: true,
        confidence: Math.max(0.3, confidenceInterval),
      })
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
