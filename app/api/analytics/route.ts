import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Helper function to get date range filter
function getDateFilter(dateRange: string) {
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
    case "ytd":
      startDate = new Date(now.getFullYear(), 0, 1)
      break
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }

  return {
    createdAt: {
      gte: startDate,
    },
  }
}

// Helper function to extract state from address
function extractState(address: string | null): string | null {
  if (!address) return null
  
  const statePatterns = [
    /NSW|New South Wales/i,
    /VIC|Victoria/i,
    /QLD|Queensland/i,
    /WA|Western Australia/i,
    /SA|South Australia/i,
    /TAS|Tasmania/i,
    /NT|Northern Territory/i,
    /ACT|Australian Capital Territory/i,
  ]
  
  const stateMap: { [key: string]: string } = {
    NSW: "NSW",
    "NEW SOUTH WALES": "NSW",
    VIC: "VIC",
    VICTORIA: "VIC",
    QLD: "QLD",
    QUEENSLAND: "QLD",
    WA: "WA",
    "WESTERN AUSTRALIA": "WA",
    SA: "SA",
    "SOUTH AUSTRALIA": "SA",
    TAS: "TAS",
    TASMANIA: "TAS",
    NT: "NT",
    "NORTHERN TERRITORY": "NT",
    ACT: "ACT",
    "AUSTRALIAN CAPITAL TERRITORY": "ACT",
  }
  
  for (const pattern of statePatterns) {
    const match = address.match(pattern)
    if (match) {
      const matched = match[0].toUpperCase()
      return stateMap[matched] || matched
    }
  }
  
  return null
}

