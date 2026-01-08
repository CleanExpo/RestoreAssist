"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import toast from "react-hot-toast"

import AnalyticsFilters, { AnalyticsFilters as AnalyticsFiltersType } from "./components/AnalyticsFilters"
import KPICards from "./components/KPICards"
import RevenueChart from "./components/RevenueChart"
import DamageTypesChart from "./components/DamageTypesChart"
import RevenueProjection from "./components/RevenueProjection"
import TopClientsTable from "./components/TopClientsTable"
import CompletionMetrics from "./components/CompletionMetrics"

interface AnalyticsData {
  kpis: {
    totalReports: { value: number; change: string }
    totalRevenue: { value: number; formatted: string; change: string }
    avgReportValue: { value: number; formatted: string; change: string }
    avgCompletion: { value: string; formatted: string; change: string }
  }
  reportTrendData: Array<{ date: string; reports: number; revenue: number }>
  hazardDistribution: Array<{ name: string; value: number; color: string }>
  insuranceTypeData: Array<{ type: string; count: number }>
  statePerformance: Array<{ state: string; value: number }>
  turnaroundTime: Array<{ hazard: string; hours: number }>
  topClients: Array<{ name: string; reports: number; revenue: string }>
}

interface ProjectionData {
  historical: Array<{ date: string; revenue: number }>
  projected: Array<{ date: string; revenue: number; isProjected: boolean; confidence: number }>
  trend: "improving" | "stable" | "declining"
}

interface CompletionData {
  overall: {
    avgDays: number
    medianDays: number
    p95Days: number
    totalReports: number
  }
  byHazardType: Array<{ hazardType: string; avgDays: number; count: number }>
  timeSeries: Array<{ date: string; avgCompletionDays: number }>
  trend: "improving" | "stable" | "declining"
}

export default function AnalyticsPage() {
  const [filters, setFilters] = useState<AnalyticsFiltersType>({
    dateRange: "30days",
  })
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [projectionData, setProjectionData] = useState<ProjectionData | null>(null)
  const [completionData, setCompletionData] = useState<CompletionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true)
        setError(null)

        // Fetch main analytics
        const analyticsUrl = new URL("/api/analytics", window.location.origin)
        analyticsUrl.searchParams.set("dateRange", filters.dateRange)
        if (filters.customFrom) analyticsUrl.searchParams.set("from", filters.customFrom)
        if (filters.customTo) analyticsUrl.searchParams.set("to", filters.customTo)

        const [analyticsRes, projectionsRes, completionRes] = await Promise.all([
          fetch(analyticsUrl),
          fetch("/api/analytics/revenue-projections?days=90"),
          fetch(`/api/analytics/completion-metrics?dateRange=${filters.dateRange}`),
        ])

        if (!analyticsRes.ok) throw new Error("Failed to load analytics")

        const analyticsJson = await analyticsRes.json()
        setData(analyticsJson)

        if (projectionsRes.ok) {
          const projectionsJson = await projectionsRes.json()
          setProjectionData(projectionsJson)
        }

        if (completionRes.ok) {
          const completionJson = await completionRes.json()
          setCompletionData(completionJson)
        }
      } catch (err) {
        console.error("Error fetching analytics:", err)
        setError(err instanceof Error ? err.message : "Failed to load analytics")
        toast.error("Error loading analytics")
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
  }, [filters])

  const handleExport = async (format: "csv" | "excel" | "pdf") => {
    try {
      const now = new Date()
      const from = filters.customFrom || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      const to = filters.customTo || now.toISOString().split("T")[0]

      const response = await fetch("/api/analytics/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          dateRange: { from, to },
          includeCharts: true,
        }),
      })

      if (!response.ok) throw new Error("Export failed")

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `analytics-export.${format === "excel" ? "xlsx" : format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success(`Successfully exported as ${format.toUpperCase()}`)
    } catch (err) {
      console.error("Export error:", err)
      toast.error(`Failed to export as ${format}`)
      throw err
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <AnalyticsFilters
        onFiltersChange={setFilters}
        isLoading={loading}
        onExport={handleExport}
      />

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mx-auto" />
            <p className="text-slate-400">Loading analytics...</p>
          </div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <KPICards data={data?.kpis || null} />

          {/* Revenue Chart */}
          <RevenueChart
            data={data?.reportTrendData || []}
            dateRange={filters.dateRange}
          />

          {/* Charts Grid */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Damage Types */}
            <DamageTypesChart data={data?.hazardDistribution || []} />

            {/* Revenue Projection */}
            <div className="lg:col-span-2">
              {projectionData ? (
                <RevenueProjection
                  historical={projectionData.historical}
                  projected={projectionData.projected}
                  trend={projectionData.trend}
                />
              ) : (
                <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30 text-slate-400">
                  Loading forecast...
                </div>
              )}
            </div>
          </div>

          {/* Top Clients */}
          <TopClientsTable
            data={
              data?.topClients?.map((client) => ({
                name: client.name,
                reports: client.reports,
                revenue: client.revenue,
              })) || []
            }
          />

          {/* Completion Metrics */}
          {completionData && (
            <CompletionMetrics
              overall={completionData.overall}
              byHazardType={completionData.byHazardType}
              timeSeries={completionData.timeSeries}
              trend={completionData.trend}
            />
          )}
        </>
      )}
    </div>
  )
}
