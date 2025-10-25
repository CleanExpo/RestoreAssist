"use client"

import { useState } from "react"
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
import { Download } from "lucide-react"

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState("30days")

  const reportTrendData = [
    { date: "Jan 1", reports: 12, revenue: 45000 },
    { date: "Jan 8", reports: 18, revenue: 62000 },
    { date: "Jan 15", reports: 24, revenue: 78000 },
    { date: "Jan 22", reports: 20, revenue: 68000 },
    { date: "Jan 29", reports: 28, revenue: 92000 },
  ]

  const hazardDistribution = [
    { name: "Water", value: 45, color: "#3b82f6" },
    { name: "Fire", value: 25, color: "#f97316" },
    { name: "Storm", value: 15, color: "#8b5cf6" },
    { name: "Mould", value: 10, color: "#10b981" },
    { name: "Other", value: 5, color: "#6b7280" },
  ]

  const insuranceTypeData = [
    { type: "Building & Contents", count: 120 },
    { type: "Standalone Building", count: 45 },
    { type: "Standalone Contents", count: 35 },
    { type: "Landlord Insurance", count: 30 },
    { type: "Portable Valuables", count: 17 },
  ]

  const statePerformance = [
    { state: "NSW", value: 45000 },
    { state: "VIC", value: 38000 },
    { state: "QLD", value: 52000 },
    { state: "WA", value: 28000 },
    { state: "SA", value: 18000 },
  ]

  const turnaroundTime = [
    { hazard: "Water", hours: 2.1 },
    { hazard: "Fire", hours: 3.2 },
    { hazard: "Storm", hours: 2.8 },
    { hazard: "Mould", hours: 2.5 },
  ]

  const topClients = [
    { name: "Advanced Property Restoration", reports: 12, revenue: "$125,400" },
    { name: "Impact Restoration Services", reports: 15, revenue: "$156,200" },
    { name: "Restore Pro QLD", reports: 8, revenue: "$78,500" },
    { name: "Clean Slate Services", reports: 6, revenue: "$52,300" },
    { name: "Premier Restoration Co", reports: 5, revenue: "$48,750" },
  ]

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
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500"
          >
            <option value="7days">Last 7 days</option>
            <option value="30days">Last 30 days</option>
            <option value="90days">Last 90 days</option>
            <option value="ytd">Year to date</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors">
            <Download size={18} />
            Export
          </button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid md:grid-cols-4 gap-4">
        {[
          { label: "Total Reports", value: "247", change: "+12%", color: "from-blue-500 to-cyan-500" },
          { label: "Total Revenue", value: "$1.24M", change: "+8%", color: "from-emerald-500 to-teal-500" },
          { label: "Avg Report Value", value: "$5,050", change: "+5%", color: "from-purple-500 to-pink-500" },
          { label: "Avg Completion", value: "2.3 hrs", change: "-15%", color: "from-orange-500 to-red-500" },
        ].map((kpi, i) => (
          <div key={i} className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <p className="text-slate-400 text-sm mb-2">{kpi.label}</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-semibold">{kpi.value}</p>
              <span className="text-xs font-medium text-emerald-400">{kpi.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Reports & Revenue Trend */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="font-semibold mb-4">Reports & Revenue Trend</h3>
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
        </div>

        {/* Hazard Distribution */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="font-semibold mb-4">Reports by Hazard Type</h3>
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
        </div>

        {/* Insurance Type Distribution */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="font-semibold mb-4">Reports by Insurance Type</h3>
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
        </div>

        {/* State Performance */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="font-semibold mb-4">Revenue by State</h3>
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
        </div>

        {/* Turnaround Time */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="font-semibold mb-4">Avg Turnaround Time by Hazard</h3>
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
        </div>

        {/* Top Clients */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="font-semibold mb-4">Top Clients by Revenue</h3>
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
        </div>
      </div>
    </div>
  )
}
