import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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
  return { startDate, endDate: now }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dateRange = searchParams.get("dateRange") || "30days"
    const userIdParam = searchParams.get("userId")

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
        return NextResponse.json({ error: "You are not part of an organization" }, { status: 400 })
      }
      const targetUser = await prisma.user.findUnique({
        where: { id: userIdParam },
        select: { id: true, organizationId: true, role: true },
      })
      if (!targetUser || targetUser.organizationId !== currentUser.organizationId) {
        return NextResponse.json({ error: "User not found or not in your organization" }, { status: 403 })
      }
      if (isAdmin && targetUser.role === "ADMIN" && targetUser.id !== session.user.id) {
        return NextResponse.json({ error: "Cannot view other Admin accounts" }, { status: 403 })
      }
      if (isManager && targetUser.role !== "USER") {
        return NextResponse.json({ error: "Managers can only view Technicians' analytics" }, { status: 403 })
      }
      targetUserId = userIdParam
    }

    const { startDate, endDate } = getDateFilter(dateRange)
    const periodMs = endDate.getTime() - startDate.getTime()
    const previousEndDate = new Date(startDate.getTime() - 1)
    const previousStartDate = new Date(previousEndDate.getTime() - periodMs)

    const baseInclude = {
      estimates: { take: 1, orderBy: { createdAt: "desc" as const }, select: { totalIncGST: true } },
      client: { select: { name: true } },
    }

    const [currentReports, previousReports] = await Promise.all([
      prisma.report.findMany({
        where: {
          userId: targetUserId,
          createdAt: { gte: startDate, lte: endDate },
        },
        include: baseInclude,
      }),
      prisma.report.findMany({
        where: {
          userId: targetUserId,
          createdAt: { gte: previousStartDate, lt: startDate },
        },
        include: baseInclude,
      }),
    ])

    const cost = (r: { estimates?: { totalIncGST: number | null }[]; totalCost: number | null }) =>
      r.estimates?.[0]?.totalIncGST ?? r.totalCost ?? 0

    const currentWithCost = currentReports.map((r) => ({ ...r, revenue: cost(r) }))
    const previousWithCost = previousReports.map((r) => ({ ...r, revenue: cost(r) }))

    const totalCurrentRevenue = currentWithCost.reduce((s, r) => s + r.revenue, 0)
    const totalPrevRevenue = previousWithCost.reduce((s, r) => s + r.revenue, 0)
    const revenueChangePct = totalPrevRevenue === 0 ? (totalCurrentRevenue > 0 ? 100 : 0) : ((totalCurrentRevenue - totalPrevRevenue) / totalPrevRevenue) * 100
    const reportChange = previousReports.length === 0 ? (currentReports.length > 0 ? 100 : 0) : ((currentReports.length - previousReports.length) / previousReports.length) * 100

    // Top hazard by count (current period)
    const hazardCounts = new Map<string, number>()
    currentWithCost.forEach((r) => {
      const h = r.hazardType || "Other"
      hazardCounts.set(h, (hazardCounts.get(h) || 0) + 1)
    })
    const topHazardEntry = Array.from(hazardCounts.entries()).sort((a, b) => b[1] - a[1])[0]
    const topHazard = topHazardEntry ? topHazardEntry[0] : "N/A"
    const topHazardCount = topHazardEntry ? topHazardEntry[1] : 0

    // Completion times (current period, completed only)
    const completedCurrent = currentWithCost.filter(
      (r) => r.status === "COMPLETED" || r.status === "APPROVED" || r.completionDate
    )
    const completionHoursByHazard = new Map<string, number[]>()
    completedCurrent.forEach((r) => {
      const completionDate = r.completionDate || r.updatedAt
      const hours = (completionDate.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60)
      if (hours > 0 && hours < 720) {
        const hazard = r.hazardType || "Other"
        const arr = completionHoursByHazard.get(hazard) || []
        arr.push(hours)
        completionHoursByHazard.set(hazard, arr)
      }
    })
    const hazardAvgHours = Array.from(completionHoursByHazard.entries()).map(([hazard, hours]) => ({
      hazard,
      avgHours: hours.reduce((a, b) => a + b, 0) / hours.length,
      count: hours.length,
    }))
    const slowestHazards = [...hazardAvgHours].sort((a, b) => b.avgHours - a.avgHours).slice(0, 5)
    const fastestHazards = [...hazardAvgHours].filter((h) => h.count >= 2).sort((a, b) => a.avgHours - b.avgHours).slice(0, 5)

    // Top growing clients (current vs previous revenue)
    const currentByClient = new Map<string, { name: string; revenue: number; reports: number }>()
    currentWithCost.forEach((r) => {
      const name = r.client?.name || r.clientName || "Unknown"
      const cur = currentByClient.get(name) || { name, revenue: 0, reports: 0 }
      currentByClient.set(name, { name, revenue: cur.revenue + r.revenue, reports: cur.reports + 1 })
    })
    const previousByClient = new Map<string, { revenue: number; reports: number }>()
    previousWithCost.forEach((r) => {
      const name = r.client?.name || r.clientName || "Unknown"
      const cur = previousByClient.get(name) || { revenue: 0, reports: 0 }
      previousByClient.set(name, { revenue: cur.revenue + r.revenue, reports: cur.reports + 1 })
    })
    const topGrowingClients = Array.from(currentByClient.entries())
      .map(([name, cur]) => {
        const prev = previousByClient.get(name) || { revenue: 0, reports: 0 }
        const revenueChange = prev.revenue === 0 ? (cur.revenue > 0 ? 100 : 0) : ((cur.revenue - prev.revenue) / prev.revenue) * 100
        const reportChangePct = prev.reports === 0 ? (cur.reports > 0 ? 100 : 0) : ((cur.reports - prev.reports) / prev.reports) * 100
        return { name, currentRevenue: cur.revenue, currentReports: cur.reports, revenueChangePct: Math.round(revenueChange), reportChangePct: Math.round(reportChangePct) }
      })
      .filter((c) => c.revenueChangePct > 0 || c.currentRevenue > 0)
      .sort((a, b) => b.revenueChangePct - a.revenueChangePct)
      .slice(0, 5)

    // Executive summary (2-3 sentences)
    const revenueTrend = revenueChangePct > 5 ? "up" : revenueChangePct < -5 ? "down" : "stable"
    const revenueSentence =
      revenueTrend === "up"
        ? `Revenue is up ${revenueChangePct.toFixed(0)}% with ${currentReports.length} reports this period.`
        : revenueTrend === "down"
          ? `Revenue is down ${Math.abs(revenueChangePct).toFixed(0)}% with ${currentReports.length} reports.`
          : `Revenue is stable at $${(totalCurrentRevenue / 1000).toFixed(1)}K across ${currentReports.length} reports.`
    const hazardSentence = topHazard !== "N/A" ? `${topHazard} leads with ${topHazardCount} report${topHazardCount !== 1 ? "s" : ""}.` : ""
    const turnaroundSentence =
      slowestHazards.length > 0
        ? `Slowest turnaround: ${slowestHazards[0].hazard} (avg ${slowestHazards[0].avgHours.toFixed(1)}h).`
        : ""

    const summary = [revenueSentence, hazardSentence, turnaroundSentence].filter(Boolean).join(" ")

    return NextResponse.json({
      summary,
      periodComparison: {
        currentReports: currentReports.length,
        previousReports: previousReports.length,
        currentRevenue: Math.round(totalCurrentRevenue),
        previousRevenue: Math.round(totalPrevRevenue),
        revenueChangePct: Math.round(revenueChangePct * 10) / 10,
        reportChangePct: Math.round(reportChangePct * 10) / 10,
      },
      topHazard: { name: topHazard, count: topHazardCount },
      topGrowingClients,
      slowestHazards: slowestHazards.map((h) => ({ hazard: h.hazard, avgHours: Math.round(h.avgHours * 10) / 10, count: h.count })),
      fastestHazards: fastestHazards.map((h) => ({ hazard: h.hazard, avgHours: Math.round(h.avgHours * 10) / 10, count: h.count })),
    })
  } catch (error) {
    console.error("Error fetching analytics insights:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
