"use client"

import { useState, useEffect, useMemo } from "react"
import { Loader2, TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Clock, DollarSign, FileText, BarChart3, Activity, Zap } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart } from "recharts"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"

import { useSession } from "next-auth/react"
import AnalyticsFilters, { AnalyticsFilters as AnalyticsFiltersType } from "./components/AnalyticsFilters"
import KPICards from "./components/KPICards"
import RevenueChart from "./components/RevenueChart"
import DamageTypesChart from "./components/DamageTypesChart"
import RevenueProjection from "./components/RevenueProjection"
import TopClientsTable from "./components/TopClientsTable"
import CompletionMetrics from "./components/CompletionMetrics"
import MonthlyVolumeChart from "./components/MonthlyVolumeChart"
import BillingOverview from "./components/BillingOverview"
import ActivityFeed from "./components/ActivityFeed"
import ExecutiveSummary from "./components/ExecutiveSummary"
import StatusPipeline from "./components/StatusPipeline"
import ActivityByDay from "./components/ActivityByDay"
import PeriodComparison from "./components/PeriodComparison"
import InsightsMovers from "./components/InsightsMovers"
import { Users, UserCog, Wrench } from "lucide-react"

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
  statusDistribution?: Array<{ status: string; count: number; revenue: number }>
  byDayOfWeek?: Array<{ day: string; dayNumber: number; reports: number; revenue: number }>
  periodComparison?: {
    current: { reports: number; revenue: number }
    previous: { reports: number; revenue: number }
    changes: { reports: string; revenue: string }
  } | null
}

interface InsightsData {
  summary: string
  periodComparison?: {
    currentReports: number
    previousReports: number
    currentRevenue: number
    previousRevenue: number
    revenueChangePct: number
    reportChangePct: number
  }
  topHazard?: { name: string; count: number }
  topGrowingClients?: Array<{
    name: string
    currentRevenue: number
    currentReports: number
    revenueChangePct: number
    reportChangePct: number
  }>
  slowestHazards?: Array<{ hazard: string; avgHours: number; count: number }>
  fastestHazards?: Array<{ hazard: string; avgHours: number; count: number }>
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
    completedReports?: number
    completionRate?: number
  }
  byHazardType: Array<{ hazardType: string; avgDays: number; count: number }>
  timeSeries: Array<{ date: string; avgCompletionDays: number }>
  trend: "improving" | "stable" | "declining"
}

interface ActivityFeedData {
  activities: Array<{
    id: string
    type: "created" | "updated" | "completed"
    description: string
    timestamp: string
    user: { id: string; name: string | null; email: string; role: string }
    report: { id: string; title: string; clientName: string; status: string }
  }>
  total: number
}

