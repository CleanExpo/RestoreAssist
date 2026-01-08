"use client"

import { useState, useEffect, useMemo } from "react"
import { Loader2, TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Clock, DollarSign, FileText, BarChart3, Activity, Zap } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart } from "recharts"
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
  const [selectedMetric, setSelectedMetric] = useState<'revenue' | 'reports'>('revenue')

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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Hero Header with Gradient */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-600/20 via-cyan-600/20 to-purple-600/20 border-b border-slate-800/50 p-4 rounded-md">
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

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Error Alert with Animation */}
        {error && (
          <div className="animate-in slide-in-from-top-4 duration-300">
            <div className="p-4 rounded-xl bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent border border-red-500/30 backdrop-blur-sm shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <p className="text-red-300 font-medium">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Loading State with Enhanced Design */}
        {loading ? (
          <div className="flex items-center justify-center min-h-[600px]">
            <div className="text-center space-y-6">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-slate-700 rounded-full"></div>
                <div className="w-20 h-20 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
              </div>
              <div className="space-y-2">
                <p className="text-lg font-semibold text-slate-200">Loading Analytics</p>
                <p className="text-sm text-slate-400">Gathering insights from your data...</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Quick Insights Bar */}
            {insights && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-75">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-xl p-4 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Growth Rate</p>
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
                        <p className="text-xs text-slate-400 mb-1">Efficiency Score</p>
                        <p className="text-2xl font-bold text-purple-400">{insights.efficiencyScore}%</p>
                      </div>
                      <Zap className="w-8 h-8 text-purple-400" />
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl p-4 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Top Hazard Type</p>
                        <p className="text-lg font-bold text-amber-400">{insights.topHazard}</p>
                        <p className="text-xs text-slate-500">{insights.topHazardCount} reports</p>
                      </div>
                      <Activity className="w-8 h-8 text-amber-400" />
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-xl p-4 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Avg Value/Report</p>
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

            {/* KPI Cards Section */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-100">
              <KPICards data={data?.kpis || null} />
            </div>

            {/* Main Revenue Chart with Enhanced Styling */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-200">
              <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-2xl p-6 hover:border-cyan-500/30 transition-all duration-300">
                <RevenueChart
                  data={data?.reportTrendData || []}
                  dateRange={filters.dateRange}
                />
              </div>
            </div>

            {/* Charts Grid with Better Layout */}
            <div className="grid lg:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 duration-500 delay-300">
              {/* Damage Types Chart */}
              <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl hover:border-purple-500/30 transition-all duration-300 overflow-hidden">
                <DamageTypesChart data={data?.hazardDistribution || []} />
              </div>

              {/* Insurance Type Chart with Visual Bar */}
              {data?.insuranceTypeData && data.insuranceTypeData.length > 0 && (
                <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl hover:border-blue-500/30 transition-all duration-300 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-slate-200">Insurance Distribution</h3>
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
                            <span className="text-sm font-medium text-slate-300">{item.type || 'Unknown'}</span>
                            <span className="text-sm font-bold text-cyan-400">{item.count}</span>
                          </div>
                          <div className="w-full bg-slate-700/30 rounded-full h-2.5 overflow-hidden">
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
                  <div className="pt-4 border-t border-slate-700/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">Total Insurance Types</span>
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
                <div className="lg:col-span-2 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl hover:border-amber-500/30 transition-all duration-300 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-slate-200">Performance by State</h3>
                    <Activity className="w-5 h-5 text-amber-400" />
                  </div>
                  
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.statePerformance.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis 
                        dataKey="state" 
                        stroke="#94a3b8" 
                        style={{ fontSize: "12px" }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis stroke="#94a3b8" style={{ fontSize: "12px" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1e293b",
                          border: "1px solid #475569",
                          borderRadius: "8px",
                        }}
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
                <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl hover:border-orange-500/30 transition-all duration-300 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-slate-200">Turnaround Time</h3>
                    <Clock className="w-5 h-5 text-orange-400" />
                  </div>
                  
                  <div className="space-y-4">
                    {data.turnaroundTime.slice(0, 5).map((item, idx) => {
                      const maxHours = Math.max(...data.turnaroundTime.map(t => t.hours))
                      const percentage = (item.hours / maxHours) * 100
                      return (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-300">{item.hazard}</span>
                            <span className="text-sm font-bold text-orange-400">{item.hours.toFixed(1)}h</span>
                          </div>
                          <div className="w-full bg-slate-700/30 rounded-full h-2 overflow-hidden">
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
                    <div className="mt-4 pt-4 border-t border-slate-700/50 text-center">
                      <span className="text-xs text-slate-400">
                        +{data.turnaroundTime.length - 5} more hazard types
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Revenue Projection - Full Width with Enhanced Design */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-400">
              <div className="bg-gradient-to-br from-slate-800/50 via-slate-900/50 to-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-2xl hover:border-cyan-500/30 transition-all duration-300 overflow-hidden">
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
                      <p className="text-slate-400">Calculating revenue forecast...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Additional Metrics Grid */}
            <div className="grid lg:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 duration-500 delay-500">
              {/* Top Clients */}
              <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl hover:border-emerald-500/30 transition-all duration-300 overflow-hidden">
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
                <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl hover:border-amber-500/30 transition-all duration-300 p-6">
                  <h3 className="text-lg font-semibold text-slate-200 mb-4">Performance by State</h3>
                  <div className="space-y-3">
                    {data.statePerformance.slice(0, 5).map((state, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                        <span className="text-slate-300 font-medium">{state.state || 'Unknown'}</span>
                        <span className="text-amber-400 font-semibold">{state.value} reports</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Completion Metrics - Full Width */}
            {completionData && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-600">
                <div className="bg-gradient-to-br from-slate-800/50 via-slate-900/50 to-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-2xl hover:border-purple-500/30 transition-all duration-300 overflow-hidden">
                  <CompletionMetrics
                    overall={completionData.overall}
                    byHazardType={completionData.byHazardType}
                    timeSeries={completionData.timeSeries}
                    trend={completionData.trend}
                  />
                </div>
              </div>
            )}

            {/* Revenue Trend Analysis */}
            {data?.reportTrendData && data.reportTrendData.length > 0 && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-700">
                <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl hover:border-indigo-500/30 transition-all duration-300 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-slate-200">Revenue vs Reports Trend</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedMetric('revenue')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          selectedMetric === 'revenue'
                            ? 'bg-indigo-500 text-white'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        Revenue
                      </button>
                      <button
                        onClick={() => setSelectedMetric('reports')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          selectedMetric === 'reports'
                            ? 'bg-indigo-500 text-white'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        }`}
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
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#94a3b8" 
                        style={{ fontSize: "12px" }}
                        angle={data.reportTrendData.length > 10 ? -45 : 0}
                        textAnchor={data.reportTrendData.length > 10 ? "end" : "middle"}
                        height={data.reportTrendData.length > 10 ? 80 : 30}
                      />
                      <YAxis 
                        yAxisId="left"
                        stroke="#94a3b8" 
                        style={{ fontSize: "12px" }}
                        label={selectedMetric === 'revenue' ? { value: 'Revenue ($)', angle: -90, position: 'insideLeft' } : undefined}
                      />
                      <YAxis 
                        yAxisId="right" 
                        orientation="right"
                        stroke="#94a3b8" 
                        style={{ fontSize: "12px" }}
                        label={selectedMetric === 'reports' ? { value: 'Reports', angle: 90, position: 'insideRight' } : undefined}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1e293b",
                          border: "1px solid #475569",
                          borderRadius: "8px",
                        }}
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
                <div className="bg-gradient-to-br from-slate-800/30 to-slate-900/30 backdrop-blur-sm rounded-2xl border border-slate-700/30 p-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 mb-3">
                        <FileText className="w-6 h-6 text-blue-400" />
                      </div>
                      <p className="text-2xl font-bold text-slate-200">{data.kpis.totalReports.value}</p>
                      <p className="text-xs text-slate-400 mt-1">Total Reports</p>
                    </div>
                    
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 mb-3">
                        <DollarSign className="w-6 h-6 text-emerald-400" />
                      </div>
                      <p className="text-2xl font-bold text-slate-200">{data.kpis.totalRevenue.formatted}</p>
                      <p className="text-xs text-slate-400 mt-1">Total Revenue</p>
                    </div>
                    
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-500/10 mb-3">
                        <BarChart3 className="w-6 h-6 text-purple-400" />
                      </div>
                      <p className="text-2xl font-bold text-slate-200">{data.hazardDistribution.length}</p>
                      <p className="text-xs text-slate-400 mt-1">Hazard Types</p>
                    </div>
                    
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10 mb-3">
                        <Clock className="w-6 h-6 text-orange-400" />
                      </div>
                      <p className="text-2xl font-bold text-slate-200">{data.kpis.avgCompletion.formatted}</p>
                      <p className="text-xs text-slate-400 mt-1">Avg Completion</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!data && !loading && (
              <div className="text-center py-16 animate-in fade-in duration-500">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 mb-6">
                  <BarChart3 className="w-12 h-12 text-slate-400" />
                </div>
                <h3 className="text-2xl font-semibold text-slate-300 mb-2">No Analytics Data Available</h3>
                <p className="text-slate-400 mb-6 max-w-md mx-auto">
                  Start creating reports to see comprehensive analytics insights, revenue trends, and performance metrics.
                </p>
                <div className="flex items-center justify-center gap-4 text-sm text-slate-500">
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
