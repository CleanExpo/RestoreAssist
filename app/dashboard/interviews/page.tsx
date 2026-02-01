"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog"
import {
  Plus,
  Search,
  MessageSquare,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  PlayCircle,
  BarChart3,
  ChevronRight,
  FileText,
  Trash2,
} from "lucide-react"

interface InterviewSession {
  id: string
  status: string
  startedAt: string
  completedAt: string | null
  abandonedAt: string | null
  totalQuestionsAsked: number
  totalAnswersGiven: number
  estimatedTimeMinutes: number
  actualTimeMinutes: number | null
  userTierLevel: string
  technicianExperience: string | null
  formTemplate: {
    id: string
    name: string
    formType: string
    category: string
  }
  createdAt: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  STARTED: { label: "Started", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30", icon: PlayCircle },
  IN_PROGRESS: { label: "In Progress", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/30", icon: Clock },
  COMPLETED: { label: "Completed", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", icon: CheckCircle2 },
  ABANDONED: { label: "Abandoned", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/30", icon: XCircle },
}

export default function InterviewsPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [stats, setStats] = useState<any>(null)
  const [templates, setTemplates] = useState<any[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: "single" | "bulk"; id?: string } | null>(null)

  useEffect(() => {
    fetchSessions()
    fetchStats()
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      setLoadingTemplates(true)
      const response = await fetch("/api/form-templates")
      if (response.ok) {
        const data = await response.json()
        setTemplates(data.templates || [])
      }
    } catch (error) {
      console.error("Error fetching templates:", error)
    } finally {
      setLoadingTemplates(false)
    }
  }

  const fetchSessions = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/interviews")
      if (response.ok) {
        const data = await response.json()
        setSessions(data.sessions || [])
      } else {
        toast.error("Failed to fetch interviews")
      }
    } catch (error) {
      console.error("Error fetching interviews:", error)
      toast.error("Failed to fetch interviews")
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/forms/interview/analytics?type=aggregate")
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error("Error fetching stats:", error)
    }
  }

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      const matchesSearch =
        !searchTerm ||
        s.formTemplate.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.id.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = !statusFilter || s.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [sessions, searchTerm, statusFilter])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    sessions.forEach((s) => {
      counts[s.status] = (counts[s.status] || 0) + 1
    })
    return counts
  }, [sessions])

  const getProgress = (s: InterviewSession) => {
    if (s.totalQuestionsAsked === 0) return 0
    return Math.round((s.totalAnswersGiven / s.totalQuestionsAsked) * 100)
  }

  const handleSessionClick = (s: InterviewSession) => {
    if (s.status === "IN_PROGRESS" || s.status === "STARTED") {
      router.push(`/dashboard/forms/interview?formTemplateId=${s.formTemplate.id}&sessionId=${s.id}`)
    } else if (s.status === "COMPLETED") {
      router.push("/dashboard/interview-analytics")
    }
  }

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
      setSelectedIds(new Set(filtered.map((s) => s.id)))
    }
  }

  const handleDeleteOne = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setDeleteTarget({ type: "single", id })
    setDeleteDialogOpen(true)
  }

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return
    setDeleteTarget({ type: "bulk" })
    setDeleteDialogOpen(true)
  }

  const performDelete = async () => {
    if (!deleteTarget) return

    try {
      setDeleting(true)
      if (deleteTarget.type === "single" && deleteTarget.id) {
        const res = await fetch(`/api/interviews/${deleteTarget.id}`, { method: "DELETE" })
        if (res.ok) {
          setSessions((prev) => prev.filter((s) => s.id !== deleteTarget.id))
          setSelectedIds((prev) => {
            const next = new Set(prev)
            next.delete(deleteTarget.id!)
            return next
          })
          toast.success("Interview session deleted")
          fetchStats()
        } else {
          const data = await res.json().catch(() => ({}))
          toast.error(data.error || "Failed to delete session")
        }
      } else if (deleteTarget.type === "bulk") {
        const res = await fetch("/api/interviews/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: Array.from(selectedIds) }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.success) {
          setSessions((prev) => prev.filter((s) => !selectedIds.has(s.id)))
          setSelectedIds(new Set())
          toast.success(`${data.deletedCount ?? selectedIds.size} session(s) deleted`)
          fetchStats()
        } else {
          toast.error(data.error || "Failed to delete sessions")
        }
      }
    } catch {
      toast.error("Failed to delete session(s)")
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="text-cyan-500" size={28} />
            Guided Interviews
          </h1>
          <p className="text-sm text-neutral-500 dark:text-slate-400 mt-1">
            IICRC-guided interviews to auto-populate report fields
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/dashboard/interview-analytics")}
            className="flex items-center gap-2 px-3 py-2.5 border border-neutral-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-neutral-50 dark:hover:bg-slate-800 transition-colors"
          >
            <BarChart3 size={16} />
            Analytics
          </button>
          <button
            onClick={() => router.push("/dashboard/interviews/new")}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium hover:from-blue-600 hover:to-cyan-600 hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={18} />
            New Interview
          </button>
        </div>
      </div>

      {/* Form Template Status */}
      {loadingTemplates ? (
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <Loader2 className="animate-spin text-cyan-500" size={20} />
            <p className="text-sm text-neutral-600 dark:text-slate-400">Loading templates...</p>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10">
          <div className="flex items-start gap-3">
            <FileText className="text-emerald-600 dark:text-emerald-400 mt-0.5" size={20} />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-300 mb-1">
                Form Templates ({templates.length} available)
              </h3>
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                {templates.length} form template{templates.length !== 1 ? 's' : ''} available for interviews. Select a template when starting a new interview.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {templates.slice(0, 5).map((tpl) => (
                  <span
                    key={tpl.id}
                    className="text-xs px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                  >
                    {tpl.name}
                  </span>
                ))}
                {templates.length > 5 && (
                  <span className="text-xs px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    +{templates.length - 5} more
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Bar — customer-centric metrics (no session count) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
          <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider">Finished</div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {stats != null ? `${Math.round(stats.completionRate ?? 0)}%` : "—"}
          </div>
        </div>
        <div className="p-3 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
          <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider">Avg. Time per Interview</div>
          <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">
            {stats != null ? `${Math.round((stats.averageSessionDuration ?? 0) / 60)}m` : "—"}
          </div>
        </div>
        <div className="p-3 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
          <div className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wider">Report Fields Filled</div>
          <div className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">
            {stats != null ? (stats.averageFieldsPopulated ?? 0) : "—"}
          </div>
        </div>
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
          All ({sessions.length})
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
          placeholder="Search by template name or session ID..."
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
          <MessageSquare size={48} className="mx-auto text-neutral-300 dark:text-slate-600 mb-4" />
          <h3 className="text-lg font-semibold text-neutral-700 dark:text-slate-300">
            {sessions.length === 0 ? "No interviews yet" : "No matching interviews"}
          </h3>
          <p className="text-sm text-neutral-500 dark:text-slate-400 mt-1 mb-4">
            {sessions.length === 0
              ? "Start a guided interview to auto-populate your reports"
              : "Try adjusting your search or filters"}
          </p>
          {sessions.length === 0 && (
            <button
              onClick={() => router.push("/dashboard/interviews/new")}
              className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
            >
              <Plus size={16} />
              Start Interview
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.STARTED
            const progress = getProgress(s)
            const StatusIcon = cfg.icon
            const isResumable = s.status === "IN_PROGRESS" || s.status === "STARTED"
            return (
              <div
                key={s.id}
                onClick={() => handleSessionClick(s)}
                className={cn(
                  "w-full text-left p-4 rounded-xl border cursor-pointer transition-all duration-200 group flex items-start gap-3",
                  selectedIds.has(s.id)
                    ? "border-cyan-400 dark:border-cyan-600 bg-cyan-50/50 dark:bg-cyan-900/20"
                    : "border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 hover:bg-neutral-50 dark:hover:bg-slate-800/50 hover:border-cyan-300 dark:hover:border-cyan-800 hover:shadow-md"
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(s.id)}
                  onChange={() => toggleSelect(s.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 rounded border-neutral-300 dark:border-slate-600 text-cyan-500 focus:ring-cyan-500"
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-medium text-neutral-900 dark:text-white">
                        {s.formTemplate.name}
                      </span>
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1", cfg.bg, cfg.color)}>
                        <StatusIcon size={12} />
                        {cfg.label}
                      </span>
                      {isResumable && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400">
                          Resume
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-neutral-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(s.startedAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                      <span>
                        {s.totalAnswersGiven}/{s.totalQuestionsAsked} questions
                      </span>
                      {s.actualTimeMinutes && (
                        <span>{s.actualTimeMinutes}m</span>
                      )}
                      <span className="text-neutral-400 dark:text-slate-500 capitalize">
                        {s.formTemplate.category.toLowerCase().replace("_", " ")}
                      </span>
                    </div>
                    {/* Progress bar */}
                    {s.status !== "COMPLETED" && s.totalQuestionsAsked > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-neutral-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-neutral-400 w-8">{progress}%</span>
                      </div>
                    )}
                  </div>
                <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteOne(e, s.id)}
                    disabled={deleting}
                    className="p-2 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    title="Delete session"
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

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={performDelete}
        title={
          deleteTarget?.type === "bulk"
            ? "Delete Multiple Interview Sessions"
            : "Delete Interview Session"
        }
        description={
          deleteTarget?.type === "bulk"
            ? "Are you sure you want to delete the selected interview sessions? This will permanently remove all selected sessions and their responses."
            : "Are you sure you want to delete this interview session? This will permanently remove the session and all its responses."
        }
        itemCount={deleteTarget?.type === "bulk" ? selectedIds.size : undefined}
        isLoading={deleting}
      />
    </div>
  )
}
