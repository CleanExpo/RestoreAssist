"use client"

import { useState } from "react"
import { Download, Loader2, ChevronDown } from "lucide-react"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"

export interface AnalyticsFilters {
  dateRange: string
  customFrom?: string
  customTo?: string
  hazardType?: string
  status?: string
}

interface AnalyticsFiltersProps {
  onFiltersChange: (filters: AnalyticsFilters) => void
  isLoading: boolean
  onExport?: (format: "csv" | "excel" | "pdf") => Promise<void>
}

const hazardTypes = [
  { value: "", label: "All Hazard Types" },
  { value: "Water", label: "Water Damage" },
  { value: "Fire", label: "Fire Damage" },
  { value: "Mould", label: "Mould" },
  { value: "Storm", label: "Storm" },
  { value: "Other", label: "Other" },
]

const statuses = [
  { value: "", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "COMPLETED", label: "Completed" },
]

export default function AnalyticsFilters({
  onFiltersChange,
  isLoading,
  onExport,
}: AnalyticsFiltersProps) {
  const [dateRange, setDateRange] = useState("30days")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [hazardType, setHazardType] = useState("")
  const [status, setStatus] = useState("")
  const [exportLoading, setExportLoading] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)

  const handleDateRangeChange = (newRange: string) => {
    setDateRange(newRange)
    onFiltersChange({
      dateRange: newRange,
      customFrom: newRange === "custom" ? customFrom : undefined,
      customTo: newRange === "custom" ? customTo : undefined,
      hazardType: hazardType || undefined,
      status: status || undefined,
    })
  }

  const handleCustomDateChange = () => {
    if (customFrom && customTo) {
      onFiltersChange({
        dateRange: "custom",
        customFrom,
        customTo,
        hazardType: hazardType || undefined,
        status: status || undefined,
      })
    }
  }

  const handleFilterChange = (newHazard?: string, newStatus?: string) => {
    if (newHazard !== undefined) setHazardType(newHazard)
    if (newStatus !== undefined) setStatus(newStatus)

    onFiltersChange({
      dateRange,
      customFrom: dateRange === "custom" ? customFrom : undefined,
      customTo: dateRange === "custom" ? customTo : undefined,
      hazardType: newHazard !== undefined ? (newHazard || undefined) : (hazardType || undefined),
      status: newStatus !== undefined ? (newStatus || undefined) : (status || undefined),
    })
  }

  const handleExport = async (format: "csv" | "excel" | "pdf") => {
    if (!onExport) {
      toast.error("Export not configured")
      return
    }

    try {
      setExportLoading(true)
      await onExport(format)
      toast.success(`Exporting as ${format.toUpperCase()}...`)
      setShowExportMenu(false)
    } catch (error) {
      console.error("Export error:", error)
      toast.error(`Failed to export ${format}`)
    } finally {
      setExportLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header and Quick Export */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={cn("text-3xl font-semibold mb-2", "text-neutral-900 dark:text-slate-200")}>Analytics</h1>
          <p className={cn("text-neutral-600 dark:text-slate-400")}>Business intelligence and performance metrics</p>
        </div>

        {/* Export Button Group */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={exportLoading || isLoading}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50",
              "border border-neutral-300 dark:border-slate-700",
              "bg-white dark:bg-slate-800",
              "hover:bg-neutral-50 dark:hover:bg-slate-700",
              "text-neutral-900 dark:text-slate-200"
            )}
          >
            {exportLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Download size={18} />
            )}
            Export
            <ChevronDown size={16} />
          </button>

          {showExportMenu && (
            <div className={cn(
              "absolute right-0 mt-2 w-48 rounded-lg shadow-lg z-50",
              "bg-white dark:bg-slate-800",
              "border border-neutral-200 dark:border-slate-700"
            )}>
              <button
                onClick={() => handleExport("csv")}
                className={cn(
                  "block w-full text-left px-4 py-2 first:rounded-t-lg",
                  "text-neutral-900 dark:text-slate-200",
                  "hover:bg-neutral-100 dark:hover:bg-slate-700"
                )}
              >
                Export as CSV
              </button>
              <button
                onClick={() => handleExport("excel")}
                className={cn(
                  "block w-full text-left px-4 py-2",
                  "text-neutral-900 dark:text-slate-200",
                  "hover:bg-neutral-100 dark:hover:bg-slate-700"
                )}
              >
                Export as Excel
              </button>
              <button
                onClick={() => handleExport("pdf")}
                className={cn(
                  "block w-full text-left px-4 py-2 last:rounded-b-lg",
                  "text-neutral-900 dark:text-slate-200",
                  "hover:bg-neutral-100 dark:hover:bg-slate-700"
                )}
              >
                Export as PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters Row */}
      <div className={cn(
        "flex flex-wrap gap-4 p-4 rounded-lg border",
        "bg-neutral-50 dark:bg-slate-800/20",
        "border-neutral-200 dark:border-slate-700/50"
      )}>
        {/* Date Range */}
        <div className="flex items-center gap-2">
          <label className={cn("text-sm", "text-neutral-700 dark:text-slate-400")}>Date Range:</label>
          <select
            value={dateRange}
            onChange={(e) => handleDateRangeChange(e.target.value)}
            disabled={isLoading}
            className={cn(
              "px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-cyan-500 disabled:opacity-50",
              "bg-white dark:bg-slate-700",
              "border border-neutral-300 dark:border-slate-600",
              "text-neutral-900 dark:text-slate-200"
            )}
          >
            <option value="7days">Last 7 days</option>
            <option value="14days">Last 14 days</option>
            <option value="30days">Last 30 days</option>
            <option value="90days">Last 90 days</option>
            <option value="ytd">Year to date</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {/* Custom Date Range (shown when custom is selected) */}
        {dateRange === "custom" && (
          <>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                onBlur={handleCustomDateChange}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-cyan-500",
                  "bg-white dark:bg-slate-700",
                  "border border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-slate-200"
                )}
              />
              <span className={cn("text-neutral-600 dark:text-slate-400")}>to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                onBlur={handleCustomDateChange}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-cyan-500",
                  "bg-white dark:bg-slate-700",
                  "border border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-slate-200"
                )}
              />
            </div>
          </>
        )}

        {/* Hazard Type Filter */}
        <div className="flex items-center gap-2">
          <label className={cn("text-sm", "text-neutral-700 dark:text-slate-400")}>Hazard:</label>
          <select
            value={hazardType}
            onChange={(e) => handleFilterChange(e.target.value, undefined)}
            disabled={isLoading}
            className={cn(
              "px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-cyan-500 disabled:opacity-50",
              "bg-white dark:bg-slate-700",
              "border border-neutral-300 dark:border-slate-600",
              "text-neutral-900 dark:text-slate-200"
            )}
          >
            {hazardTypes.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <label className={cn("text-sm", "text-neutral-700 dark:text-slate-400")}>Status:</label>
          <select
            value={status}
            onChange={(e) => handleFilterChange(undefined, e.target.value)}
            disabled={isLoading}
            className={cn(
              "px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-cyan-500 disabled:opacity-50",
              "bg-white dark:bg-slate-700",
              "border border-neutral-300 dark:border-slate-600",
              "text-neutral-900 dark:text-slate-200"
            )}
          >
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Refresh indicator */}
        {isLoading && (
          <div className="flex items-center gap-2 ml-auto">
            <Loader2 size={16} className="animate-spin text-cyan-500" />
            <span className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Updating...</span>
          </div>
        )}
      </div>
    </div>
  )
}
