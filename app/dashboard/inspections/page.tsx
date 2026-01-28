"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import {
  Plus,
  Search,
  ClipboardCheck,
  MapPin,
  Calendar,
  ChevronRight,
  Loader2,
  Droplets,
  Thermometer,
  Camera,
  AlertTriangle,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Inspection {
  id: string
  inspectionNumber: string
  propertyAddress: string
  propertyPostcode: string
  technicianName: string | null
  status: string
  createdAt: string
  submittedAt: string | null
  processedAt: string | null
  moistureReadings: { id: string }[]
  affectedAreas: { id: string }[]
  environmentalData: { ambientTemperature: number; humidityLevel: number } | null
  classifications: { category: string; class: string }[]
  photos: { id: string }[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: "Draft", color: "text-neutral-600 dark:text-slate-400", bg: "bg-neutral-100 dark:bg-slate-800" },
  SUBMITTED: { label: "Submitted", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30" },
  PROCESSING: { label: "Processing", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/30" },
  CLASSIFIED: { label: "Classified", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/30" },
  SCOPED: { label: "Scoped", color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/30" },
  ESTIMATED: { label: "Estimated", color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-900/30" },
  COMPLETED: { label: "Completed", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
  REJECTED: { label: "Rejected", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/30" },
}

export default function InspectionsPage() {
  const router = useRouter()
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchInspections()
  }, [])

  const fetchInspections = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/inspections")
      if (response.ok) {
        const data = await response.json()
        setInspections(data.inspections || [])
      } else {
        toast.error("Failed to fetch inspections")
      }
    } catch (error) {
      console.error("Error fetching inspections:", error)
      toast.error("Failed to fetch inspections")
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    return inspections.filter((insp) => {
      const matchesSearch =
        !searchTerm ||
        insp.inspectionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        insp.propertyAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (insp.technicianName?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
      const matchesStatus = !statusFilter || insp.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [inspections, searchTerm, statusFilter])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    inspections.forEach((i) => {
      counts[i.status] = (counts[i.status] || 0) + 1
    })
    return counts
  }, [inspections])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((i) => i.id)))
    }
  }

  const handleDeleteOne = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm("Delete this inspection? This cannot be undone.")) return
    try {
      setDeleting(true)
      const res = await fetch(`/api/inspections/${id}`, { method: "DELETE" })
      if (res.ok) {
        setInspections((prev) => prev.filter((i) => i.id !== id))
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        toast.success("Inspection deleted")
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Failed to delete inspection")
      }
    } catch {
      toast.error("Failed to delete inspection")
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} inspection(s)? This cannot be undone.`)) return
    try {
      setDeleting(true)
      const res = await fetch("/api/inspections/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setInspections((prev) => prev.filter((i) => !selectedIds.has(i.id)))
        setSelectedIds(new Set())
        toast.success(`${data.deletedCount ?? selectedIds.size} inspection(s) deleted`)
      } else {
        toast.error(data.error || "Failed to delete inspections")
      }
    } catch {
      toast.error("Failed to delete inspections")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <ClipboardCheck className="text-cyan-500" size={28} />
            Inspections
          </h1>
          <p className="text-sm text-neutral-500 dark:text-slate-400 mt-1">
            National Inspection Reports (NIR) — Field data capture and IICRC classification
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard/inspections/new")}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium hover:from-blue-600 hover:to-cyan-600 hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={18} />
          New Inspection
        </button>
      </div>

      {/* Status Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("")}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
            !statusFilter
              ? "bg-cyan-500 text-white"
              : "bg-neutral-100 dark:bg-slate-800 text-neutral-600 dark:text-slate-400 hover:bg-neutral-200 dark:hover:bg-slate-700"
          )}
        >
          All ({inspections.length})
        </button>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) =>
          statusCounts[key] ? (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? "" : key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                statusFilter === key
                  ? "bg-cyan-500 text-white"
                  : cn(cfg.bg, cfg.color, "hover:opacity-80")
              )}
            >
              {cfg.label} ({statusCounts[key]})
            </button>
          ) : null
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          placeholder="Search by inspection number, address, or technician..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all"
        />
      </div>

      {/* Bulk actions */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={selectedIds.size === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll}
              className="rounded border-neutral-300 dark:border-slate-600 text-cyan-500 focus:ring-cyan-500"
            />
            Select all ({filtered.length})
          </label>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete selected ({selectedIds.size})
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-cyan-500" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <ClipboardCheck size={48} className="mx-auto text-neutral-300 dark:text-slate-600 mb-4" />
          <h3 className="text-lg font-semibold text-neutral-700 dark:text-slate-300">
            {inspections.length === 0 ? "No inspections yet" : "No matching inspections"}
          </h3>
          <p className="text-sm text-neutral-500 dark:text-slate-400 mt-1 mb-4">
            {inspections.length === 0
              ? "Create your first National Inspection Report"
              : "Try adjusting your search or filters"}
          </p>
          {inspections.length === 0 && (
            <button
              onClick={() => router.push("/dashboard/inspections/new")}
              className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
            >
              <Plus size={16} />
              New Inspection
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((insp) => {
            const status = STATUS_CONFIG[insp.status] || STATUS_CONFIG.DRAFT
            const classification = insp.classifications?.[0]
            return (
              <div
                key={insp.id}
                onClick={() => router.push(`/dashboard/inspections/${insp.id}`)}
                className={cn(
                  "w-full text-left p-4 rounded-xl border cursor-pointer transition-all duration-200 group flex items-start gap-3",
                  selectedIds.has(insp.id)
                    ? "border-cyan-400 dark:border-cyan-600 bg-cyan-50/50 dark:bg-cyan-900/20"
                    : "border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 hover:bg-neutral-50 dark:hover:bg-slate-800/50 hover:border-cyan-300 dark:hover:border-cyan-800 hover:shadow-md"
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(insp.id)}
                  onChange={() => toggleSelect(insp.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 rounded border-neutral-300 dark:border-slate-600 text-cyan-500 focus:ring-cyan-500"
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                        {insp.inspectionNumber}
                      </span>
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", status.bg, status.color)}>
                        {status.label}
                      </span>
                      {classification && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                          Cat {classification.category} / Class {classification.class}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-neutral-900 dark:text-white font-medium">
                      <MapPin size={14} className="text-neutral-400 flex-shrink-0" />
                      <span className="truncate">{insp.propertyAddress}</span>
                      <span className="text-neutral-400 dark:text-slate-500 text-sm">({insp.propertyPostcode})</span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-neutral-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(insp.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                      {insp.technicianName && (
                        <span>Tech: {insp.technicianName}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Droplets size={12} />
                        {insp.moistureReadings.length} readings
                      </span>
                      <span className="flex items-center gap-1">
                        <AlertTriangle size={12} />
                        {insp.affectedAreas.length} areas
                      </span>
                      <span className="flex items-center gap-1">
                        <Camera size={12} />
                        {insp.photos?.length || 0} photos
                      </span>
                      {insp.environmentalData && (
                        <span className="flex items-center gap-1">
                          <Thermometer size={12} />
                          {insp.environmentalData.ambientTemperature}°F / {insp.environmentalData.humidityLevel}%
                        </span>
                      )}
                    </div>
                  </div>
                <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteOne(e, insp.id)}
                    disabled={deleting}
                    className="p-2 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    title="Delete inspection"
                  >
                    <Trash2 size={18} />
                  </button>
                  <ChevronRight size={20} className="text-neutral-300 dark:text-slate-600 group-hover:text-cyan-500 transition-colors mt-1" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
