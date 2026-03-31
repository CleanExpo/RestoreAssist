"use client"

import { useEffect, useState } from "react"
import { Activity, Droplets, DollarSign, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

interface DashboardStats {
  activeJobs: number
  avgDryingDays: number
  revenueMtdAud: number
  completionRatePct: number
}

interface KpiCardProps {
  label: string
  value: string
  sublabel: string
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  colour: string
}

function KpiCard({ label, value, sublabel, icon: Icon, colour }: KpiCardProps) {
  return (
    <Card className="border border-neutral-200 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-neutral-600 dark:text-slate-400">
          {label}
        </CardTitle>
        <Icon size={20} style={{ color: colour }} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" style={{ color: colour }}>
          {value}
        </div>
        <p className="text-xs text-neutral-500 dark:text-slate-500 mt-1">{sublabel}</p>
      </CardContent>
    </Card>
  )
}

function KpiCardSkeleton() {
  return (
    <Card className="border border-neutral-200 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-5 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 mb-2" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  )
}

export default function KpiPanel() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/analytics/dashboard-stats")
        if (res.ok) {
          const data = (await res.json()) as DashboardStats
          setStats(data)
        } else {
          setStats({ activeJobs: 0, avgDryingDays: 0, revenueMtdAud: 0, completionRatePct: 0 })
        }
      } catch {
        setStats({ activeJobs: 0, avgDryingDays: 0, revenueMtdAud: 0, completionRatePct: 0 })
      } finally {
        setLoading(false)
      }
    }

    void fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
      </div>
    )
  }

  const s = stats ?? { activeJobs: 0, avgDryingDays: 0, revenueMtdAud: 0, completionRatePct: 0 }

  const cards: KpiCardProps[] = [
    {
      label: "Active Jobs",
      value: String(s.activeJobs),
      sublabel: "Jobs in progress",
      icon: Activity,
      colour: "#3B82F6",
    },
    {
      label: "Avg Drying Days",
      value: `${s.avgDryingDays.toFixed(1)}d`,
      sublabel: "Avg resolution time (30d)",
      icon: Droplets,
      colour: "#0EA5E9",
    },
    {
      label: "Revenue MTD",
      value: `$${s.revenueMtdAud.toLocaleString("en-AU")}`,
      sublabel: "Revenue this month",
      icon: DollarSign,
      colour: "#10B981",
    },
    {
      label: "Completion Rate",
      value: `${s.completionRatePct.toFixed(0)}%`,
      sublabel: "Job completion rate (30d)",
      icon: CheckCircle2,
      colour: "#8B5CF6",
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  )
}
