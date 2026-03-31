"use client"

import React, { useState, useEffect, use } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { ArrowLeft, Loader2, Droplets, Calendar, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"

const DryingProgressChart = dynamic(
  () => import("@/components/inspection/DryingProgressChart"),
  { ssr: false }
)

interface MoistureReading {
  id: string
  location: string
  surfaceType: string
  moistureLevel: number
  depth: string
  notes: string | null
  recordedAt: string
  createdAt: string
}

interface InspectionSummary {
  id: string
  inspectionNumber: string
  propertyAddress: string
  moistureReadings: MoistureReading[]
}

function moistureColour(level: number): string {
  if (level < 15) return "text-emerald-600 dark:text-emerald-400"
  if (level < 25) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

function moistureBg(level: number): string {
  if (level < 15) return "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40"
  if (level < 25) return "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40"
  return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40"
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

/** Group moisture readings by calendar day (using recordedAt or createdAt). */
function groupByDay(readings: MoistureReading[]): Map<string, MoistureReading[]> {
  const map = new Map<string, MoistureReading[]>()
  for (const r of readings) {
    const dateStr = r.recordedAt ?? r.createdAt
    const day = new Date(dateStr).toISOString().slice(0, 10)
    if (!map.has(day)) map.set(day, [])
    map.get(day)!.push(r)
  }
  return map
}

export default function MonitoringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [inspection, setInspection] = useState<InspectionSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const res = await fetch(`/api/inspections/${id}`)
        if (!res.ok) {
          toast.error("Inspection not found")
          router.push("/dashboard/inspections")
          return
        }
        const data = await res.json()
        setInspection(data.inspection)
      } catch {
        toast.error("Failed to load inspection")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-cyan-500" size={32} />
      </div>
    )
  }

  if (!inspection) return null

  const byDay = groupByDay(inspection.moistureReadings)
  const sortedDays = Array.from(byDay.keys()).sort().reverse()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push(`/dashboard/inspections/${id}`)}
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-800 transition-colors mt-0.5"
          aria-label="Back to inspection"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
            Monitoring — {inspection.inspectionNumber}
          </h1>
          <p className="text-sm text-neutral-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
            <MapPin size={13} />
            {inspection.propertyAddress}
          </p>
        </div>
      </div>

      {/* Daily log cards */}
      {sortedDays.length > 0 ? (
        <div className="space-y-4">
          {sortedDays.map((day) => {
            const dayReadings = byDay.get(day)!
            const avg =
              dayReadings.reduce((s, r) => s + r.moistureLevel, 0) / dayReadings.length
            return (
              <div
                key={day}
                className="rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 overflow-hidden"
              >
                {/* Day header */}
                <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 dark:bg-slate-800/50 border-b border-neutral-200 dark:border-slate-700/50">
                  <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-slate-200">
                    <Calendar size={14} className="text-cyan-500" />
                    {formatDate(day)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-400 dark:text-slate-500">
                      {dayReadings.length} reading{dayReadings.length !== 1 ? "s" : ""}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-semibold",
                        moistureBg(avg),
                        moistureColour(avg)
                      )}
                    >
                      avg {avg.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Reading rows */}
                <div className="divide-y divide-neutral-100 dark:divide-slate-800">
                  {dayReadings.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <Droplets
                        size={16}
                        className={cn("flex-shrink-0", moistureColour(r.moistureLevel))}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-neutral-800 dark:text-slate-200 mr-2">
                          {r.location}
                        </span>
                        <span className="text-xs text-neutral-400 dark:text-slate-500 capitalize">
                          {r.surfaceType} · {r.depth}
                        </span>
                        {r.notes && (
                          <p className="text-xs text-neutral-400 dark:text-slate-500 truncate mt-0.5">
                            {r.notes}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-sm font-bold flex-shrink-0",
                          moistureColour(r.moistureLevel)
                        )}
                      >
                        {r.moistureLevel}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-neutral-400 dark:text-slate-500 text-sm">
          No moisture readings recorded yet
        </div>
      )}

      {/* Drying Progress Chart */}
      <div>
        <h2 className="text-base font-semibold text-neutral-900 dark:text-white mb-3">
          Drying Progress Chart
        </h2>
        <DryingProgressChart inspectionId={id} />
      </div>
    </div>
  )
}
