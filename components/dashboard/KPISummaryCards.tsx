"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ClipboardCheck,
  Droplets,
  Wrench,
  CheckCircle2,
  PlusCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────

interface KPIStat {
  value: number
  delta: string | null
  label: string
  sublabel: string
  href: string
}

interface DashboardStats {
  activeInspections: KPIStat
  moistureReadings7d: KPIStat
  equipmentItems: KPIStat
  completedThisMonth: KPIStat
  createdToday: KPIStat
}

// ── Individual Card ───────────────────────────────────────────────

interface CardDef {
  key: keyof DashboardStats
  icon: React.ReactNode
  gradient: string
  iconBg: string
}

const CARDS: CardDef[] = [
  {
    key: "activeInspections",
    icon: <ClipboardCheck size={20} />,
    gradient: "from-blue-500 to-cyan-500",
    iconBg: "bg-blue-500/10 text-blue-500 dark:text-blue-400",
  },
  {
    key: "moistureReadings7d",
    icon: <Droplets size={20} />,
    gradient: "from-cyan-500 to-teal-500",
    iconBg: "bg-cyan-500/10 text-cyan-500 dark:text-cyan-400",
  },
  {
    key: "equipmentItems",
    icon: <Wrench size={20} />,
    gradient: "from-violet-500 to-purple-500",
    iconBg: "bg-violet-500/10 text-violet-500 dark:text-violet-400",
  },
  {
    key: "completedThisMonth",
    icon: <CheckCircle2 size={20} />,
    gradient: "from-emerald-500 to-green-500",
    iconBg: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400",
  },
  {
    key: "createdToday",
    icon: <PlusCircle size={20} />,
    gradient: "from-amber-500 to-orange-500",
    iconBg: "bg-amber-500/10 text-amber-500 dark:text-amber-400",
  },
]

function DeltaBadge({ delta }: { delta: string | null }) {
  if (!delta) return null
  const positive = delta.startsWith("+")
  const neutral = delta === "0%" || delta === "+0%"

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        neutral
          ? "text-neutral-400 dark:text-slate-500"
          : positive
          ? "text-emerald-500 dark:text-emerald-400"
          : "text-rose-500 dark:text-rose-400"
      )}
    >
      {neutral ? (
        <Minus size={12} />
      ) : positive ? (
        <TrendingUp size={12} />
      ) : (
        <TrendingDown size={12} />
      )}
      {delta}
    </span>
  )
}

function SkeletonCard() {
  return (
    <div className="p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-4 bg-neutral-200 dark:bg-slate-700 rounded w-28" />
        <div className="h-8 w-8 bg-neutral-200 dark:bg-slate-700 rounded-lg" />
      </div>
      <div className="h-8 bg-neutral-200 dark:bg-slate-700 rounded w-16 mb-1" />
      <div className="h-3 bg-neutral-200 dark:bg-slate-700 rounded w-20" />
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────

export default function KPISummaryCards() {
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch("/api/dashboard/stats")
        if (!res.ok) throw new Error("stats fetch failed")
        const data = await res.json()
        if (!cancelled) setStats(data)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {CARDS.map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  if (error || !stats) {
    return null // Fail silently — dashboard is still usable without KPIs
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {CARDS.map(({ key, icon, gradient, iconBg }) => {
        const stat = stats[key]
        return (
          <button
            key={key}
            onClick={() => router.push(stat.href)}
            className={cn(
              "relative text-left p-4 rounded-xl border overflow-hidden group transition-all duration-200",
              "border-neutral-200 dark:border-slate-700/50",
              "bg-white dark:bg-slate-900/50",
              "hover:border-transparent hover:shadow-lg hover:scale-[1.02] active:scale-[0.99]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            )}
          >
            {/* Hover gradient overlay */}
            <div
              className={cn(
                `absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-[0.08] transition-opacity duration-200`
              )}
            />

            <div className="relative z-10">
              {/* Icon + delta row */}
              <div className="flex items-center justify-between mb-3">
                <div className={cn("p-1.5 rounded-lg", iconBg)}>
                  {icon}
                </div>
                <DeltaBadge delta={stat.delta} />
              </div>

              {/* Value */}
              <p className="text-2xl font-bold text-neutral-900 dark:text-white tabular-nums">
                {stat.value.toLocaleString()}
              </p>

              {/* Label */}
              <p className="text-xs font-medium text-neutral-700 dark:text-slate-300 mt-0.5 leading-tight">
                {stat.label}
              </p>

              {/* Sublabel */}
              <p className="text-[11px] text-neutral-400 dark:text-slate-500 mt-0.5">
                {stat.sublabel}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