export default function AnalyticsPage() {
  const { data: session } = useSession()
  const [filters, setFilters] = useState<AnalyticsFiltersType>({
    dateRange: "30days",
  })
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [projectionData, setProjectionData] = useState<ProjectionData | null>(null)
  const [completionData, setCompletionData] = useState<CompletionData | null>(null)
  const [activityFeedData, setActivityFeedData] = useState<ActivityFeedData | null>(null)
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMetric, setSelectedMetric] = useState<'revenue' | 'reports'>('revenue')
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string | null; email: string; role: string } | null>(null)
  const isAdmin = session?.user?.role === "ADMIN"

  // Fetch selected member info when userId filter changes (for Admin and Manager)
  useEffect(() => {
    const isAdmin = session?.user?.role === "ADMIN"
    const isManager = session?.user?.role === "MANAGER"
    
    if (filters.userId && (isAdmin || isManager)) {
      const fetchMemberInfo = async () => {
        try {
          const res = await fetch("/api/team/members")
          if (res.ok) {
            const json = await res.json()
            let members = json.members || []
            
            // Manager can only see Technicians
            if (isManager) {
              members = members.filter((m: any) => m.role === "USER")
            }
            
            const member = members.find((m: any) => m.id === filters.userId)
            if (member) {
              setSelectedMember(member)
            } else {
              setSelectedMember(null)
            }
          }
        } catch (err) {
          console.error("Failed to fetch member info:", err)
          setSelectedMember(null)
        }
      }
      fetchMemberInfo()
    } else {
      setSelectedMember(null)
    }
  }, [filters.userId, session?.user?.role])

  // Calculate additional insights
  const insights = useMemo(() => {
    if (!data) return null

    const totalReports = data.kpis.totalReports.value
    const totalRevenue = data.kpis.totalRevenue.value
    const avgValue = data.kpis.avgReportValue.value
    
    // Calculate status distribution
    const statusCounts = data.reportTrendData.reduce((acc, item) => {
      // This would need status data from API, using placeholder logic
      return acc
    }, {} as Record<string, number>)

    // Calculate growth rate
    const revenueChange = parseFloat(data.kpis.totalRevenue.change.replace('%', '').replace('+', ''))
    const reportsChange = parseFloat(data.kpis.totalReports.change.replace('%', '').replace('+', ''))

    // Calculate efficiency metrics
    const avgCompletionHours = parseFloat(data.kpis.avgCompletion.value)
    const efficiencyScore = avgCompletionHours > 0 ? Math.min(100, (168 / avgCompletionHours) * 100) : 0 // 168 hours = 1 week

    return {
      revenueGrowth: revenueChange,
      reportsGrowth: reportsChange,
      efficiencyScore: Math.round(efficiencyScore),
      avgValuePerReport: avgValue,
      totalValue: totalRevenue,
      reportCount: totalReports,
      isGrowing: revenueChange > 0 && reportsChange > 0,
      topHazard: data.hazardDistribution[0]?.name || 'N/A',
      topHazardCount: data.hazardDistribution[0]?.value || 0,
    }
  }, [data])

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
        if (filters.userId) analyticsUrl.searchParams.set("userId", filters.userId)

        // Build URLs for projections and completion metrics
        const projectionsUrl = new URL("/api/analytics/revenue-projections", window.location.origin)
        projectionsUrl.searchParams.set("days", "90")
        if (filters.userId) projectionsUrl.searchParams.set("userId", filters.userId)

        const completionUrl = new URL("/api/analytics/completion-metrics", window.location.origin)
        completionUrl.searchParams.set("dateRange", filters.dateRange)
        if (filters.userId) completionUrl.searchParams.set("userId", filters.userId)

        const activityFeedUrl = new URL("/api/analytics/activity-feed", window.location.origin)
        activityFeedUrl.searchParams.set("limit", "50")
        if (filters.userId) activityFeedUrl.searchParams.set("userId", filters.userId)

        const insightsUrl = new URL("/api/analytics/insights", window.location.origin)
        insightsUrl.searchParams.set("dateRange", filters.dateRange)
        if (filters.userId) insightsUrl.searchParams.set("userId", filters.userId)

        const [analyticsRes, projectionsRes, completionRes, activityFeedRes, insightsRes] = await Promise.all([
          fetch(analyticsUrl),
          fetch(projectionsUrl),
          fetch(completionUrl),
          fetch(activityFeedUrl),
          fetch(insightsUrl),
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

        if (activityFeedRes.ok) {
          const activityFeedJson = await activityFeedRes.json()
          setActivityFeedData(activityFeedJson)
        }

        if (insightsRes.ok) {
          const insightsJson = await insightsRes.json()
          setInsightsData(insightsJson)
        } else {
          setInsightsData(null)
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
  }, [filters, isAdmin])

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
    <div className={cn("min-h-screen", "bg-gradient-to-br from-neutral-50 via-white to-neutral-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950")}>
      {/* Hero Header with Gradient */}
      <div className={cn("relative overflow-hidden p-4 rounded-md", "bg-gradient-to-r from-blue-600/20 via-cyan-600/20 to-purple-600/20", "border-b border-neutral-200 dark:border-slate-800/50")}>
        <div className="absolute inset-0 opacity-40" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>
        <div className="relative">
          <AnalyticsFilters
            onFiltersChange={setFilters}
            isLoading={loading}
            onExport={handleExport}
          />
        </div>
      </div>

      <div className=" mx-auto px-4  py-8 space-y-8">
        {/* Selected Team Member Indicator (Admin and Manager) */}
        {selectedMember && (session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER") && (
          <div className={cn(
            "p-4 rounded-xl border-2 backdrop-blur-sm shadow-lg animate-in slide-in-from-top-4",
            "bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-purple-500/10",
            "border-blue-500/30 dark:border-blue-400/30"
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                selectedMember.role === "MANAGER" 
                  ? "bg-blue-100 dark:bg-blue-900/30" 
                  : "bg-cyan-100 dark:bg-cyan-900/30"
              )}>
                {selectedMember.role === "MANAGER" ? (
                  <UserCog className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                ) : (
                  <Wrench className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                )}
              </div>
              <div>
                <p className={cn("text-sm font-medium", "text-neutral-700 dark:text-neutral-300")}>
                  Viewing analytics for: <strong>{selectedMember.name || selectedMember.email}</strong>
                </p>
                <p className={cn("text-xs mt-0.5", "text-neutral-600 dark:text-neutral-400")}>
                  {selectedMember.role === "MANAGER" ? "Manager" : "Technician"} • {selectedMember.email}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Alert with Animation */}
        {error && (
          <div className="animate-in slide-in-from-top-4 duration-300">
            <div className={cn("p-4 rounded-xl backdrop-blur-sm shadow-lg", "bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent", "border border-red-500/30")}>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <p className={cn("font-medium", "text-red-700 dark:text-red-300")}>{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Loading State with Enhanced Design */}
        {loading ? (
          <div className="flex items-center justify-center min-h-[600px]">
            <div className="text-center space-y-6">
              <div className="relative">
                <div className={cn("w-20 h-20 border-4 rounded-full", "border-neutral-300 dark:border-slate-700")}></div>
                <div className="w-20 h-20 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
              </div>
              <div className="space-y-2">
                <p className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>Loading Analytics</p>
                <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Gathering insights from your data...</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Quick Insights Bar */}
            {insights && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-75">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className={cn("bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-xl p-4 backdrop-blur-sm")}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Growth Rate</p>
                        <p className={`text-2xl font-bold ${insights.isGrowing ? 'text-emerald-400' : 'text-red-400'}`}>
                          {insights.revenueGrowth > 0 ? '+' : ''}{insights.revenueGrowth.toFixed(1)}%
                        </p>
                      </div>
                      {insights.isGrowing ? (
                        <TrendingUp className="w-8 h-8 text-emerald-400" />
                      ) : (
                        <TrendingDown className="w-8 h-8 text-red-400" />
                      )}
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-4 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Efficiency Score</p>
                        <p className="text-2xl font-bold text-purple-400">{insights.efficiencyScore}%</p>
                      </div>
                      <Zap className="w-8 h-8 text-purple-400" />
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl p-4 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Top Hazard Type</p>
                        <p className="text-lg font-bold text-amber-400">{insights.topHazard}</p>
                        <p className={cn("text-xs", "text-neutral-500 dark:text-slate-500")}>{insights.topHazardCount} reports</p>
                      </div>
                      <Activity className="w-8 h-8 text-amber-400" />
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-xl p-4 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Avg Value/Report</p>
                        <p className="text-lg font-bold text-emerald-400">
                          ${(insights.avgValuePerReport / 1000).toFixed(1)}K
                        </p>
                      </div>
                      <DollarSign className="w-8 h-8 text-emerald-400" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Executive Summary - Next-level insight */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-75">
              <ExecutiveSummary
                summary={insightsData?.summary ?? ""}
                periodLabel={filters.dateRange === "7days" ? "Last 7 days" : filters.dateRange === "30days" ? "Last 30 days" : filters.dateRange === "90days" ? "Last 90 days" : "Year to date"}
                loading={loading}
              />
            </div>

            {/* KPI Cards Section */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-100">
              <KPICards data={data?.kpis || null} />
            </div>

            {/* Period Comparison + Report Pipeline + Activity by Day */}
            <div className="grid lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500 delay-125">
              <PeriodComparison
                data={data?.periodComparison ?? null}
                currentLabel="This period"
                previousLabel="Previous period"
                loading={loading}
              />
              <StatusPipeline data={data?.statusDistribution ?? []} loading={loading} />
              <ActivityByDay data={data?.byDayOfWeek ?? []} loading={loading} />
            </div>

            {/* Top Movers & Turnaround (from insights API) */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-150">
              <InsightsMovers
                topGrowingClients={insightsData?.topGrowingClients ?? []}
                slowestHazards={insightsData?.slowestHazards ?? []}
                fastestHazards={insightsData?.fastestHazards ?? []}
                loading={loading}
              />
            </div>

            {/* Billing Overview (Admin Only) */}
            {session?.user?.role === "ADMIN" && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-150">
                <div className={cn("backdrop-blur-sm rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden", "bg-white/50 dark:bg-slate-800/50", "border border-neutral-200 dark:border-slate-700/50", "hover:border-emerald-500/30")}>
                  <BillingOverview />
                </div>
              </div>
            )}

            {/* Main Revenue Chart with Enhanced Styling */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-200">
              <div className={cn("backdrop-blur-sm rounded-2xl shadow-2xl p-6 transition-all duration-300", "bg-white/50 dark:bg-slate-800/50", "border border-neutral-200 dark:border-slate-700/50", "hover:border-cyan-500/30")}>
                <RevenueChart
                  data={data?.reportTrendData || []}
                  dateRange={filters.dateRange}
                />
              </div>
            </div>

            {/* Charts Grid with Better Layout */}
            <div className="grid lg:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 duration-500 delay-300">
              {/* Damage Types Chart */}
              <div className={cn("backdrop-blur-sm rounded-2xl shadow-xl transition-all duration-300 overflow-hidden", "bg-white/50 dark:bg-slate-800/50", "border border-neutral-200 dark:border-slate-700/50", "hover:border-purple-500/30")}>
                <DamageTypesChart data={data?.hazardDistribution || []} />
              </div>

              {/* Insurance Type Chart with Visual Bar */}
              {data?.insuranceTypeData && data.insuranceTypeData.length > 0 && (
                <div className={cn("backdrop-blur-sm rounded-2xl shadow-xl transition-all duration-300 p-6", "bg-white/50 dark:bg-slate-800/50", "border border-neutral-200 dark:border-slate-700/50", "hover:border-blue-500/30")}>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>Insurance Distribution</h3>
                    <BarChart3 className="w-5 h-5 text-blue-400" />
                  </div>
                  
                  {/* Bar Chart Visualization */}
                  <div className="space-y-4 mb-4">
                    {data.insuranceTypeData.map((item, idx) => {
                      const maxCount = Math.max(...data.insuranceTypeData.map(i => i.count))
                      const percentage = (item.count / maxCount) * 100
                      return (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className={cn("text-sm font-medium", "text-neutral-700 dark:text-slate-300")}>{item.type || 'Unknown'}</span>
                            <span className="text-sm font-bold text-cyan-400">{item.count}</span>
                          </div>
                          <div className={cn("w-full rounded-full h-2.5 overflow-hidden", "bg-neutral-200 dark:bg-slate-700/30")}>
                            <div 
                              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-1000"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Total Count */}
                  <div className={cn("pt-4 border-t", "border-neutral-200 dark:border-slate-700/50")}>
                    <div className="flex items-center justify-between">
                      <span className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Total Insurance Types</span>
                      <span className="text-lg font-bold text-blue-400">
                        {data.insuranceTypeData.length}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Additional Metrics Row */}
            <div className="grid lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500 delay-350">
              {/* State Performance with Chart */}
              {data?.statePerformance && data.statePerformance.length > 0 && (
                <div className={cn("lg:col-span-2 backdrop-blur-sm rounded-2xl shadow-xl transition-all duration-300 p-6", "bg-white/50 dark:bg-slate-800/50", "border border-neutral-200 dark:border-slate-700/50", "hover:border-amber-500/30")}>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>Performance by State</h3>
                    <Activity className="w-5 h-5 text-amber-400" />
                  </div>
                  
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.statePerformance.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-300 dark:stroke-slate-700" />
                      <XAxis 
                        dataKey="state" 
                        className="text-neutral-600 dark:text-slate-400"
                        style={{ fontSize: "12px" }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis className="text-neutral-600 dark:text-slate-400" style={{ fontSize: "12px" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgb(255 255 255 / 0.95)",
                          border: "1px solid rgb(229 231 235)",
                          borderRadius: "8px",
                          color: "#111827",
                        }}
                        className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                        formatter={(value: any) => [`${value} reports`, "Count"]}
                      />
                      <Bar dataKey="value" fill="#f59e0b" radius={[8, 8, 0, 0]}>
                        {data.statePerformance.slice(0, 8).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={`hsl(${30 + index * 15}, 70%, 50%)`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Turnaround Time Summary */}
              {data?.turnaroundTime && data.turnaroundTime.length > 0 && (
                <div className={cn("backdrop-blur-sm rounded-2xl shadow-xl transition-all duration-300 p-6", "bg-white/50 dark:bg-slate-800/50", "border border-neutral-200 dark:border-slate-700/50", "hover:border-orange-500/30")}>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>Turnaround Time</h3>
                    <Clock className="w-5 h-5 text-orange-400" />
                  </div>
                  
                  <div className="space-y-4">
                    {data.turnaroundTime.slice(0, 5).map((item, idx) => {
                      const maxHours = Math.max(...data.turnaroundTime.map(t => t.hours))
                      const percentage = (item.hours / maxHours) * 100
                      return (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className={cn("text-sm font-medium", "text-neutral-700 dark:text-slate-300")}>{item.hazard}</span>
                            <span className="text-sm font-bold text-orange-500 dark:text-orange-400">{item.hours.toFixed(1)}h</span>
                          </div>
                          <div className={cn("w-full rounded-full h-2 overflow-hidden", "bg-neutral-200 dark:bg-slate-700/30")}>
                            <div 
                              className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-1000"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {data.turnaroundTime.length > 5 && (
                    <div className={cn("mt-4 pt-4 border-t text-center", "border-neutral-200 dark:border-slate-700/50")}>
                      <span className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>
                        +{data.turnaroundTime.length - 5} more hazard types
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Revenue Projection - Full Width with Enhanced Design */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-400">
              <div className={cn("backdrop-blur-sm rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden", "bg-white/50 dark:bg-slate-800/50", "border border-neutral-200 dark:border-slate-700/50", "hover:border-cyan-500/30")}>
                {projectionData ? (
                  <RevenueProjection
                    historical={projectionData.historical}
                    projected={projectionData.projected}
                    trend={projectionData.trend}
                  />
                ) : (
                  <div className="p-12 flex items-center justify-center">
                    <div className="text-center space-y-4">
                      <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
                      <p className={cn("text-neutral-600 dark:text-slate-400")}>Calculating revenue forecast...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Additional Metrics Grid */}
            <div className="grid lg:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 duration-500 delay-500">
              {/* Top Clients */}
              <div className={cn("backdrop-blur-sm rounded-2xl shadow-xl transition-all duration-300 overflow-hidden", "bg-white/50 dark:bg-slate-800/50", "border border-neutral-200 dark:border-slate-700/50", "hover:border-emerald-500/30")}>
                <TopClientsTable
                  data={
                    data?.topClients?.map((client) => ({
                      name: client.name,
                      reports: client.reports,
                      revenue: client.revenue,
                    })) || []
                  }
                />
              </div>

              {/* State Performance (if available) */}
              {data?.statePerformance && data.statePerformance.length > 0 && (
                <div className={cn("backdrop-blur-sm rounded-2xl shadow-xl transition-all duration-300 p-6", "bg-white/50 dark:bg-slate-800/50", "border border-neutral-200 dark:border-slate-700/50", "hover:border-amber-500/30")}>
                  <h3 className={cn("text-lg font-semibold mb-4", "text-neutral-900 dark:text-slate-200")}>Performance by State</h3>
                  <div className="space-y-3">
                    {data.statePerformance.slice(0, 5).map((state, idx) => (
                      <div key={idx} className={cn("flex items-center justify-between p-3 rounded-lg", "bg-neutral-100 dark:bg-slate-700/30")}>
                        <span className={cn("font-medium", "text-neutral-700 dark:text-slate-300")}>{state.state || 'Unknown'}</span>
                        <span className="text-amber-400 font-semibold">{state.value} reports</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Monthly Volume Chart */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-550">
              <div className={cn("backdrop-blur-sm rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden", "bg-white/50 dark:bg-slate-800/50", "border border-neutral-200 dark:border-slate-700/50", "hover:border-cyan-500/30")}>
                <MonthlyVolumeChart userId={filters.userId} months={12} />
              </div>
            </div>

            {/* Completion Metrics - Full Width */}
            {completionData && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-600">
                <div className={cn("backdrop-blur-sm rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden", "bg-white/50 dark:bg-slate-800/50", "border border-neutral-200 dark:border-slate-700/50", "hover:border-purple-500/30")}>
                  <CompletionMetrics
                    overall={completionData.overall}
                    byHazardType={completionData.byHazardType}
                    timeSeries={completionData.timeSeries}
                    trend={completionData.trend}
                  />
                </div>
              </div>
            )}

            {/* Billing Overview - Admin Only (fetches its own data) */}
            {isAdmin && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-700">
                <div className={cn("backdrop-blur-sm rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden", "bg-white/50 dark:bg-slate-800/50", "border border-neutral-200 dark:border-slate-700/50", "hover:border-emerald-500/30")}>
                  <BillingOverview />
                </div>
              </div>
            )}

            {/* Team Activity Feed - Full Width */}
            {activityFeedData && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-900">
                <div className={cn("backdrop-blur-sm rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden", "bg-white/50 dark:bg-slate-800/50", "border border-neutral-200 dark:border-slate-700/50", "hover:border-cyan-500/30")}>
                  <ActivityFeed activities={activityFeedData.activities} />
                </div>
              </div>
            )}

            {/* Revenue Trend Analysis */}
            {data?.reportTrendData && data.reportTrendData.length > 0 && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-700">
                <div className={cn("backdrop-blur-sm rounded-2xl shadow-xl transition-all duration-300 p-6", "bg-white/50 dark:bg-slate-800/50", "border border-neutral-200 dark:border-slate-700/50", "hover:border-indigo-500/30")}>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>Revenue vs Reports Trend</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedMetric('revenue')}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95",
                          selectedMetric === 'revenue'
                            ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md hover:shadow-lg hover:shadow-indigo-500/30'
                            : cn("text-neutral-700 dark:text-slate-300", "bg-neutral-100 dark:bg-slate-700/50", "hover:bg-neutral-200 dark:hover:bg-slate-700", "hover:shadow-md")
                        )}
                        title="View revenue metrics"
                      >
                        Revenue
                      </button>
                      <button
                        onClick={() => setSelectedMetric('reports')}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95",
                          selectedMetric === 'reports'
                            ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md hover:shadow-lg hover:shadow-indigo-500/30'
                            : cn("text-neutral-700 dark:text-slate-300", "bg-neutral-100 dark:bg-slate-700/50", "hover:bg-neutral-200 dark:hover:bg-slate-700", "hover:shadow-md")
                        )}
                        title="View report metrics"
                      >
                        Reports
                      </button>
                    </div>
                  </div>
                  
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={data.reportTrendData}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorReports" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-300 dark:stroke-slate-700" />
                      <XAxis 
                        dataKey="date" 
                        className="text-neutral-600 dark:text-slate-400"
                        style={{ fontSize: "12px" }}
                        angle={data.reportTrendData.length > 10 ? -45 : 0}
                        textAnchor={data.reportTrendData.length > 10 ? "end" : "middle"}
                        height={data.reportTrendData.length > 10 ? 80 : 30}
                      />
                      <YAxis 
                        yAxisId="left"
                        className="text-neutral-600 dark:text-slate-400"
                        style={{ fontSize: "12px" }}
                        label={selectedMetric === 'revenue' ? { value: 'Revenue ($)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'rgb(75 85 99)' } } : undefined}
                      />
                      <YAxis 
                        yAxisId="right" 
                        orientation="right"
                        className="text-neutral-600 dark:text-slate-400"
                        style={{ fontSize: "12px" }}
                        label={selectedMetric === 'reports' ? { value: 'Reports', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: 'rgb(75 85 99)' } } : undefined}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgb(255 255 255 / 0.95)",
                          border: "1px solid rgb(229 231 235)",
                          borderRadius: "8px",
                          color: "#111827",
                        }}
                        className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                        formatter={(value: any, name?: string) => {
                          if (name === 'revenue') return [`$${value.toLocaleString()}`, 'Revenue']
                          return [value, 'Reports']
                        }}
                      />
                      <Legend />
                      {selectedMetric === 'revenue' ? (
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="#6366f1"
                          fillOpacity={1}
                          fill="url(#colorRevenue)"
                          name="Revenue"
                          yAxisId="left"
                        />
                      ) : (
                        <Area
                          type="monotone"
                          dataKey="reports"
                          stroke="#8b5cf6"
                          fillOpacity={1}
                          fill="url(#colorReports)"
                          name="Reports"
                          yAxisId="right"
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Summary Stats Footer */}
            {data && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-800">
                <div className={cn("backdrop-blur-sm rounded-2xl p-6", "bg-white/50 dark:bg-slate-800/30", "border border-neutral-200 dark:border-slate-700/30")}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 mb-3">
                        <FileText className="w-6 h-6 text-blue-400" />
                      </div>
                      <p className={cn("text-2xl font-bold", "text-neutral-900 dark:text-slate-200")}>{data.kpis.totalReports.value}</p>
                      <p className={cn("text-xs mt-1", "text-neutral-600 dark:text-slate-400")}>Total Reports</p>
                    </div>
                    
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 mb-3">
                        <DollarSign className="w-6 h-6 text-emerald-400" />
                      </div>
                      <p className={cn("text-2xl font-bold", "text-neutral-900 dark:text-slate-200")}>{data.kpis.totalRevenue.formatted}</p>
                      <p className={cn("text-xs mt-1", "text-neutral-600 dark:text-slate-400")}>Total Revenue</p>
                    </div>
                    
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-500/10 mb-3">
                        <BarChart3 className="w-6 h-6 text-purple-400" />
                      </div>
                      <p className={cn("text-2xl font-bold", "text-neutral-900 dark:text-slate-200")}>{data.hazardDistribution.length}</p>
                      <p className={cn("text-xs mt-1", "text-neutral-600 dark:text-slate-400")}>Hazard Types</p>
                    </div>
                    
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10 mb-3">
                        <Clock className="w-6 h-6 text-orange-400" />
                      </div>
                      <p className={cn("text-2xl font-bold", "text-neutral-900 dark:text-slate-200")}>{data.kpis.avgCompletion.formatted}</p>
                      <p className={cn("text-xs mt-1", "text-neutral-600 dark:text-slate-400")}>Avg Completion</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!data && !loading && (
              <div className="text-center py-16 animate-in fade-in duration-500">
                <div className={cn("inline-flex items-center justify-center w-24 h-24 rounded-full border mb-6", "bg-white/50 dark:bg-slate-800/50", "border-neutral-200 dark:border-slate-700/50")}>
                  <BarChart3 className={cn("w-12 h-12", "text-neutral-500 dark:text-slate-400")} />
                </div>
                <h3 className={cn("text-2xl font-semibold mb-2", "text-neutral-900 dark:text-slate-300")}>No Analytics Data Available</h3>
                <p className={cn("mb-6 max-w-md mx-auto", "text-neutral-600 dark:text-slate-400")}>
                  Start creating reports to see comprehensive analytics insights, revenue trends, and performance metrics.
                </p>
                <div className={cn("flex items-center justify-center gap-4 text-sm", "text-neutral-500 dark:text-slate-500")}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Revenue tracking</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Performance metrics</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Trend analysis</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
