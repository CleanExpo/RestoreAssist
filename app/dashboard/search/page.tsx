"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Search, FileText, Users, ClipboardList, ArrowRight, Loader2 } from "lucide-react"

interface SearchResultItem {
  id: string
  type: "report" | "client" | "inspection"
  title: string
  description?: string
  url: string
  rank?: number
  metadata?: {
    status?: string
    email?: string
    phone?: string
    company?: string
    propertyAddress?: string
    hazardType?: string
    technicianName?: string
  }
}

interface SearchResults {
  query: string
  results: {
    reports: SearchResultItem[]
    clients: SearchResultItem[]
    inspections: SearchResultItem[]
  }
  totalCount: number
}

type FilterType = "all" | "report" | "client" | "inspection"

const TYPE_ICONS: Record<string, React.ElementType> = {
  report: FileText,
  client: Users,
  inspection: ClipboardList,
}

const TYPE_LABELS: Record<string, string> = {
  report: "Report",
  client: "Client",
  inspection: "Inspection",
}

const TYPE_COLORS: Record<string, string> = {
  report: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  client: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  inspection: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null
  const colourMap: Record<string, string> = {
    draft: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
    complete: "bg-green-500/10 text-green-400 border border-green-500/20",
    completed: "bg-green-500/10 text-green-400 border border-green-500/20",
    submitted: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
    pending: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
    "in-progress": "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  }
  const cls = colourMap[status.toLowerCase()] ?? "bg-slate-500/10 text-slate-400 border border-slate-500/20"
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {status}
    </span>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 p-4 border-b border-white/5 animate-pulse">
      <div className="w-9 h-9 rounded-lg bg-white/10 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-white/10 rounded w-1/3" />
        <div className="h-3 bg-white/5 rounded w-1/2" />
      </div>
      <div className="h-5 w-16 bg-white/10 rounded-full" />
      <div className="h-5 w-12 bg-white/5 rounded" />
    </div>
  )
}

function ResultRow({ item }: { item: SearchResultItem }) {
  const Icon = TYPE_ICONS[item.type] ?? FileText
  return (
    <Link
      href={item.url}
      className="flex items-center gap-4 p-4 border-b border-white/5 hover:bg-white/5 transition-colors group"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${TYPE_COLORS[item.type]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{item.title}</p>
        {item.description && (
          <p className="text-xs text-slate-400 truncate mt-0.5">{item.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[item.type]}`}>
          {TYPE_LABELS[item.type]}
        </span>
        {item.metadata?.status && <StatusBadge status={item.metadata.status} />}
      </div>
      <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors flex-shrink-0" />
    </Link>
  )
}

const TABS: { label: string; value: FilterType }[] = [
  { label: "All", value: "all" },
  { label: "Reports", value: "report" },
  { label: "Clients", value: "client" },
  { label: "Inspections", value: "inspection" },
]

function SearchPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialQuery = searchParams.get("q") ?? ""
  const initialType = (searchParams.get("type") as FilterType) ?? "all"

  const [inputValue, setInputValue] = useState(initialQuery)
  const [activeType, setActiveType] = useState<FilterType>(initialType)
  const [data, setData] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync input when URL changes (e.g. browser back/forward)
  useEffect(() => {
    setInputValue(searchParams.get("q") ?? "")
    setActiveType((searchParams.get("type") as FilterType) ?? "all")
  }, [searchParams])

  const fetchResults = useCallback(async (q: string, type: FilterType) => {
    if (!q || q.length < 2) {
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ q, limit: "30" })
      if (type !== "all") params.set("type", type)
      const res = await fetch(`/api/search?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const json: SearchResults = await res.json()
      setData(json)
    } catch (err: any) {
      setError(err.message ?? "Search failed")
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced fetch when URL params change
  useEffect(() => {
    const q = searchParams.get("q") ?? ""
    const type = (searchParams.get("type") as FilterType) ?? "all"
    if (!q || q.length < 2) {
      setData(null)
      return
    }
    const timer = setTimeout(() => {
      fetchResults(q, type)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchParams, fetchResults])

  const pushUrl = (q: string, type: FilterType) => {
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (type !== "all") params.set("type", type)
    const qs = params.toString()
    router.push(`/dashboard/search${qs ? `?${qs}` : ""}`)
  }

  const handleInputChange = (val: string) => {
    setInputValue(val)
    pushUrl(val, activeType)
  }

  const handleTabChange = (type: FilterType) => {
    setActiveType(type)
    pushUrl(inputValue, type)
  }

  // Flatten or group results depending on active filter
  const flatResults: SearchResultItem[] = (() => {
    if (!data) return []
    if (activeType === "all") {
      return [
        ...data.results.reports,
        ...data.results.clients,
        ...data.results.inspections,
      ].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    }
    if (activeType === "report") return data.results.reports
    if (activeType === "client") return data.results.clients
    if (activeType === "inspection") return data.results.inspections
    return []
  })()

  const currentQuery = searchParams.get("q") ?? ""

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">Search</h1>
          <p className="text-slate-400 text-sm">Find reports, clients, and inspections</p>
        </div>

        {/* Search input */}
        <div className="relative mb-6">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Search reports, clients, inspections..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
            autoFocus
          />
          {loading && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
          )}
        </div>

        {/* Type filter tabs */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-lg p-1 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeType === tab.value
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Result count */}
        {data && currentQuery && !loading && (
          <p className="text-sm text-slate-400 mb-4">
            Showing <span className="text-white font-medium">{flatResults.length}</span> result{flatResults.length !== 1 ? "s" : ""} for{" "}
            <span className="text-white font-medium">"{currentQuery}"</span>
          </p>
        )}

        {/* Results panel */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
          {/* Loading skeleton */}
          {loading && (
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <Search className="w-5 h-5 text-red-400" />
              </div>
              <p className="text-sm font-medium text-white mb-1">Search error</p>
              <p className="text-xs text-slate-400">{error}</p>
            </div>
          )}

          {/* No query state */}
          {!loading && !error && !currentQuery && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Search className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-white mb-1">Start searching</p>
              <p className="text-xs text-slate-400">Enter a search term above to find reports, clients, and inspections</p>
            </div>
          )}

          {/* Empty results state */}
          {!loading && !error && currentQuery && data && flatResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Search className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-white mb-1">No results found</p>
              <p className="text-xs text-slate-400">
                No results for "<span className="text-white">{currentQuery}</span>"
              </p>
            </div>
          )}

          {/* Query too short */}
          {!loading && !error && currentQuery && currentQuery.length < 2 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Search className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-white mb-1">Keep typing</p>
              <p className="text-xs text-slate-400">Search requires at least 2 characters</p>
            </div>
          )}

          {/* Results */}
          {!loading && !error && flatResults.length > 0 && (
            <div>
              {flatResults.map((item) => (
                <ResultRow key={`${item.type}-${item.id}`} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      }
    >
      <SearchPageInner />
    </Suspense>
  )
}
