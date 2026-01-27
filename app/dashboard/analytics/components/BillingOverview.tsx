"use client"

import { useState, useEffect } from "react"
import { DollarSign, Users, TrendingUp, TrendingDown, AlertTriangle, CreditCard, ArrowUpRight, RefreshCw, ShieldCheck, UserMinus, Clock, Package } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts"
import { cn } from "@/lib/utils"
import toast from "react-hot-toast"

interface BillingData {
  mrr: {
    total: number
    monthly: number
    yearly: number
    formatted: string
  }
  arr: {
    total: number
    formatted: string
  }
  subscriptions: {
    active: number
    trial: number
    canceled: number
    expired: number
    pastDue: number
    total: number
    byPlan: {
      monthly: number
      yearly: number
    }
  }
  metrics: {
    conversionRate: number
    churnRate: number
    trialsExpiringSoon: number
    canceledLast30Days: number
  }
  addonRevenue: {
    thisMonth: number
    previousMonth: number
    change: number
    purchaseCount: number
    formatted: string
  }
  creditUsage: {
    totalUsed: number
    totalRemaining: number
  }
  recentAddons: Array<{
    addonName: string
    amount: number
    currency: string
    purchasedAt: string
    userName: string
  }>
  revenueTrend: Array<{
    month: string
    addonRevenue: number
    purchaseCount: number
    estimatedMRR: number
  }>
  totalUsers: number
}

const STATUS_COLORS = [
  "#22c55e", // active - green
  "#3b82f6", // trial - blue
  "#ef4444", // canceled - red
  "#6b7280", // expired - gray
  "#f59e0b", // past due - amber
]

