/**
 * GET /api/dashboard/stats
 * Returns 5 KPI values for the main dashboard summary cards.
 * All queries run in parallel via Promise.all for minimum latency.
 *
 * Returns:
 * {
 *   activeInspections:  { value, delta }   — inspections not yet COMPLETED/REJECTED
 *   moistureReadings7d: { value, delta }   — moisture readings in last 7 days
 *   equipmentItems:     { value, delta }   — IICRC-determined scope items (autoDetermined=true)
 *   completedThisMonth: { value, delta }   — inspections completed this calendar month
 *   createdToday:       { value, delta }   — inspections created in last 24h (field activity proxy)
 * }
 *
 * delta: percentage change vs equivalent prior period (or null if no prior data)
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const revalidate = 60 // Cache for 60 seconds at the route segment level

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const now = new Date()

    // ── Time boundaries ──────────────────────────────────────────
    const sevenDaysAgo   = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000)
    const fourteenDaysAgo= new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    const oneDayAgo      = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const twoDaysAgo     = new Date(now.getTime() - 48 * 60 * 60 * 1000)

    const startOfMonth   = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    // ── Parallel queries ─────────────────────────────────────────
    const [
      activeNow,
      activePrev,
      moisture7d,
      moisture14to7d,
      equipmentNow,
      equipmentPrev,
      completedThisMonth,
      completedLastMonth,
      createdToday,
      createdYesterday,
    ] = await Promise.all([
      // 1. Active inspections (status not COMPLETED or REJECTED)
      prisma.inspection.count({
        where: {
          userId,
          status: { notIn: ["COMPLETED", "REJECTED"] },
        },
      }),
      // 1b. Active prev (same calc 7 days ago — approximate: total minus completed then)
      prisma.inspection.count({
        where: {
          userId,
          status: { notIn: ["COMPLETED", "REJECTED"] },
          createdAt: { lte: sevenDaysAgo },
        },
      }),
      // 2. Moisture readings in last 7 days
      prisma.moistureReading.count({
        where: {
          inspection: { userId },
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      // 2b. Moisture readings 14→7 days ago (prior period for delta)
      prisma.moistureReading.count({
        where: {
          inspection: { userId },
          createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
        },
      }),
      // 3. Equipment items: autoDetermined ScopeItems (IICRC equipment placed)
      prisma.scopeItem.count({
        where: {
          inspection: { userId },
          autoDetermined: true,
        },
      }),
      // 3b. Prior period (created before 7 days ago)
      prisma.scopeItem.count({
        where: {
          inspection: { userId },
          autoDetermined: true,
          createdAt: { lte: sevenDaysAgo },
        },
      }),
      // 4. Inspections completed this calendar month
      prisma.inspection.count({
        where: {
          userId,
          status: "COMPLETED",
          updatedAt: { gte: startOfMonth },
        },
      }),
      // 4b. Inspections completed last month
      prisma.inspection.count({
        where: {
          userId,
          status: "COMPLETED",
          updatedAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
      }),
      // 5. Inspections created in last 24h (field activity proxy)
      prisma.inspection.count({
        where: {
          userId,
          createdAt: { gte: oneDayAgo },
        },
      }),
      // 5b. Inspections created 48→24h ago
      prisma.inspection.count({
        where: {
          userId,
          createdAt: { gte: twoDaysAgo, lt: oneDayAgo },
        },
      }),
    ])

    // ── Delta calculation ─────────────────────────────────────────
    function calcDelta(current: number, prior: number): string | null {
      if (prior === 0) return current > 0 ? "+100%" : null
      const pct = Math.round(((current - prior) / prior) * 100)
      return pct >= 0 ? `+${pct}%` : `${pct}%`
    }

    return NextResponse.json({
      activeInspections: {
        value: activeNow,
        delta: calcDelta(activeNow, activePrev),
        label: "Active Inspections",
        sublabel: "Not yet completed",
        href: "/dashboard/inspections?status=active",
      },
      moistureReadings7d: {
        value: moisture7d,
        delta: calcDelta(moisture7d, moisture14to7d),
        label: "Moisture Readings",
        sublabel: "Last 7 days",
        href: "/dashboard/inspections",
      },
      equipmentItems: {
        value: equipmentNow,
        delta: calcDelta(equipmentNow, equipmentPrev),
        label: "Equipment Items",
        sublabel: "IICRC S500 placed",
        href: "/dashboard/inspections",
      },
      completedThisMonth: {
        value: completedThisMonth,
        delta: calcDelta(completedThisMonth, completedLastMonth),
        label: "Completed",
        sublabel: "This month",
        href: "/dashboard/inspections?status=COMPLETED",
      },
      createdToday: {
        value: createdToday,
        delta: calcDelta(createdToday, createdYesterday),
        label: "New Today",
        sublabel: "Inspections created",
        href: "/dashboard/inspections",
      },
    })
  } catch (error) {
    console.error("[dashboard/stats GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
