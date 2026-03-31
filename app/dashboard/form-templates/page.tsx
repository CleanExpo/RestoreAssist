"use client"

import { FileText, Plus, Search, Trash2, Edit, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"

interface FormTemplate {
  id: string
  name: string
  description?: string
  formType: string
  category?: string
  isDefault?: boolean
  createdAt?: string
  _count?: { questions: number }
  questions?: Array<{ id: string }>
}

const BADGE_COLORS: Record<string, string> = {
  INTERVIEW: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  SURVEY: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  ONBOARDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
}

function getBadgeClass(formType: string): string {
  return BADGE_COLORS[formType] ?? "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function getQuestionCount(template: FormTemplate): number | null {
  if (template._count?.questions != null) return template._count.questions
  if (template.questions) return template.questions.length
  return null
}

// Loading skeleton card
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16" />
      </div>
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2" />
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4" />
      <div className="flex items-center justify-between">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
        <div className="flex gap-2">
          <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    </div>
  )
}

// Delete confirmation dialog
function DeleteDialog({
  template,
  onConfirm,
  onCancel,
  deleting,
}: {
  template: FormTemplate
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Delete Template</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
          Are you sure you want to delete{" "}
          <span className="font-medium text-gray-900 dark:text-white">&ldquo;{template.name}&rdquo;</span>?
          Any forms using this template will be affected.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FormTemplatesPage() {
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState("ALL")
  const [deleteTarget, setDeleteTarget] = useState<FormTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchTemplates()
  }, [])

  async function fetchTemplates() {
    try {
      setLoading(true)
      const res = await fetch("/api/form-templates")
      const data = await res.json()
      const list = data.templates ?? data ?? []
      setTemplates(list)
    } catch (err) {
      console.error("Error fetching form templates:", err)
      toast.error("Failed to load form templates")
    } finally {
      setLoading(false)
    }
  }

  // Unique formType values for filter dropdown
  const formTypes = useMemo(() => {
    const types = Array.from(new Set(templates.map((t) => t.formType).filter(Boolean)))
    return types.sort()
  }, [templates])

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesType = typeFilter === "ALL" || t.formType === typeFilter
      return matchesSearch && matchesType
    })
  }, [templates, searchTerm, typeFilter])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/form-templates/${deleteTarget.id}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id))
        toast.success(`"${deleteTarget.name}" deleted`)
      } else {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Failed to delete template")
      }
    } catch (err) {
      console.error("Delete error:", err)
      toast.error("Failed to delete template")
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Form Templates</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage reusable form templates for interviews, surveys, and onboarding
          </p>
        </div>
        <Link
          href="/dashboard/form-templates/new"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Template
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="sm:w-48">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="ALL">All types</option>
            {formTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Template grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
          {templates.length === 0 ? (
            <>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                No form templates yet
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Create your first one to get started.
              </p>
              <Link
                href="/dashboard/form-templates/new"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Template
              </Link>
            </>
          ) : (
            <>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                No templates match your filters
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Try adjusting your search or type filter.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((template) => {
            const questionCount = getQuestionCount(template)
            return (
              <div
                key={template.id}
                className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all"
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Link
                    href={`/dashboard/form-templates/${template.id}`}
                    className="text-base font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 line-clamp-2 transition-colors"
                  >
                    {template.name}
                  </Link>
                  <span
                    className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getBadgeClass(template.formType)}`}
                  >
                    {template.formType}
                  </span>
                </div>

                {/* Description */}
                {template.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
                    {template.description}
                  </p>
                )}

                {/* Category */}
                {template.category && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                    Category: {template.category}
                  </p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="text-xs text-gray-400 dark:text-gray-500 space-y-0.5">
                    {questionCount != null && (
                      <p>{questionCount} question{questionCount !== 1 ? "s" : ""}</p>
                    )}
                    {template.createdAt && (
                      <p>Created {formatDate(template.createdAt)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/dashboard/form-templates/${template.id}`}
                      className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="Edit template"
                    >
                      <Edit className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => setDeleteTarget(template)}
                      className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Delete template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Result count */}
      {!loading && filtered.length > 0 && (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Showing {filtered.length} of {templates.length} template{templates.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Delete dialog */}
      {deleteTarget && (
        <DeleteDialog
          template={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  )
}
