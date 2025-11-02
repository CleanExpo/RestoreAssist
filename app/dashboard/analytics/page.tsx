"use client"

import { useState, useEffect } from "react"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Download, Loader2 } from "lucide-react"
import toast from "react-hot-toast"

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

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState("30days")
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AnalyticsData | null>(null)

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/analytics?dateRange=${dateRange}`)
        if (response.ok) {
          const analyticsData = await response.json()
          setData(analyticsData)
        } else {
          toast.error("Failed to load analytics data")
        }
      } catch (error) {
        console.error("Error fetching analytics:", error)
        toast.error("Error loading analytics")
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
  }, [dateRange])

  // Handle date range change
  const handleDateRangeChange = (newRange: string) => {
    setDateRange(newRange)
  }

  // Use real data or fallback to empty data
  const reportTrendData = data?.reportTrendData || []
  const hazardDistribution = data?.hazardDistribution || []
  const insuranceTypeData = data?.insuranceTypeData || []
  const statePerformance = data?.statePerformance || []
  const turnaroundTime = data?.turnaroundTime || []
  const topClients = data?.topClients || []
  const kpis = data?.kpis || {
    totalReports: { value: 0, change: "0%" },
    totalRevenue: { value: 0, formatted: "$0", change: "0%" },
    avgReportValue: { value: 0, formatted: "$0", change: "0%" },
    avgCompletion: { value: "0", formatted: "0 hrs", change: "0%" },
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mx-auto" />
          <p className="text-slate-400">Loading analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Analytics</h1>
          <p className="text-slate-400">Business intelligence and performance metrics</p>
        </div>
        <div className="flex gap-2">
          <select
            value={dateRange}
            onChange={(e) => handleDateRangeChange(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500"
          >
            <option value="7days">Last 7 days</option>
            <option value="30days">Last 30 days</option>
            <option value="90days">Last 90 days</option>
            <option value="ytd">Year to date</option>
          </select>
          <button
            onClick={() => toast.success("Export functionality coming soon")}
            className="flex items-center gap-2 px-4 py-2 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <Download size={18} />
            Export
          </button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Reports",
            value: kpis.totalReports.value.toString(),
            change: kpis.totalReports.change,
            color: "from-blue-500 to-cyan-500",
          },
          {
            label: "Total Revenue",
            value: kpis.totalRevenue.formatted,
            change: kpis.totalRevenue.change,
            color: "from-emerald-500 to-teal-500",
          },
          {
            label: "Avg Report Value",
            value: kpis.avgReportValue.formatted,
            change: kpis.avgReportValue.change,
            color: "from-purple-500 to-pink-500",
          },
          {
            label: "Avg Completion",
            value: kpis.avgCompletion.formatted,
            change: kpis.avgCompletion.change,
            color: "from-orange-500 to-red-500",
          },
        ].map((kpi, i) => (
          <div key={i} className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <p className="text-slate-400 text-sm mb-2">{kpi.label}</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-semibold">{kpi.value}</p>
              <span
                className={`text-xs font-medium ${
                  kpi.change.startsWith("+") || kpi.change === "0%"
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {kpi.change}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Reports & Revenue Trend */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="font-semibold mb-4">Reports & Revenue Trend</h3>
          {reportTrendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={reportTrendData}>
                <defs>
                  <linearGradient id="colorReports" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                />
                <Area type="monotone" dataKey="reports" stroke="#3b82f6" fillOpacity={1} fill="url(#colorReports)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-slate-400">
              No data available for selected period
            </div>
          )}
        </div>

        {/* Hazard Distribution */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="font-semibold mb-4">Reports by Hazard Type</h3>
          {hazardDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={hazardDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {hazardDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-slate-400">
              No data available
            </div>
          )}
        </div>

        {/* Insurance Type Distribution */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="font-semibold mb-4">Reports by Insurance Type</h3>
          {insuranceTypeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={insuranceTypeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="type" stroke="#94a3b8" angle={-45} textAnchor="end" height={80} />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                />
                <Bar dataKey="count" fill="#06b6d4" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-slate-400">
              No data available
            </div>
          )}
        </div>

        {/* State Performance */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="font-semibold mb-4">Revenue by State</h3>
          {statePerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={statePerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="state" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                />
                <Bar dataKey="value" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-slate-400">
              No state data available
            </div>
          )}
        </div>

        {/* Turnaround Time */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="font-semibold mb-4">Avg Turnaround Time by Hazard</h3>
          {turnaroundTime.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={turnaroundTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="hazard" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                />
                <Line type="monotone" dataKey="hours" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-slate-400">
              No turnaround data available
            </div>
          )}
        </div>

        {/* Top Clients */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="font-semibold mb-4">Top Clients by Revenue</h3>
          {topClients.length > 0 ? (
            <div className="space-y-3">
              {topClients.map((client, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-700/20 border border-slate-600"
                >
                  <div>
                    <p className="font-medium text-sm">{client.name}</p>
                    <p className="text-xs text-slate-400">{client.reports} reports</p>
                  </div>
                  <p className="font-semibold text-cyan-400">{client.revenue}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-slate-400">
              No client data available
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