export default function BillingOverview() {
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchBillingData()
  }, [])

  const fetchBillingData = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/analytics/billing-overview")
      if (!res.ok) {
        if (res.status === 403) {
          setError("Admin access required")
          return
        }
        throw new Error("Failed to load billing data")
      }
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error("Error fetching billing overview:", err)
      setError(err instanceof Error ? err.message : "Failed to load billing data")
      toast.error("Failed to load billing overview")
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className={cn("w-8 h-8 rounded-lg animate-pulse", "bg-neutral-200 dark:bg-slate-700")} />
          <div className={cn("w-48 h-6 rounded animate-pulse", "bg-neutral-200 dark:bg-slate-700")} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={cn("h-28 rounded-xl animate-pulse", "bg-neutral-200 dark:bg-slate-700/50")} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className={cn("p-4 rounded-xl", "bg-red-50 dark:bg-red-500/10", "border border-red-200 dark:border-red-500/30")}>
          <p className={cn("text-sm font-medium", "text-red-700 dark:text-red-400")}>{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const subscriptionPieData = [
    { name: "Active", value: data.subscriptions.active, color: STATUS_COLORS[0] },
    { name: "Trial", value: data.subscriptions.trial, color: STATUS_COLORS[1] },
    { name: "Canceled", value: data.subscriptions.canceled, color: STATUS_COLORS[2] },
    { name: "Expired", value: data.subscriptions.expired, color: STATUS_COLORS[3] },
    { name: "Past Due", value: data.subscriptions.pastDue, color: STATUS_COLORS[4] },
  ].filter(d => d.value > 0)

  const planSplitData = [
    { name: "Monthly", value: data.subscriptions.byPlan.monthly, color: "#3b82f6" },
    { name: "Yearly", value: data.subscriptions.byPlan.yearly, color: "#8b5cf6" },
  ].filter(d => d.value > 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <DollarSign className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h3 className={cn("text-lg font-semibold", "text-neutral-900 dark:text-slate-200")}>
              Revenue & Billing Overview
            </h3>
            <p className={cn("text-xs", "text-neutral-500 dark:text-slate-400")}>
              Subscription health & revenue metrics
            </p>
          </div>
        </div>
        <button
          onClick={fetchBillingData}
          className={cn(
            "p-2 rounded-lg transition-colors",
            "text-neutral-500 dark:text-slate-400",
            "hover:bg-neutral-100 dark:hover:bg-slate-700/50"
          )}
          title="Refresh billing data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* MRR & ARR Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* MRR */}
        <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-xl p-4">
          <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Monthly Recurring Revenue</p>
          <p className="text-2xl font-bold text-emerald-400">{data.mrr.formatted}</p>
          <div className="flex items-center gap-1 mt-1">
            <span className={cn("text-xs", "text-neutral-500 dark:text-slate-500")}>
              {data.subscriptions.byPlan.monthly} monthly, {data.subscriptions.byPlan.yearly} yearly
            </span>
          </div>
        </div>

        {/* ARR */}
        <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-xl p-4">
          <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Annual Recurring Revenue</p>
          <p className="text-2xl font-bold text-blue-400">{data.arr.formatted}</p>
          <div className="flex items-center gap-1 mt-1">
            <span className={cn("text-xs", "text-neutral-500 dark:text-slate-500")}>
              {data.subscriptions.active} active subscribers
            </span>
          </div>
        </div>

        {/* Add-on Revenue */}
        <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-4">
          <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Add-on Revenue (30d)</p>
          <p className="text-2xl font-bold text-purple-400">{data.addonRevenue.formatted}</p>
          <div className="flex items-center gap-1 mt-1">
            {data.addonRevenue.change !== 0 ? (
              <>
                {data.addonRevenue.change > 0 ? (
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-red-400" />
                )}
                <span className={cn("text-xs", data.addonRevenue.change > 0 ? "text-emerald-400" : "text-red-400")}>
                  {data.addonRevenue.change > 0 ? "+" : ""}{data.addonRevenue.change}% vs prev
                </span>
              </>
            ) : (
              <span className={cn("text-xs", "text-neutral-500 dark:text-slate-500")}>
                {data.addonRevenue.purchaseCount} purchases
              </span>
            )}
          </div>
        </div>

        {/* Total Users */}
        <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl p-4">
          <p className={cn("text-xs mb-1", "text-neutral-600 dark:text-slate-400")}>Total Users</p>
          <p className="text-2xl font-bold text-amber-400">{data.totalUsers}</p>
          <div className="flex items-center gap-1 mt-1">
            <span className={cn("text-xs", "text-neutral-500 dark:text-slate-500")}>
              {data.subscriptions.active + data.subscriptions.trial} paying/trial
            </span>
          </div>
        </div>
      </div>

      {/* Health Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Conversion Rate */}
        <div className={cn("flex items-center gap-3 p-3 rounded-xl", "bg-neutral-50 dark:bg-slate-800/30", "border border-neutral-200 dark:border-slate-700/30")}>
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <p className={cn("text-xs", "text-neutral-500 dark:text-slate-400")}>Conversion Rate</p>
            <p className={cn("text-lg font-bold", "text-neutral-900 dark:text-slate-200")}>{data.metrics.conversionRate}%</p>
          </div>
        </div>

        {/* Churn Rate */}
        <div className={cn("flex items-center gap-3 p-3 rounded-xl", "bg-neutral-50 dark:bg-slate-800/30", "border border-neutral-200 dark:border-slate-700/30")}>
          <div className="p-2 rounded-lg bg-red-500/10">
            <UserMinus className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <p className={cn("text-xs", "text-neutral-500 dark:text-slate-400")}>Churn Rate (30d)</p>
            <p className={cn("text-lg font-bold", data.metrics.churnRate > 5 ? "text-red-400" : "text-neutral-900 dark:text-slate-200")}>
              {data.metrics.churnRate}%
            </p>
          </div>
        </div>

        {/* Trials Expiring Soon */}
        <div className={cn("flex items-center gap-3 p-3 rounded-xl", "bg-neutral-50 dark:bg-slate-800/30", "border border-neutral-200 dark:border-slate-700/30")}>
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <p className={cn("text-xs", "text-neutral-500 dark:text-slate-400")}>Trials Expiring (7d)</p>
            <p className={cn("text-lg font-bold", data.metrics.trialsExpiringSoon > 0 ? "text-amber-400" : "text-neutral-900 dark:text-slate-200")}>
              {data.metrics.trialsExpiringSoon}
            </p>
          </div>
        </div>

        {/* Canceled Last 30 Days */}
        <div className={cn("flex items-center gap-3 p-3 rounded-xl", "bg-neutral-50 dark:bg-slate-800/30", "border border-neutral-200 dark:border-slate-700/30")}>
          <div className="p-2 rounded-lg bg-gray-500/10">
            <AlertTriangle className="w-4 h-4 text-gray-500" />
          </div>
          <div>
            <p className={cn("text-xs", "text-neutral-500 dark:text-slate-400")}>Canceled (30d)</p>
            <p className={cn("text-lg font-bold", "text-neutral-900 dark:text-slate-200")}>
              {data.metrics.canceledLast30Days}
            </p>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Subscription Distribution Pie */}
        <div>
          <h4 className={cn("text-sm font-semibold mb-4", "text-neutral-900 dark:text-slate-200")}>
            Subscription Distribution
          </h4>
          {subscriptionPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={subscriptionPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                >
                  {subscriptionPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgb(255 255 255 / 0.95)",
                    border: "1px solid rgb(229 231 235)",
                    borderRadius: "8px",
                    color: "#111827",
                    fontSize: "12px",
                  }}
                  formatter={(value: any, name: string) => [`${value} users`, name]}
                />
                <Legend
                  formatter={(value: string) => (
                    <span className={cn("text-xs", "text-neutral-700 dark:text-slate-300")}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center">
              <p className={cn("text-sm", "text-neutral-500 dark:text-slate-400")}>No subscription data</p>
            </div>
          )}
        </div>

        {/* Plan Split + Credit Usage */}
        <div className="space-y-6">
          {/* Plan Split */}
          <div>
            <h4 className={cn("text-sm font-semibold mb-3", "text-neutral-900 dark:text-slate-200")}>
              Active Plan Breakdown
            </h4>
            <div className="space-y-3">
              {[
                { label: "Monthly Plan", count: data.subscriptions.byPlan.monthly, color: "bg-blue-500", revenue: `$${(data.subscriptions.byPlan.monthly * 99).toLocaleString()}/mo` },
                { label: "Yearly Plan", count: data.subscriptions.byPlan.yearly, color: "bg-purple-500", revenue: `$${(data.subscriptions.byPlan.yearly * 99).toLocaleString()}/mo equiv` },
              ].map((plan) => (
                <div key={plan.label} className={cn("flex items-center justify-between p-3 rounded-lg", "bg-neutral-50 dark:bg-slate-700/30")}>
                  <div className="flex items-center gap-3">
                    <div className={cn("w-3 h-3 rounded-full", plan.color)} />
                    <span className={cn("text-sm font-medium", "text-neutral-700 dark:text-slate-300")}>{plan.label}</span>
                  </div>
                  <div className="text-right">
                    <span className={cn("text-sm font-bold", "text-neutral-900 dark:text-slate-200")}>{plan.count}</span>
                    <p className={cn("text-xs", "text-neutral-500 dark:text-slate-400")}>{plan.revenue}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Credit Usage */}
          <div>
            <h4 className={cn("text-sm font-semibold mb-3", "text-neutral-900 dark:text-slate-200")}>
              Credit Usage (Active Users)
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className={cn("p-3 rounded-lg", "bg-neutral-50 dark:bg-slate-700/30")}>
                <p className={cn("text-xs mb-1", "text-neutral-500 dark:text-slate-400")}>Total Used</p>
                <p className={cn("text-lg font-bold", "text-neutral-900 dark:text-slate-200")}>
                  {data.creditUsage.totalUsed.toLocaleString()}
                </p>
              </div>
              <div className={cn("p-3 rounded-lg", "bg-neutral-50 dark:bg-slate-700/30")}>
                <p className={cn("text-xs mb-1", "text-neutral-500 dark:text-slate-400")}>Remaining</p>
                <p className={cn("text-lg font-bold", "text-neutral-900 dark:text-slate-200")}>
                  {data.creditUsage.totalRemaining.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Add-on Purchases */}
      {data.recentAddons.length > 0 && (
        <div>
          <h4 className={cn("text-sm font-semibold mb-3", "text-neutral-900 dark:text-slate-200")}>
            Recent Add-on Purchases
          </h4>
          <div className="space-y-2">
            {data.recentAddons.slice(0, 5).map((addon, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg",
                  "bg-neutral-50 dark:bg-slate-700/20",
                  "border border-neutral-100 dark:border-slate-700/30"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-purple-500/10">
                    <Package className="w-3.5 h-3.5 text-purple-500" />
                  </div>
                  <div>
                    <p className={cn("text-sm font-medium", "text-neutral-700 dark:text-slate-300")}>{addon.addonName}</p>
                    <p className={cn("text-xs", "text-neutral-500 dark:text-slate-400")}>{addon.userName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-500">
                    ${addon.amount.toFixed(2)} {addon.currency}
                  </p>
                  <p className={cn("text-xs", "text-neutral-500 dark:text-slate-400")}>
                    {new Date(addon.purchasedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
