import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7)
  const [year, monthNum] = month.split('-').map(Number)
  const from = new Date(year, monthNum - 1, 1)
  const to = new Date(year, monthNum, 0, 23, 59, 59)

  try {
    const events = await prisma.usageEvent.findMany({
      where: { timestamp: { gte: from, lte: to } },
      include: { user: { select: { id: true, name: true, email: true } } },
    })

    const totalCostMtd = events.reduce((s, e) => s + (e.totalCost ?? 0), 0)
    const pendingBillingCount = events.filter(e => e.billingStatus === 'pending').length
    const billedMtd = events
      .filter(e => e.billingStatus === 'billed')
      .reduce((s, e) => s + (e.totalCost ?? 0), 0)
    const failedCount = events.filter(e => e.billingStatus === 'failed').length

    // Aggregate by event type
    const byEventTypeMap = new Map<
      string,
      { count: number; units: number; totalCost: number }
    >()
    for (const e of events) {
      const key = e.eventType
      const existing = byEventTypeMap.get(key) ?? { count: 0, units: 0, totalCost: 0 }
      byEventTypeMap.set(key, {
        count: existing.count + 1,
        units: existing.units + (e.units ?? 0),
        totalCost: existing.totalCost + (e.totalCost ?? 0),
      })
    }
    const byEventType = Array.from(byEventTypeMap.entries()).map(([eventType, agg]) => ({
      eventType,
      count: agg.count,
      units: agg.units,
      avgUnitCost: agg.count > 0 ? agg.totalCost / agg.count : 0,
      totalCost: agg.totalCost,
    }))

    // Aggregate by user
    const byUserMap = new Map<
      string,
      { name: string; email: string; eventCount: number; totalCost: number; pending: number; billed: number; failed: number }
    >()
    for (const e of events) {
      const uid = e.userId
      const u = e.user
      const existing = byUserMap.get(uid) ?? {
        name: u.name ?? '',
        email: u.email ?? '',
        eventCount: 0,
        totalCost: 0,
        pending: 0,
        billed: 0,
        failed: 0,
      }
      byUserMap.set(uid, {
        ...existing,
        eventCount: existing.eventCount + 1,
        totalCost: existing.totalCost + (e.totalCost ?? 0),
        pending: existing.pending + (e.billingStatus === 'pending' ? 1 : 0),
        billed: existing.billed + (e.billingStatus === 'billed' ? 1 : 0),
        failed: existing.failed + (e.billingStatus === 'failed' ? 1 : 0),
      })
    }
    const byUser = Array.from(byUserMap.entries()).map(([userId, agg]) => ({
      userId,
      ...agg,
    }))

    // Daily cost breakdown — last 30 days clamped to the month window
    const dailyMap = new Map<string, Record<string, number>>()
    for (const e of events) {
      const dateStr = e.timestamp.toISOString().slice(0, 10)
      const existing = dailyMap.get(dateStr) ?? {}
      dailyMap.set(dateStr, {
        ...existing,
        [e.eventType]: (existing[e.eventType] ?? 0) + (e.totalCost ?? 0),
      })
    }
    const dailyCosts = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, costs]) => ({ date, costs }))

    return NextResponse.json({
      totalCostMtd,
      pendingBillingCount,
      billedMtd,
      failedCount,
      byEventType,
      byUser,
      dailyCosts,
    })
  } catch (error) {
    console.error('[/api/admin/usage] Failed to fetch usage data:', error)
    return NextResponse.json({ error: 'Failed to fetch usage data' }, { status: 500 })
  }
}
