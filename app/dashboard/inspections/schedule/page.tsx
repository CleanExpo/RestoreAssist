"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, CalendarDays, List } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Inspection {
  id: string
  inspectionNumber: string
  propertyAddress: string
  propertyPostcode: string
  status: string
  createdAt: string
}

// ─── Status colour config (matches list page) ─────────────────────────────────

const STATUS_CHIP: Record<string, { label: string; bg: string; text: string }> = {
  DRAFT:      { label: "Draft",      bg: "bg-neutral-200 dark:bg-slate-700",      text: "text-neutral-600 dark:text-slate-300" },
  SUBMITTED:  { label: "Submitted",  bg: "bg-blue-100 dark:bg-blue-900/40",       text: "text-blue-700 dark:text-blue-300" },
  PROCESSING: { label: "Processing", bg: "bg-amber-100 dark:bg-amber-900/40",     text: "text-amber-700 dark:text-amber-300" },
  CLASSIFIED: { label: "Classified", bg: "bg-purple-100 dark:bg-purple-900/40",   text: "text-purple-700 dark:text-purple-300" },
  SCOPED:     { label: "Scoped",     bg: "bg-indigo-100 dark:bg-indigo-900/40",   text: "text-indigo-700 dark:text-indigo-300" },
  ESTIMATED:  { label: "Estimated",  bg: "bg-teal-100 dark:bg-teal-900/40",       text: "text-teal-700 dark:text-teal-300" },
  COMPLETED:  { label: "Completed",  bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
  REJECTED:   { label: "Rejected",   bg: "bg-red-100 dark:bg-red-900/40",         text: "text-red-700 dark:text-red-300" },
}

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

// ─── Calendar helpers ─────────────────────────────────────────────────────────

/** Returns the Date for the Monday that starts the calendar grid for the given month/year. */
function getGridStart(year: number, month: number): Date {
  // month is 0-indexed (JS)
  const firstOfMonth = new Date(year, month, 1)
  // getDay(): 0=Sun,1=Mon,...,6=Sat  →  offset to Monday start
  const dayOfWeek = firstOfMonth.getDay() // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const gridStart = new Date(year, month, 1 + mondayOffset)
  return gridStart
}

/** Returns all 42 Date cells (6 rows × 7 cols) for a month grid. */
function buildCalendarCells(year: number, month: number): Date[] {
  const start = getGridStart(year, month)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="border border-neutral-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* header row */}
      <div className="grid grid-cols-7 border-b border-neutral-200 dark:border-slate-700">
        {DAY_HEADERS.map((h) => (
          <div key={h} className="py-2 text-center text-xs font-semibold text-neutral-400 dark:text-slate-500">
            {h}
          </div>
        ))}
      </div>
      {/* 6 skeleton rows */}
      {Array.from({ length: 6 }).map((_, row) => (
        <div key={row} className="grid grid-cols-7 border-b border-neutral-200 dark:border-slate-700 last:border-0">
          {Array.from({ length: 7 }).map((_, col) => (
            <div
              key={col}
              className="min-h-[100px] p-2 border-r border-neutral-100 dark:border-slate-800 last:border-0"
            >
              <Skeleton className="h-4 w-5 mb-2 ml-auto" />
              <Skeleton className="h-5 w-full mb-1 rounded" />
              <Skeleton className="h-5 w-3/4 rounded" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

interface InspectionChipProps {
  inspection: Inspection
  onClick: () => void
}

function InspectionChip({ inspection, onClick }: InspectionChipProps) {
  const cfg = STATUS_CHIP[inspection.status] ?? STATUS_CHIP.DRAFT
  const truncatedAddress =
    inspection.propertyAddress.length > 20
      ? inspection.propertyAddress.slice(0, 20) + "…"
      : inspection.propertyAddress

  return (
    <button
      onClick={onClick}
      title={`${inspection.inspectionNumber} — ${inspection.propertyAddress}`}
      className={cn(
        "w-full text-left text-[11px] font-medium px-1.5 py-0.5 rounded truncate leading-tight transition-opacity hover:opacity-80",
        cfg.bg,
        cfg.text,
      )}
    >
      {truncatedAddress}
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InspectionSchedulePage() {
  const router = useRouter()
  const today = new Date()

  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()) // 0-indexed
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch all inspections once; filter client-side (API has no date range params)
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch("/api/inspections?limit=100")
        if (res.ok) {
          const data = await res.json()
          setInspections(data.inspections ?? [])
        }
      } catch (err) {
        console.error("[Schedule] Failed to fetch inspections:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Group inspections by their createdAt date key
  const inspectionsByDay = useMemo(() => {
    const map = new Map<string, Inspection[]>()
    for (const insp of inspections) {
      const d = new Date(insp.createdAt)
      const key = toDateKey(d)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(insp)
    }
    return map
  }, [inspections])

  // Calendar cells for the current month view
  const cells = useMemo(() => buildCalendarCells(currentYear, currentMonth), [currentYear, currentMonth])

  // Inspections in the currently displayed month (for empty state message)
  const monthHasInspections = useMemo(() => {
    return cells.some((cell) => {
      if (cell.getMonth() !== currentMonth) return false
      return (inspectionsByDay.get(toDateKey(cell))?.length ?? 0) > 0
    })
  }, [cells, currentMonth, inspectionsByDay])

  const goToPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear((y) => y - 1)
    } else {
      setCurrentMonth((m) => m - 1)
    }
  }

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear((y) => y + 1)
    } else {
      setCurrentMonth((m) => m + 1)
    }
  }

  const goToToday = () => {
    setCurrentYear(today.getFullYear())
    setCurrentMonth(today.getMonth())
  }

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="text-cyan-500" size={26} />
            Inspection Schedule
          </h1>
          <p className="text-sm text-neutral-500 dark:text-slate-400 mt-1">
            Monthly calendar view of all National Inspection Reports
          </p>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-neutral-200 dark:border-slate-700 overflow-hidden text-sm">
            {/* Calendar — active */}
            <span
              className="flex items-center gap-1.5 px-3 py-2 bg-cyan-500 text-white font-medium cursor-default"
              aria-current="page"
            >
              <CalendarDays size={14} />
              Calendar
            </span>
            {/* List — link */}
            <button
              onClick={() => router.push("/dashboard/inspections")}
              className="flex items-center gap-1.5 px-3 py-2 text-neutral-600 dark:text-slate-300 hover:bg-neutral-50 dark:hover:bg-slate-800 transition-colors"
            >
              <List size={14} />
              List
            </button>
          </div>
        </div>
      </div>

      {/* ── Month navigation ── */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={goToPrevMonth} aria-label="Previous month">
          <ChevronLeft size={16} />
        </Button>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white min-w-[160px] text-center">
          {MONTH_NAMES[currentMonth]} {currentYear}
        </h2>

        <Button variant="outline" size="icon" onClick={goToNextMonth} aria-label="Next month">
          <ChevronRight size={16} />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={goToToday}
          className="ml-1 text-xs"
        >
          Today
        </Button>
      </div>

      {/* ── Calendar grid ── */}
      {loading ? (
        <SkeletonGrid />
      ) : (
        <>
          <div className="border border-neutral-200 dark:border-slate-700 rounded-xl overflow-hidden select-none">
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 bg-neutral-50 dark:bg-slate-800/60 border-b border-neutral-200 dark:border-slate-700">
              {DAY_HEADERS.map((h) => (
                <div
                  key={h}
                  className="py-2.5 text-center text-xs font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wide"
                >
                  {h}
                </div>
              ))}
            </div>

            {/* 6 rows × 7 cols */}
            {Array.from({ length: 6 }).map((_, rowIdx) => (
              <div
                key={rowIdx}
                className="grid grid-cols-7 border-b border-neutral-200 dark:border-slate-700 last:border-0"
              >
                {cells.slice(rowIdx * 7, rowIdx * 7 + 7).map((cell, colIdx) => {
                  const isCurrentMonth = cell.getMonth() === currentMonth
                  const isToday = isSameDay(cell, today)
                  const dayKey = toDateKey(cell)
                  const dayInspections = inspectionsByDay.get(dayKey) ?? []
                  const visibleChips = dayInspections.slice(0, 3)
                  const overflowCount = dayInspections.length - visibleChips.length

                  return (
                    <div
                      key={colIdx}
                      className={cn(
                        "min-h-[100px] p-1.5 border-r border-neutral-100 dark:border-slate-800 last:border-0 flex flex-col gap-1",
                        !isCurrentMonth && "bg-neutral-50/70 dark:bg-slate-900/30",
                        isToday && "ring-2 ring-inset ring-cyan-400 dark:ring-cyan-500",
                      )}
                    >
                      {/* Day number */}
                      <span
                        className={cn(
                          "text-xs font-semibold self-end leading-none px-1 py-0.5 rounded-full",
                          isToday
                            ? "bg-cyan-500 text-white"
                            : isCurrentMonth
                              ? "text-neutral-700 dark:text-slate-200"
                              : "text-neutral-300 dark:text-slate-600",
                        )}
                      >
                        {cell.getDate()}
                      </span>

                      {/* Inspection chips */}
                      {visibleChips.map((insp) => (
                        <InspectionChip
                          key={insp.id}
                          inspection={insp}
                          onClick={() => router.push(`/dashboard/inspections/${insp.id}`)}
                        />
                      ))}

                      {/* Overflow count */}
                      {overflowCount > 0 && (
                        <span className="text-[10px] font-medium text-neutral-400 dark:text-slate-500 px-1">
                          +{overflowCount} more
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Empty month message */}
          {!monthHasInspections && (
            <p className="text-center text-sm text-neutral-400 dark:text-slate-500 py-4">
              No inspections scheduled for {MONTH_NAMES[currentMonth]} {currentYear}
            </p>
          )}
        </>
      )}

      {/* ── Status legend ── */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <span className="text-xs font-medium text-neutral-400 dark:text-slate-500 uppercase tracking-wide">
          Legend
        </span>
        {Object.entries(STATUS_CHIP).map(([key, cfg]) => (
          <Badge
            key={key}
            className={cn("text-[10px] font-medium border-0 px-2 py-0.5", cfg.bg, cfg.text)}
          >
            {cfg.label}
          </Badge>
        ))}
      </div>
    </div>
  )
}
