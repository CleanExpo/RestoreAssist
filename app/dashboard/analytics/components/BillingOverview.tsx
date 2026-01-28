"use client"

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts"
import { Loader2, DollarSign, TrendingUp, Users, Crown } from "lucide-react"
import { cn } from "@/lib/utils"

interface BillingData {
  month: string
  monthKey: string
  revenue: number
  reports: number
}

interface BillingOverviewProps {
  summary?: {
    totalRevenue: number
    totalReports: number
    averageRevenuePerReport: number
    averageRevenuePerMonth: number
  }
  chartData: BillingData[]
  revenueByRole?: Array<{ role: string; revenue: number; reports: number }>
  topGenerators?: Array<{
    userId: string
    userName: string
    userEmail: string
    userRole: string
    revenue: number
    reports: number
  }>
  loading?: boolean
}

export default function BillingOverview({
  summary,
  chartData,
  revenueByRole = [],
  topGenerators = [],
  loading = false,
}: BillingOverviewProps) {
  if (loading) {
    return (
      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <div className="h-[400px] flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
            <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Loading billing overview...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!chartData || chartData.length === 0) {
    return (
      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <h3 className={cn("font-semibold mb-4", "text-neutral-900 dark:text-slate-200")}>Billing Overview</h3>
        <div className={cn("flex items-center justify-center h-[300px]", "text-neutral-600 dark:text-slate-400")}>
          No billing data available
        </div>
      </div>
    )
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(value)
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className={cn("p-4 rounded-lg border", "bg-gradient-to-br from-emerald-500/10 to-green-500/10", "border-emerald-500/20 dark:border-emerald-500/30")}>
            <div className="flex items-center justify-between mb-2">
              <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>Total Revenue</p>
              <DollarSign className="w-4 h-4 text-emerald-500" />
            </div>
            <p className={cn("text-2xl font-bold", "text-emerald-600 dark:text-emerald-400")}>
              {formatCurrency(summary.totalRevenue)}
            </p>
          </div>

          <div className={cn("p-4 rounded-lg border", "bg-gradient-to-br from-blue-500/10 to-cyan-500/10", "border-blue-500/20 dark:border-blue-500/30")}>
            <div className="flex items-center justify-between mb-2">
              <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>Total Reports</p>
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            <p className={cn("text-2xl font-bold", "text-blue-600 dark:text-blue-400")}>
              {summary.totalReports}
            </p>
          </div>

          <div className={cn("p-4 rounded-lg border", "bg-gradient-to-br from-purple-500/10 to-pink-500/10", "border-purple-500/20 dark:border-purple-500/30")}>
            <div className="flex items-center justify-between mb-2">
              <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>Avg per Report</p>
              <DollarSign className="w-4 h-4 text-purple-500" />
            </div>
            <p className={cn("text-2xl font-bold", "text-purple-600 dark:text-purple-400")}>
              {formatCurrency(summary.averageRevenuePerReport)}
            </p>
          </div>

          <div className={cn("p-4 rounded-lg border", "bg-gradient-to-br from-amber-500/10 to-orange-500/10", "border-amber-500/20 dark:border-amber-500/30")}>
            <div className="flex items-center justify-between mb-2">
              <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>Avg per Month</p>
              <TrendingUp className="w-4 h-4 text-amber-500" />
            </div>
            <p className={cn("text-2xl font-bold", "text-amber-600 dark:text-amber-400")}>
              {formatCurrency(summary.averageRevenuePerMonth)}
            </p>
          </div>
        </div>
      )}

      {/* Revenue Chart */}
      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <h3 className={cn("font-semibold text-lg mb-4", "text-neutral-900 dark:text-slate-200")}>Monthly Revenue Trend</h3>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={chartData}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-300 dark:stroke-slate-700" />
            <XAxis
              dataKey="month"
              className="text-neutral-600 dark:text-slate-400"
              style={{ fontSize: "12px" }}
              angle={chartData.length > 6 ? -45 : 0}
              textAnchor={chartData.length > 6 ? "end" : "middle"}
              height={chartData.length > 6 ? 80 : 30}
            />
            <YAxis
              className="text-neutral-600 dark:text-slate-400"
              style={{ fontSize: "12px" }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgb(255 255 255 / 0.95)",
                border: "1px solid rgb(229 231 235)",
                borderRadius: "8px",
                color: "#111827",
              }}
              className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
              formatter={(value: any, name: string) => {
                if (name === "Revenue") return [formatCurrency(value), "Revenue"]
                return [value, name]
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#10b981"
              fillOpacity={1}
              fill="url(#colorRevenue)"
              name="Revenue"
            />
            <Bar
              dataKey="reports"
              fill="#3b82f6"
              name="Reports"
              opacity={0.6}
              yAxisId="right"
            />
            <YAxis yAxisId="right" orientation="right" className="text-neutral-600 dark:text-slate-400" style={{ fontSize: "12px" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Revenue by Role & Top Generators */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Revenue by Role */}
        {revenueByRole.length > 0 && (
          <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
            <h3 className={cn("font-semibold text-lg mb-4 flex items-center gap-2", "text-neutral-900 dark:text-slate-200")}>
              <Users className="w-5 h-5 text-blue-500" />
              Revenue by Role
            </h3>
            <div className="space-y-3">
              {revenueByRole.map((item, idx) => {
                const maxRevenue = Math.max(...revenueByRole.map((r) => r.revenue))
                const percentage = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0
                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={cn("text-sm font-medium capitalize", "text-neutral-700 dark:text-slate-300")}>
                        {item.role === "USER" ? "Technician" : item.role === "MANAGER" ? "Manager" : "Admin"}
                      </span>
                      <div className="text-right">
                        <span className={cn("text-sm font-bold", "text-neutral-900 dark:text-slate-200")}>
                          {formatCurrency(item.revenue)}
                        </span>
                        <span className={cn("text-xs ml-2", "text-neutral-600 dark:text-slate-400")}>
                          ({item.reports} reports)
                        </span>
                      </div>
                    </div>
                    <div className={cn("w-full rounded-full h-2 overflow-hidden", "bg-neutral-200 dark:bg-slate-700/30")}>
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-green-500 rounded-full transition-all duration-1000"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Top Revenue Generators */}
        {topGenerators.length > 0 && (
          <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
            <h3 className={cn("font-semibold text-lg mb-4 flex items-center gap-2", "text-neutral-900 dark:text-slate-200")}>
              <Crown className="w-5 h-5 text-amber-500" />
              Top Revenue Generators
            </h3>
            <div className="space-y-3">
              {topGenerators.map((user, idx) => (
                <div
                  key={user.userId}
                  className={cn("flex items-center justify-between p-3 rounded-lg border transition-colors", "bg-neutral-50 dark:bg-slate-700/20", "border-neutral-200 dark:border-slate-600/20", "hover:bg-neutral-100 dark:hover:bg-slate-700/30")}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn("text-sm font-semibold min-w-[2rem]", "text-neutral-600 dark:text-slate-400")}>
                      #{idx + 1}
                    </span>
                    <div>
                      <p className={cn("font-medium", "text-neutral-900 dark:text-slate-200")}>
                        {user.userName}
                      </p>
                      <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>
                        {user.userRole === "USER" ? "Technician" : user.userRole === "MANAGER" ? "Manager" : "Admin"} • {user.reports} reports
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn("font-semibold", "text-emerald-600 dark:text-emerald-400")}>
                      {formatCurrency(user.revenue)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
