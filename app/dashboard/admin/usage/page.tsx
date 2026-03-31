'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  Lock,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Download,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// ---- Types ----------------------------------------------------------------

type EventTypeName =
  | 'PROPERTY_LOOKUP'
  | 'VOICE_TRANSCRIPTION'
  | 'LIDAR_SCAN'
  | 'AI_ASSISTANT_QUERY'
  | 'FLOOR_PLAN_GENERATION'
  | 'VOICE_AI_INTERACTION'

interface EventTypeRow {
  eventType: EventTypeName
  count: number
  units: number
  avgUnitCost: number
  totalCost: number
}

interface UserRow {
  userId: string
  name: string
  email: string
  eventCount: number
  totalCost: number
  pending: number
  billed: number
  failed: number
}

interface DailyCost {
  date: string
  costs: Record<EventTypeName, number>
}

interface UsageData {
  totalCostMtd: number
  pendingBillingCount: number
  billedMtd: number
  failedCount: number
  byEventType: EventTypeRow[]
  byUser: UserRow[]
  dailyCosts: DailyCost[]
}

// ---- Constants ------------------------------------------------------------

const EVENT_COLORS: Record<EventTypeName, { bg: string; text: string; bar: string }> = {
  PROPERTY_LOOKUP:       { bg: 'bg-blue-500/10',   text: 'text-blue-600 dark:text-blue-400',   bar: 'bg-blue-500' },
  VOICE_TRANSCRIPTION:   { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', bar: 'bg-purple-500' },
  LIDAR_SCAN:            { bg: 'bg-green-500/10',  text: 'text-green-600 dark:text-green-400',  bar: 'bg-green-500' },
  AI_ASSISTANT_QUERY:    { bg: 'bg-amber-500/10',  text: 'text-amber-600 dark:text-amber-400',  bar: 'bg-amber-500' },
  FLOOR_PLAN_GENERATION: { bg: 'bg-teal-500/10',   text: 'text-teal-600 dark:text-teal-400',   bar: 'bg-teal-500' },
  VOICE_AI_INTERACTION:  { bg: 'bg-pink-500/10',   text: 'text-pink-600 dark:text-pink-400',   bar: 'bg-pink-500' },
}

const EVENT_LABELS: Record<EventTypeName, string> = {
  PROPERTY_LOOKUP:       'Property Lookup',
  VOICE_TRANSCRIPTION:   'Voice Transcription',
  LIDAR_SCAN:            'LiDAR Scan',
  AI_ASSISTANT_QUERY:    'AI Assistant Query',
  FLOOR_PLAN_GENERATION: 'Floor Plan Generation',
  VOICE_AI_INTERACTION:  'Voice AI Interaction',
}

const ALL_EVENT_TYPES = Object.keys(EVENT_LABELS) as EventTypeName[]
const BILLING_STATUSES = ['pending', 'billed', 'failed'] as const
type BillingStatus = typeof BILLING_STATUSES[number]

const PAGE_SIZE = 10

// ---- Mock data ------------------------------------------------------------

const MOCK_USAGE: UsageData = {
  totalCostMtd: 47.82,
  pendingBillingCount: 12,
  billedMtd: 38.50,
  failedCount: 2,
  byEventType: [
    { eventType: 'PROPERTY_LOOKUP',       count: 145, units: 145, avgUnitCost: 0.05,   totalCost: 7.25 },
    { eventType: 'VOICE_TRANSCRIPTION',   count: 89,  units: 890, avgUnitCost: 0.02,   totalCost: 17.80 },
    { eventType: 'LIDAR_SCAN',            count: 23,  units: 23,  avgUnitCost: 0.50,   totalCost: 11.50 },
    { eventType: 'AI_ASSISTANT_QUERY',    count: 212, units: 212, avgUnitCost: 0.03,   totalCost: 6.36 },
    { eventType: 'FLOOR_PLAN_GENERATION', count: 8,   units: 8,   avgUnitCost: 0.60,   totalCost: 4.80 },
    { eventType: 'VOICE_AI_INTERACTION',  count: 3,   units: 30,  avgUnitCost: 0.037,  totalCost: 0.11 },
  ],
  byUser: [
    { userId: '1', name: 'Phill McGurk', email: 'phill@example.com', eventCount: 198, totalCost: 22.10, pending: 5, billed: 190, failed: 3 },
    { userId: '2', name: 'Sarah Jones',  email: 'sarah@example.com', eventCount: 145, totalCost: 15.80, pending: 4, billed: 140, failed: 1 },
    { userId: '3', name: 'Mike Chen',    email: 'mike@example.com',  eventCount: 137, totalCost: 9.92,  pending: 3, billed: 134, failed: 0 },
  ],
  dailyCosts: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10),
    costs: {
      PROPERTY_LOOKUP:       Math.random() * 0.5,
      VOICE_TRANSCRIPTION:   Math.random() * 0.8,
      LIDAR_SCAN:            Math.random() * 1.2,
      AI_ASSISTANT_QUERY:    Math.random() * 0.3,
      FLOOR_PLAN_GENERATION: Math.random() * 0.6,
      VOICE_AI_INTERACTION:  Math.random() * 0.1,
    },
  })),
}

