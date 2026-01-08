"use client"

import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface KPIData {
  totalReports: {
    value: number
    change: string
  }
  totalRevenue: {
    value: number
    formatted: string
    change: string
  }
  avgReportValue: {
    value: number
    formatted: string
    change: string
  }
  avgCompletion: {
    value: string
    formatted: string
    change: string
  }
  completionRate?: {
    value: number
    formatted: string
    change: string
  }
  revenueGrowth?: {
    value: number
    formatted: string
    change: string
  }
}

interface KPICardsProps {
  data: KPIData | null
  loading?: boolean
}

function TrendIcon({
  change,
}: {
  change: string
}): React.ReactNode {
  if (change.startsWith("+")) {
    return <TrendingUp size={16} className="text-emerald-400" />
  } else if (change.startsWith("-")) {
    return <TrendingDown size={16} className="text-red-400" />
  }
  return <Minus size={16} className="text-slate-400" />
}

function getTrendColor(
  change: string
): string {
  if (change.startsWith("+") || change === "0%") {
    return "text-emerald-400"
  }
  return "text-red-400"
}

export default function KPICards({ data, loading = false }: KPICardsProps) {
  const defaultData: KPIData = {
    totalReports: { value: 0, change: "0%" },
    totalRevenue: { value: 0, formatted: "$0", change: "0%" },
    avgReportValue: { value: 0, formatted: "$0", change: "0%" },
    avgCompletion: { value: "0", formatted: "0 hrs", change: "0%" },
  }

  const kpis = data || defaultData

  const cards = [
    {
      label: "Total Reports",
      value: kpis.totalReports.value.toString(),
      change: kpis.totalReports.change,
      color: "from-blue-500 to-cyan-500",
      icon: "📊",
    },
    {
      label: "Total Revenue",
      value: kpis.totalRevenue.formatted,
      change: kpis.totalRevenue.change,
      color: "from-emerald-500 to-teal-500",
      icon: "💰",
    },
    {
      label: "Avg Report Value",
      value: kpis.avgReportValue.formatted,
      change: kpis.avgReportValue.change,
      color: "from-purple-500 to-pink-500",
      icon: "📈",
    },
    {
      label: "Avg Completion",
      value: kpis.avgCompletion.formatted,
      change: kpis.avgCompletion.change,
      color: "from-orange-500 to-red-500",
      icon: "⏱️",
    },
  ]

  if (loading) {
    return (
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 animate-pulse"
          >
            <div className="h-4 bg-slate-700 rounded w-1/2 mb-3" />
            <div className="h-8 bg-slate-700 rounded w-3/4" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <div
          key={i}
          className="relative p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden group hover:border-slate-600/75 transition-colors"
        >
          {/* Gradient background */}
          <div
            className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-gradient-to-br ${card.color}`}
          />

          <div className="relative z-10">
            {/* Header with label and icon */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-400 text-sm font-medium">{card.label}</p>
              <span className="text-xl">{card.icon}</span>
            </div>

            {/* Value and trend */}
            <div className="flex items-end justify-between">
              <p className="text-2xl lg:text-3xl font-semibold">{card.value}</p>
              <div className="flex items-center gap-1">
                <TrendIcon change={card.change} />
                <span className={`text-xs font-medium ${getTrendColor(card.change)}`}>
                  {card.change}
                </span>
              </div>
            </div>

            {/* Optional insight text */}
            {card.change !== "0%" && (
              <p className="mt-2 text-xs text-slate-400">
                {card.change.startsWith("+")
                  ? "Trending up"
                  : card.change.startsWith("-")
                    ? "Trending down"
                    : "No change"}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
