"use client"

/**
 * InspectionFilters
 *
 * Filter bar for the inspections list page.
 * All filter state is URL-param driven — shareable/bookmarkable links.
 *
 * Supported params:
 *   search   — text search (address, inspection number, technician)
 *   status   — DRAFT | SUBMITTED | PROCESSING | CLASSIFIED | SCOPED | ESTIMATED | COMPLETED | REJECTED | active
 *   category — 1 | 2 | 3 | 4
 *   from     — ISO date (createdAt ≥)
 *   to       — ISO date (createdAt ≤)
 *   sort     — recent | oldest | address
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import {
  Search,
  X,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────

export interface FilterState {
  search: string
  status: string
  category: string
  from: string
  to: string
  sort: string
}

export function parseFilters(searchParams: URLSearchParams): FilterState {
  return {
    search:   searchParams.get("search")   ?? "",
    status:   searchParams.get("status")   ?? "",
    category: searchParams.get("category") ?? "",
    from:     searchParams.get("from")     ?? "",
    to:       searchParams.get("to")       ?? "",
    sort:     searchParams.get("sort")     ?? "recent",
  }
}

const STATUS_OPTIONS = [
  { value: "",          label: "All statuses" },
  { value: "active",    label: "Active (not completed)" },
  { value: "DRAFT",     label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "PROCESSING",label: "Processing" },
  { value: "CLASSIFIED",label: "Classified" },
  { value: "SCOPED",    label: "Scoped" },
  { value: "ESTIMATED", label: "Estimated" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REJECTED",  label: "Rejected" },
]

const CATEGORY_OPTIONS = [
  { value: "",  label: "All categories" },
  { value: "1", label: "Category 1" },
  { value: "2", label: "Category 2" },
  { value: "3", label: "Category 3" },
  { value: "4", label: "Category 4" },
]

const SORT_OPTIONS = [
  { value: "recent",  label: "Most recent" },
  { value: "oldest",  label: "Oldest first" },
  { value: "address", label: "Address A–Z" },
]

// ── Hook ──────────────────────────────────────────────────────────

export function useInspectionFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const filters = parseFilters(searchParams)

  // Local search input state — debounced 300ms before pushing to URL
  const [searchInput, setSearchInput] = useState(filters.search)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep local input in sync when the URL search param changes externally (e.g. clear-all)
  useEffect(() => {
    setSearchInput(filters.search)
  }, [filters.search])

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString())
        if (value) {
          params.set("search", value)
        } else {
          params.delete("search")
        }
        params.delete("page")
        startTransition(() => {
          router.push(`${pathname}?${params.toString()}`, { scroll: false })
        })
      }, 300)
    },
    [router, pathname, searchParams]
  )

  const setFilter = useCallback(
    (key: keyof FilterState, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      // Reset to page 1 when filter changes
      params.delete("page")
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
      })
    },
    [router, pathname, searchParams]
  )

  const clearAll = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    startTransition(() => {
      router.push(pathname, { scroll: false })
    })
  }, [router, pathname])

  const activeCount = [
    filters.search,
    filters.status,
    filters.category,
    filters.from,
    filters.to,
  ].filter(Boolean).length

  return { filters, searchInput, handleSearchChange, setFilter, clearAll, activeCount, isPending }
}

// ── Component ─────────────────────────────────────────────────────

interface InspectionFiltersProps {
  className?: string
}

export default function InspectionFilters({ className }: InspectionFiltersProps) {
  const { filters, searchInput, handleSearchChange, setFilter, clearAll, activeCount, isPending } = useInspectionFilters()

  return (
    <div className={cn("space-y-3", className)}>
      {/* Row 1: search + active count badge */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
          />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search address, inspection #, or technician…"
            className={cn(
              "w-full pl-9 pr-3 py-2.5 rounded-lg text-sm",
              "border border-neutral-200 dark:border-slate-700",
              "bg-white dark:bg-slate-900",
              "text-neutral-900 dark:text-white placeholder:text-neutral-400",
              "focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all"
            )}
          />
        </div>

        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0",
              "bg-neutral-100 dark:bg-slate-800 text-neutral-600 dark:text-slate-400",
              "hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400"
            )}
          >
            <X size={13} />
            Clear ({activeCount})
          </button>
        )}
      </div>

      {/* Row 2: status + category + dates + sort */}
      <div className="flex flex-wrap gap-2">
        {/* Status */}
        <div className="relative">
          <select
            value={filters.status}
            onChange={(e) => setFilter("status", e.target.value)}
            className={cn(
              "appearance-none pl-3 pr-8 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors",
              "border focus:outline-none focus:ring-2 focus:ring-cyan-500/50",
              filters.status
                ? "border-cyan-400 dark:border-cyan-600 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400"
                : "border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-neutral-600 dark:text-slate-400"
            )}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-60" />
        </div>

        {/* Damage category */}
        <div className="relative">
          <select
            value={filters.category}
            onChange={(e) => setFilter("category", e.target.value)}
            className={cn(
              "appearance-none pl-3 pr-8 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors",
              "border focus:outline-none focus:ring-2 focus:ring-cyan-500/50",
              filters.category
                ? "border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                : "border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-neutral-600 dark:text-slate-400"
            )}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-60" />
        </div>

        {/* Date from */}
        <div className="relative flex items-center">
          <label className="text-xs text-neutral-400 dark:text-slate-500 mr-1.5 flex-shrink-0">From</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilter("from", e.target.value)}
            className={cn(
              "pl-2 pr-2 py-2 rounded-lg text-xs cursor-pointer transition-colors",
              "border focus:outline-none focus:ring-2 focus:ring-cyan-500/50",
              filters.from
                ? "border-cyan-400 dark:border-cyan-600 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400"
                : "border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-neutral-600 dark:text-slate-400"
            )}
          />
        </div>

        {/* Date to */}
        <div className="relative flex items-center">
          <label className="text-xs text-neutral-400 dark:text-slate-500 mr-1.5 flex-shrink-0">To</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilter("to", e.target.value)}
            className={cn(
              "pl-2 pr-2 py-2 rounded-lg text-xs cursor-pointer transition-colors",
              "border focus:outline-none focus:ring-2 focus:ring-cyan-500/50",
              filters.to
                ? "border-cyan-400 dark:border-cyan-600 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400"
                : "border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-neutral-600 dark:text-slate-400"
            )}
          />
        </div>

        {/* Sort */}
        <div className="relative ml-auto">
          <select
            value={filters.sort}
            onChange={(e) => setFilter("sort", e.target.value)}
            className={cn(
              "appearance-none pl-3 pr-8 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors",
              "border focus:outline-none focus:ring-2 focus:ring-cyan-500/50",
              "border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-neutral-600 dark:text-slate-400"
            )}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-60" />
        </div>
      </div>

      {/* Loading indicator */}
      {isPending && (
        <div className="flex items-center gap-2 text-xs text-neutral-400 dark:text-slate-500">
          <div className="w-3 h-3 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin" />
          Filtering…
        </div>
      )}
    </div>
  )
}