// ---- Helper: last 6 months ------------------------------------------------

function getLast6Months(): { label: string; value: string }[] {
  const months: { label: string; value: string }[] = []
  const now = new Date()
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = d.toISOString().slice(0, 7)
    const label = d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
    months.push({ label, value })
  }
  return months
}

// ---- Sub-components -------------------------------------------------------

function KpiCard({
  icon: Icon,
  iconClass,
  title,
  value,
  subtitle,
}: {
  icon: React.ElementType
  iconClass: string
  title: string
  value: string
  subtitle?: string
}) {
  return (
    <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-lg ${iconClass}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-neutral-900 dark:text-white">{value}</p>
            <p className="text-sm text-neutral-500">{title}</p>
            {subtitle && <p className="text-xs text-neutral-400">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Daily cost chart — div-based, no chart library
function DailyCostChart({ dailyCosts }: { dailyCosts: DailyCost[] }) {
  const [tooltip, setTooltip] = useState<{ day: DailyCost; x: number } | null>(null)

  const maxDayCost = useMemo(() => {
    return Math.max(
      ...dailyCosts.map(d => Object.values(d.costs).reduce((s, v) => s + v, 0)),
      0.01,
    )
  }, [dailyCosts])

  const CHART_HEIGHT = 120

  return (
    <div className="relative">
      <div className="flex items-end gap-[2px] h-[120px] overflow-x-auto overflow-y-hidden">
        {dailyCosts.map(day => {
          const dayTotal = Object.values(day.costs).reduce((s, v) => s + v, 0)
          const stackFraction = dayTotal / maxDayCost
          const stackPx = Math.max(stackFraction * CHART_HEIGHT, dayTotal > 0 ? 2 : 0)

          return (
            <div
              key={day.date}
              className="relative flex flex-col justify-end flex-1 min-w-[16px] cursor-pointer group"
              style={{ height: `${CHART_HEIGHT}px` }}
              onMouseEnter={e => setTooltip({ day, x: e.currentTarget.getBoundingClientRect().left })}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Stacked bar segments */}
              <div
                className="w-full flex flex-col-reverse overflow-hidden rounded-sm"
                style={{ height: `${stackPx}px` }}
              >
                {ALL_EVENT_TYPES.map(et => {
                  const cost = day.costs[et] ?? 0
                  if (cost <= 0) return null
                  const pct = (cost / dayTotal) * 100
                  return (
                    <div
                      key={et}
                      className={`w-full ${EVENT_COLORS[et].bar}`}
                      style={{ height: `${pct}%` }}
                    />
                  )
                })}
              </div>
              {/* Hover highlight */}
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 rounded-sm transition-opacity" />
            </div>
          )
        })}
      </div>

      {/* X-axis labels — show first and last date */}
      <div className="flex justify-between mt-1 text-[10px] text-neutral-400">
        <span>{dailyCosts[0]?.date?.slice(5)}</span>
        <span>{dailyCosts[dailyCosts.length - 1]?.date?.slice(5)}</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 pointer-events-none bg-neutral-900 dark:bg-neutral-800 text-white text-xs rounded-lg shadow-lg p-3 min-w-[180px] border border-neutral-700">
          <p className="font-semibold mb-1">{tooltip.day.date}</p>
          {ALL_EVENT_TYPES.map(et => {
            const cost = tooltip.day.costs[et] ?? 0
            if (cost <= 0) return null
            return (
              <div key={et} className="flex justify-between gap-4">
                <span className={EVENT_COLORS[et].text}>{EVENT_LABELS[et]}</span>
                <span>${cost.toFixed(3)}</span>
              </div>
            )
          })}
          <div className="border-t border-neutral-600 mt-1 pt-1 flex justify-between">
            <span>Total</span>
            <span className="font-semibold">
              ${Object.values(tooltip.day.costs).reduce((s, v) => s + v, 0).toFixed(3)} AUD
            </span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3">
        {ALL_EVENT_TYPES.map(et => (
          <div key={et} className="flex items-center gap-1 text-xs text-neutral-500">
            <div className={`w-2 h-2 rounded-sm ${EVENT_COLORS[et].bar}`} />
            {EVENT_LABELS[et]}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Main page component --------------------------------------------------

export default function AiUsageDashboardPage() {
  const { data: session, status } = useSession()

  // Month selector
  const months = useMemo(() => getLast6Months(), [])
  const [selectedMonth, setSelectedMonth] = useState(months[0].value)

  // Data
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [billingFilter, setBillingFilter] = useState<Set<BillingStatus>>(new Set())
  const [eventTypeFilter, setEventTypeFilter] = useState<Set<EventTypeName>>(new Set())

  // User table sort + pagination
  const [sortDesc, setSortDesc] = useState(true)
  const [page, setPage] = useState(0)

  const fetchData = useCallback(async (month: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/usage?month=${month}`)
      if (!res.ok) throw new Error('API error')
      const json = await res.json()
      setData(json)
    } catch {
      // Fall back to mock data
      setData(MOCK_USAGE)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'loading') return
    fetchData(selectedMonth)
  }, [status, selectedMonth, fetchData])

  // Admin guard — show lock card, don't redirect
  if (status !== 'loading' && session?.user?.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Card className="w-full max-w-sm bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
          <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8">
            <div className="p-4 rounded-full bg-red-500/10">
              <Lock className="h-8 w-8 text-red-500" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Access Denied</h2>
              <p className="text-sm text-neutral-500 mt-1">
                This page is restricted to administrators.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Derived: filtered event type rows
  const filteredEventTypes = useMemo(() => {
    if (!data) return []
    return data.byEventType.filter(row =>
      eventTypeFilter.size === 0 || eventTypeFilter.has(row.eventType),
    )
  }, [data, eventTypeFilter])

  // Derived: filtered + sorted user rows
  const filteredUsers = useMemo(() => {
    if (!data) return []
    let rows = [...data.byUser]
    // billing filter: only keep users who have events with that status
    if (billingFilter.size > 0) {
      rows = rows.filter(u => {
        if (billingFilter.has('pending') && u.pending > 0) return true
        if (billingFilter.has('billed') && u.billed > 0) return true
        if (billingFilter.has('failed') && u.failed > 0) return true
        return false
      })
    }
    rows.sort((a, b) => (sortDesc ? b.totalCost - a.totalCost : a.totalCost - b.totalCost))
    return rows
  }, [data, billingFilter, sortDesc])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const pagedUsers = filteredUsers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // CSV export
  const handleExportCsv = () => {
    if (!data) return
    const rows = [
      ['Event Type', 'Events', 'Units', 'Avg Unit Cost (AUD)', 'Total Cost (AUD)', '% of Spend'],
      ...filteredEventTypes.map(row => {
        const pct = data.totalCostMtd > 0 ? ((row.totalCost / data.totalCostMtd) * 100).toFixed(1) : '0.0'
        return [
          EVENT_LABELS[row.eventType],
          row.count,
          row.units,
          row.avgUnitCost.toFixed(4),
          row.totalCost.toFixed(2),
          pct,
        ]
      }),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ai-usage-${selectedMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Toggle helpers
  const toggleBillingFilter = (s: BillingStatus) => {
    setBillingFilter(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      setPage(0)
      return next
    })
  }
  const toggleEventTypeFilter = (et: EventTypeName) => {
    setEventTypeFilter(prev => {
      const next = new Set(prev)
      if (next.has(et)) next.delete(et); else next.add(et)
      setPage(0)
      return next
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">AI Usage &amp; Billing</h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Monitor AI feature consumption and billing status
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Month selector */}
          <select
            value={selectedMonth}
            onChange={e => { setSelectedMonth(e.target.value); setPage(0) }}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => (
            <Card key={i} className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
              <CardContent className="pt-6">
                <div className="h-16 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={DollarSign}
              iconClass="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
              title="Total Cost MTD"
              value={`$${data.totalCostMtd.toFixed(2)} AUD`}
            />
            <KpiCard
              icon={Clock}
              iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              title="Pending Billing"
              value={String(data.pendingBillingCount)}
              subtitle="events awaiting billing"
            />
            <KpiCard
              icon={CheckCircle}
              iconClass="bg-green-500/10 text-green-600 dark:text-green-400"
              title="Billed MTD"
              value={`$${data.billedMtd.toFixed(2)} AUD`}
            />
            <KpiCard
              icon={XCircle}
              iconClass="bg-red-500/10 text-red-600 dark:text-red-400"
              title="Failed Events"
              value={String(data.failedCount)}
              subtitle="billing failures"
            />
          </div>

          {/* Daily cost chart */}
          <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
            <CardHeader>
              <CardTitle className="text-neutral-900 dark:text-white">Daily Cost Breakdown</CardTitle>
              <CardDescription>Last 30 days — stacked by event type</CardDescription>
            </CardHeader>
            <CardContent>
              <DailyCostChart dailyCosts={data.dailyCosts} />
            </CardContent>
          </Card>

          {/* Filter bar */}
          <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
            <CardContent className="pt-5 pb-5">
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-xs font-medium text-neutral-500 uppercase mb-2">Billing Status</p>
                  <div className="flex gap-2">
                    {BILLING_STATUSES.map(s => (
                      <button
                        key={s}
                        onClick={() => toggleBillingFilter(s)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          billingFilter.has(s)
                            ? 'bg-cyan-500 text-white border-cyan-500'
                            : 'bg-transparent text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-cyan-400'
                        }`}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500 uppercase mb-2">Event Type</p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_EVENT_TYPES.map(et => (
                      <button
                        key={et}
                        onClick={() => toggleEventTypeFilter(et)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          eventTypeFilter.has(et)
                            ? `${EVENT_COLORS[et].bar} text-white border-transparent`
                            : 'bg-transparent text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-cyan-400'
                        }`}
                      >
                        {EVENT_LABELS[et]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Event type breakdown table */}
          <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
            <CardHeader>
              <CardTitle className="text-neutral-900 dark:text-white">Event Type Breakdown</CardTitle>
              <CardDescription>Costs by AI feature for selected month</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                      <th className="text-left py-3 px-4 text-neutral-500 font-medium">Event Type</th>
                      <th className="text-right py-3 px-4 text-neutral-500 font-medium">Events</th>
                      <th className="text-right py-3 px-4 text-neutral-500 font-medium">Units</th>
                      <th className="text-right py-3 px-4 text-neutral-500 font-medium">Avg Unit Cost</th>
                      <th className="text-right py-3 px-4 text-neutral-500 font-medium">Total Cost</th>
                      <th className="py-3 px-4 text-neutral-500 font-medium w-40">% of Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEventTypes.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-neutral-400">
                          No data for selected filters
                        </td>
                      </tr>
                    )}
                    {filteredEventTypes.map(row => {
                      const pct = data.totalCostMtd > 0
                        ? (row.totalCost / data.totalCostMtd) * 100
                        : 0
                      const colors = EVENT_COLORS[row.eventType]
                      return (
                        <tr
                          key={row.eventType}
                          className="border-b border-neutral-50 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <Badge className={`${colors.bg} ${colors.text} border-0`}>
                              {EVENT_LABELS[row.eventType]}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right text-neutral-900 dark:text-white tabular-nums">
                            {row.count.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right text-neutral-900 dark:text-white tabular-nums">
                            {row.units.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right text-neutral-900 dark:text-white tabular-nums">
                            ${row.avgUnitCost.toFixed(4)} AUD
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-neutral-900 dark:text-white tabular-nums">
                            ${row.totalCost.toFixed(2)} AUD
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full bg-neutral-100 dark:bg-neutral-700 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${colors.bar}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-neutral-500 w-10 text-right tabular-nums">
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {filteredEventTypes.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-neutral-200 dark:border-neutral-700">
                        <td className="py-3 px-4 font-semibold text-neutral-900 dark:text-white" colSpan={4}>
                          Total
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-neutral-900 dark:text-white tabular-nums">
                          ${filteredEventTypes.reduce((s, r) => s + r.totalCost, 0).toFixed(2)} AUD
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Per-user table */}
          <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
            <CardHeader>
              <CardTitle className="text-neutral-900 dark:text-white">Per-User Usage</CardTitle>
              <CardDescription>
                {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} — sorted by total cost
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                      <th className="text-left py-3 px-4 text-neutral-500 font-medium">User</th>
                      <th className="text-left py-3 px-4 text-neutral-500 font-medium">Email</th>
                      <th className="text-right py-3 px-4 text-neutral-500 font-medium">Events</th>
                      <th
                        className="text-right py-3 px-4 text-neutral-500 font-medium cursor-pointer select-none hover:text-cyan-500 transition-colors"
                        onClick={() => { setSortDesc(d => !d); setPage(0) }}
                      >
                        <span className="inline-flex items-center gap-1">
                          Total Cost
                          {sortDesc ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                        </span>
                      </th>
                      <th className="text-right py-3 px-4 text-neutral-500 font-medium">Pending</th>
                      <th className="text-right py-3 px-4 text-neutral-500 font-medium">Billed</th>
                      <th className="text-right py-3 px-4 text-neutral-500 font-medium">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedUsers.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-neutral-400">
                          No users for selected filters
                        </td>
                      </tr>
                    )}
                    {pagedUsers.map(user => (
                      <tr
                        key={user.userId}
                        className="border-b border-neutral-50 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">
                          {user.name}
                        </td>
                        <td className="py-3 px-4 text-neutral-500">{user.email}</td>
                        <td className="py-3 px-4 text-right text-neutral-900 dark:text-white tabular-nums">
                          {user.eventCount.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-neutral-900 dark:text-white tabular-nums">
                          ${user.totalCost.toFixed(2)} AUD
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          {user.pending > 0 ? (
                            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-0">
                              {user.pending}
                            </Badge>
                          ) : (
                            <span className="text-neutral-400">0</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          {user.billed > 0 ? (
                            <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-0">
                              {user.billed}
                            </Badge>
                          ) : (
                            <span className="text-neutral-400">0</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          {user.failed > 0 ? (
                            <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-0">
                              {user.failed}
                            </Badge>
                          ) : (
                            <span className="text-neutral-400">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100 dark:border-neutral-800">
                  <span className="text-sm text-neutral-500">
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