// Helper function to format date for grouping
function formatDateForGrouping(date: Date, dateRange: string): string {
  const d = new Date(date)
  
  if (dateRange === "7days" || dateRange === "30days") {
    return d.toLocaleDateString("en-AU", { month: "short", day: "numeric" })
  } else {
    const weekNumber = Math.ceil(d.getDate() / 7)
    return `${d.toLocaleDateString("en-AU", { month: "short" })} Week ${weekNumber}`
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dateRange = searchParams.get("dateRange") || "30days"

    const dateFilter = getDateFilter(dateRange)
    const where = {
      userId: session.user.id,
      ...dateFilter,
    }

    // Fetch all reports with estimates
    const reports = await prisma.report.findMany({
      where,
      include: {
        estimates: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            totalIncGST: true,
          },
        },
        client: {
          select: {
            name: true,
            company: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })

    // Process reports data
    const reportsWithCost = reports.map((report) => ({
      ...report,
      cost: report.estimates?.[0]?.totalIncGST || report.totalCost || 0,
      state: extractState(report.propertyAddress),
    }))

    // Calculate KPIs
    const totalReports = reports.length
    const totalRevenue = reportsWithCost.reduce((sum, r) => sum + (r.cost || 0), 0)
    const avgReportValue = totalReports > 0 ? totalRevenue / totalReports : 0

    // Calculate average turnaround time (hours between createdAt and updatedAt/completionDate)
    const turnaroundTimes = reportsWithCost
      .map((report) => {
        const completionDate = report.completionDate || report.updatedAt
        const hours = (completionDate.getTime() - report.createdAt.getTime()) / (1000 * 60 * 60)
        return hours > 0 && hours < 720 ? hours : null // Filter out invalid times (0 or >30 days)
      })
      .filter((hours) => hours !== null) as number[]
    
    const avgCompletionTime = turnaroundTimes.length > 0 
      ? turnaroundTimes.reduce((sum, h) => sum + h, 0) / turnaroundTimes.length 
      : 0

    // Report trends over time
    const trendMap = new Map<string, { reports: number; revenue: number; date: Date }>()
    reportsWithCost.forEach((report) => {
      const dateKey = formatDateForGrouping(report.createdAt, dateRange)
      const existing = trendMap.get(dateKey)
      if (existing) {
        trendMap.set(dateKey, {
          reports: existing.reports + 1,
          revenue: existing.revenue + (report.cost || 0),
          date: existing.date, // keep earliest date for sorting
        })
      } else {
        trendMap.set(dateKey, {
          reports: 1,
          revenue: report.cost || 0,
          date: report.createdAt,
        })
      }
    })

    // Sort trend data by original date
    const reportTrendData = Array.from(trendMap.entries())
      .map(([dateKey, data]) => ({
        date: dateKey,
        reports: data.reports,
        revenue: Math.round(data.revenue),
        sortDate: data.date,
      }))
      .sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime())
      .map(({ sortDate, ...rest }) => rest)

    // Hazard distribution
    const hazardCounts = new Map<string, number>()
    reportsWithCost.forEach((report) => {
      const hazard = report.hazardType || "Other"
      hazardCounts.set(hazard, (hazardCounts.get(hazard) || 0) + 1)
    })

    const hazardColors: { [key: string]: string } = {
      Water: "#3b82f6",
      Fire: "#f97316",
      Storm: "#8b5cf6",
      Mould: "#10b981",
      Other: "#6b7280",
    }

    const hazardDistribution = Array.from(hazardCounts.entries())
      .map(([name, value]) => ({
        name,
        value,
        color: hazardColors[name] || "#6b7280",
      }))
      .sort((a, b) => b.value - a.value)

    // Insurance type distribution
    const insuranceCounts = new Map<string, number>()
    reportsWithCost.forEach((report) => {
      const type = report.insuranceType || "Other"
      insuranceCounts.set(type, (insuranceCounts.get(type) || 0) + 1)
    })

    const insuranceTypeData = Array.from(insuranceCounts.entries())
      .map(([type, count]) => ({
        type,
        count,
      }))
      .sort((a, b) => b.count - a.count)

    // State performance
    const stateRevenue = new Map<string, number>()
    reportsWithCost.forEach((report) => {
      if (report.state) {
        stateRevenue.set(report.state, (stateRevenue.get(report.state) || 0) + (report.cost || 0))
      }
    })

    const statePerformance = Array.from(stateRevenue.entries())
      .map(([state, value]) => ({
        state,
        value: Math.round(value),
      }))
      .sort((a, b) => b.value - a.value)

    // Turnaround time by hazard type
    const hazardTurnaround = new Map<string, number[]>()
    reportsWithCost.forEach((report) => {
      const hazard = report.hazardType || "Other"
      const completionDate = report.completionDate || report.updatedAt
      const hours = (completionDate.getTime() - report.createdAt.getTime()) / (1000 * 60 * 60)
      
      if (hours > 0 && hours < 720) {
        const existing = hazardTurnaround.get(hazard) || []
        existing.push(hours)
        hazardTurnaround.set(hazard, existing)
      }
    })

    const turnaroundTime = Array.from(hazardTurnaround.entries())
      .map(([hazard, hours]) => ({
        hazard,
        hours: hours.reduce((sum, h) => sum + h, 0) / hours.length,
      }))
      .sort((a, b) => b.hours - a.hours)

    // Top clients by revenue
    const clientRevenue = new Map<string, { name: string; revenue: number; reports: number }>()
    reportsWithCost.forEach((report) => {
      const clientName = report.client?.name || report.clientName || "Unknown"
      const existing = clientRevenue.get(clientName) || { name: clientName, revenue: 0, reports: 0 }
      clientRevenue.set(clientName, {
        name: clientName,
        revenue: existing.revenue + (report.cost || 0),
        reports: existing.reports + 1,
      })
    })

    const topClients = Array.from(clientRevenue.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((client) => ({
        name: client.name,
        reports: client.reports,
        revenue: `$${Math.round(client.revenue).toLocaleString()}`,
      }))

    // Calculate change percentages (compared to previous period)
    // Previous period is the same duration but before the current period
    const currentStartDate = getDateFilter(dateRange).createdAt.gte
    const periodDuration = new Date().getTime() - currentStartDate.getTime()
    const previousStartDate = new Date(currentStartDate.getTime() - periodDuration)
    
    const previousPeriodFilter = {
      userId: session.user.id,
      createdAt: {
        gte: previousStartDate,
        lt: currentStartDate,
      },
    }

    const previousReports = await prisma.report.findMany({
      where: previousPeriodFilter,
      include: {
        estimates: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { totalIncGST: true },
        },
      },
    })

    const prevTotalReports = previousReports.length
    const prevTotalRevenue = previousReports.reduce(
      (sum, r) => sum + (r.estimates?.[0]?.totalIncGST || r.totalCost || 0),
      0
    )
    const prevAvgReportValue = prevTotalReports > 0 ? prevTotalRevenue / prevTotalReports : 0

    const prevTurnaroundTimes = previousReports
      .map((r) => {
        const completionDate = r.completionDate || r.updatedAt
        const hours = (completionDate.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60)
        return hours > 0 && hours < 720 ? hours : null
      })
      .filter((h) => h !== null) as number[]
    
    const prevAvgCompletion = prevTurnaroundTimes.length > 0
      ? prevTurnaroundTimes.reduce((sum, h) => sum + h, 0) / prevTurnaroundTimes.length
      : 0

    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? "+100%" : "0%"
      const change = ((current - previous) / previous) * 100
      return `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`
    }

    return NextResponse.json({
      kpis: {
        totalReports: {
          value: totalReports,
          change: calculateChange(totalReports, prevTotalReports),
        },
        totalRevenue: {
          value: Math.round(totalRevenue),
          formatted: `$${(totalRevenue / 1000).toFixed(2)}K`,
          change: calculateChange(totalRevenue, prevTotalRevenue),
        },
        avgReportValue: {
          value: Math.round(avgReportValue),
          formatted: `$${Math.round(avgReportValue).toLocaleString()}`,
          change: calculateChange(avgReportValue, prevAvgReportValue),
        },
        avgCompletion: {
          value: avgCompletionTime.toFixed(1),
          formatted: `${avgCompletionTime.toFixed(1)} hrs`,
          change: calculateChange(avgCompletionTime, prevAvgCompletion),
        },
      },
      reportTrendData,
      hazardDistribution,
      insuranceTypeData,
      statePerformance,
      turnaroundTime,
      topClients,
    })
  } catch (error) {
    console.error("Error fetching analytics:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

