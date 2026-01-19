"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { FileText, Plus, Download, CheckCircle, Clock, X, PenTool, AlertCircle, Eye } from "lucide-react"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"

interface AuthorityFormsViewerProps {
  reportId: string
}

interface SuggestedForm {
  templateCode: string
  templateName: string
  priority: 'required' | 'recommended' | 'optional'
  reason: string
  alreadyCreated: boolean
}

interface FormInstance {
  id: string
  template: {
    id: string
    name: string
    code: string
  }
  status: string
  authorityDescription: string
  signatures: Array<{
    id: string
    signatoryName: string
    signatoryRole: string
    signedAt: Date | null
  }>
  createdAt: string
  completedAt: string | null
}

export default function AuthorityFormsViewer({ reportId }: AuthorityFormsViewerProps) {
  const router = useRouter()
  const [suggestions, setSuggestions] = useState<SuggestedForm[]>([])
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; code: string }>>([])
  const [forms, setForms] = useState<FormInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string | null>(null)
  const [authorityDescription, setAuthorityDescription] = useState("")

  useEffect(() => {
    fetchData()
  }, [reportId])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Fetch templates
      const templatesRes = await fetch(`/api/authority-forms/templates`)
      if (templatesRes.ok) {
        const templatesData = await templatesRes.json()
        console.log("[AuthorityFormsViewer] Templates fetched:", templatesData.templates?.length || 0)
        setTemplates(templatesData.templates || [])
      } else {
        const errorData = await templatesRes.json().catch(() => ({}))
        console.error("[AuthorityFormsViewer] Failed to fetch templates:", errorData)
        toast.error("Failed to load templates")
      }

      // Fetch suggestions
      const suggestionsRes = await fetch(`/api/reports/${reportId}/authority-forms/suggestions`)
      if (suggestionsRes.ok) {
        const suggestionsData = await suggestionsRes.json()
        console.log("[AuthorityFormsViewer] Suggestions fetched:", suggestionsData.suggestions?.length || 0)
        setSuggestions(suggestionsData.suggestions || [])
      } else {
        console.warn("[AuthorityFormsViewer] Failed to fetch suggestions")
      }

      // Fetch existing forms
      const formsRes = await fetch(`/api/reports/${reportId}/authority-forms`)
      if (formsRes.ok) {
        const formsData = await formsRes.json()
        setForms(formsData.forms || [])
      }
    } catch (error) {
      console.error("Error fetching authority forms:", error)
      toast.error("Failed to load authority forms")
    } finally {
      setLoading(false)
    }
  }

  const handleCreateForm = async (templateCode: string) => {
    try {
      setCreating(true)
      
      // Find template ID from code
      const template = templates.find(t => t.code === templateCode)
      if (!template) {
        toast.error("Template not found")
        return
      }

      const response = await fetch(`/api/reports/${reportId}/authority-forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          authorityDescription: authorityDescription || "As per inspection report and scope of works",
          signatoryRoles: ["CLIENT"]
        })
      })

      if (response.ok) {
        toast.success("Authority form created successfully")
        setShowCreateModal(false)
        setSelectedTemplateCode(null)
        setAuthorityDescription("")
        fetchData()
      } else {
        const error = await response.json()
        toast.error(error.error || "Failed to create form")
      }
    } catch (error) {
      console.error("Error creating form:", error)
      toast.error("Failed to create authority form")
    } finally {
      setCreating(false)
    }
  }

  const handleDownloadPDF = async (formId: string, formName: string) => {
    try {
      const response = await fetch(`/api/authority-forms/${formId}/pdf`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${formName}-${formId.slice(-6)}.pdf`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success("PDF downloaded successfully")
      } else {
        toast.error("Failed to download PDF")
      }
    } catch (error) {
      console.error("Error downloading PDF:", error)
      toast.error("Failed to download PDF")
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      DRAFT: { label: "Draft", color: "bg-slate-500", icon: FileText },
      PENDING_SIGNATURES: { label: "Pending Signatures", color: "bg-yellow-500", icon: Clock },
      PARTIALLY_SIGNED: { label: "Partially Signed", color: "bg-orange-500", icon: AlertCircle },
      COMPLETED: { label: "Completed", color: "bg-green-500", icon: CheckCircle },
      CANCELLED: { label: "Cancelled", color: "bg-red-500", icon: X }
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.DRAFT
    const Icon = config.icon

    return (
      <span className={cn(
        "px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1",
        config.color,
        "text-white"
      )}>
        <Icon size={12} />
        {config.label}
      </span>
    )
  }

  const getPriorityBadge = (priority: string) => {
    const priorityConfig = {
      required: { label: "Required", color: "bg-red-500" },
      recommended: { label: "Recommended", color: "bg-yellow-500" },
      optional: { label: "Optional", color: "bg-blue-500" }
    }

    const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.optional

    return (
      <span className={cn(
        "px-2 py-1 rounded-full text-xs font-medium",
        config.color,
        "text-white"
      )}>
        {config.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={cn("text-xl font-semibold mb-1", "text-neutral-900 dark:text-white")}>Authority Forms</h2>
          <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>
            Required authorization forms for this claim
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
        >
          <Plus size={18} />
          Create Form
        </button>
      </div>

      {/* Suggested Forms */}
      {suggestions.length > 0 && (
        <div className={cn("rounded-lg p-6", "bg-neutral-100 dark:bg-slate-800/50")}>
          <h3 className={cn("text-lg font-semibold mb-4 flex items-center gap-2", "text-neutral-900 dark:text-white")}>
            <AlertCircle size={20} className="text-yellow-500 dark:text-yellow-400" />
            Suggested Forms
          </h3>
          <div className="space-y-3">
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                className={cn(
                  "p-4 rounded-lg border",
                  suggestion.alreadyCreated
                    ? "bg-neutral-50 dark:bg-slate-700/30 border-neutral-200 dark:border-slate-600"
                    : "bg-white dark:bg-slate-700/50 border-neutral-200 dark:border-slate-600"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className={cn("font-medium", "text-neutral-900 dark:text-white")}>{suggestion.templateName}</h4>
                      {getPriorityBadge(suggestion.priority)}
                      {suggestion.alreadyCreated && (
                        <span className={cn("px-2 py-1 rounded-full text-xs", "bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400")}>
                          Already Created
                        </span>
                      )}
                    </div>
                    <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>{suggestion.reason}</p>
                  </div>
                  {!suggestion.alreadyCreated && (
                    <button
                      onClick={() => {
                        setSelectedTemplateCode(suggestion.templateCode)
                        setShowCreateModal(true)
                      }}
                      className="px-3 py-1.5 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors text-sm"
                    >
                      Create
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing Forms */}
      <div>
        <h3 className={cn("text-lg font-semibold mb-4", "text-neutral-900 dark:text-white")}>Existing Forms</h3>
        {forms.length === 0 ? (
          <div className={cn("text-center py-12 rounded-lg", "bg-neutral-100 dark:bg-slate-800/30")}>
            <FileText size={48} className={cn("mx-auto mb-4", "text-neutral-400 dark:text-slate-500")} />
            <p className={cn("text-neutral-600 dark:text-slate-400")}>No authority forms created yet</p>
            <p className={cn("text-sm mt-2", "text-neutral-500 dark:text-slate-500")}>
              Use the suggestions above or create a form manually
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {forms.map((form) => {
              const signedCount = form.signatures.filter(s => s.signedAt).length
              const totalSignatures = form.signatures.length

              return (
                <div
                  key={form.id}
                  className={cn("rounded-lg p-4 border", "bg-white dark:bg-slate-800/50 border-neutral-200 dark:border-slate-700")}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className={cn("font-medium", "text-neutral-900 dark:text-white")}>{form.template.name}</h4>
                        {getStatusBadge(form.status)}
                      </div>
                      <p className={cn("text-sm mb-2 line-clamp-2", "text-neutral-600 dark:text-slate-400")}>
                        {form.authorityDescription}
                      </p>
                      <div className={cn("flex items-center gap-4 text-xs", "text-neutral-500 dark:text-slate-500")}>
                        <span>
                          Signatures: {signedCount} of {totalSignatures}
                        </span>
                        <span>
                          Created: {new Date(form.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => router.push(`/dashboard/reports/${reportId}/authority-forms/${form.id}`)}
                        className={cn("p-2 rounded-lg transition-colors", "hover:bg-neutral-100 dark:hover:bg-slate-700")}
                        title="View Form"
                      >
                        <Eye size={18} className={cn("text-neutral-600 dark:text-slate-400")} />
                      </button>
                      <button
                        onClick={() => handleDownloadPDF(form.id, form.template.name)}
                        className={cn("p-2 rounded-lg transition-colors", "hover:bg-neutral-100 dark:hover:bg-slate-700")}
                        title="Download PDF"
                      >
                        <Download size={18} className={cn("text-neutral-600 dark:text-slate-400")} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={cn("rounded-lg p-6 max-w-md w-full mx-4", "bg-white dark:bg-slate-800")}>
            <h3 className={cn("text-xl font-semibold mb-4", "text-neutral-900 dark:text-white")}>Create Authority Form</h3>
            
            {selectedTemplateCode ? (
              <div className="space-y-4">
                <div>
                  <label className={cn("block text-sm font-medium mb-2", "text-neutral-900 dark:text-white")}>
                    Authority Description
                  </label>
                  <textarea
                    value={authorityDescription}
                    onChange={(e) => setAuthorityDescription(e.target.value)}
                    placeholder="Describe the authority being granted..."
                    className={cn(
                      "w-full px-3 py-2 border rounded-lg",
                      "bg-white dark:bg-slate-700 border-neutral-300 dark:border-slate-600",
                      "text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-slate-400"
                    )}
                    rows={4}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowCreateModal(false)
                      setSelectedTemplateCode(null)
                      setAuthorityDescription("")
                    }}
                    className={cn(
                      "flex-1 px-4 py-2 rounded-lg transition-colors",
                      "bg-neutral-200 dark:bg-slate-700 text-neutral-900 dark:text-white",
                      "hover:bg-neutral-300 dark:hover:bg-slate-600"
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleCreateForm(selectedTemplateCode)}
                    disabled={creating}
                    className="flex-1 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors disabled:opacity-50"
                  >
                    {creating ? "Creating..." : "Create Form"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className={cn("text-sm mb-4", "text-neutral-600 dark:text-slate-400")}>
                  Select a form template to create:
                </p>
                {templates.length === 0 ? (
                  <div className="text-center py-8">
                    <p className={cn("mb-4", "text-neutral-600 dark:text-slate-400")}>No templates available</p>
                    <p className={cn("text-xs", "text-neutral-500 dark:text-slate-500")}>
                      Please run the seed script to populate templates
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {templates.map((template) => {
                      const alreadyCreated = forms.some(
                        f => f.template.id === template.id
                      )
                      const suggestion = suggestions.find(
                        s => s.templateCode === template.code
                      )
                      
                      return (
                        <button
                          key={template.id}
                          onClick={() => setSelectedTemplateCode(template.code)}
                          disabled={alreadyCreated}
                          className={cn(
                            "w-full p-3 rounded-lg text-left transition-colors border",
                            alreadyCreated
                              ? "bg-neutral-100 dark:bg-slate-700/50 border-neutral-200 dark:border-slate-600 opacity-60 cursor-not-allowed"
                              : "bg-neutral-50 dark:bg-slate-700 hover:bg-neutral-100 dark:hover:bg-slate-600 border-neutral-200 dark:border-slate-600"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className={cn("font-medium", "text-neutral-900 dark:text-white")}>{template.name}</div>
                              {template.description && (
                                <div className={cn("text-xs mt-1", "text-neutral-600 dark:text-slate-400")}>
                                  {template.description}
                                </div>
                              )}
                              {suggestion && (
                                <div className={cn("text-xs mt-1", "text-yellow-600 dark:text-yellow-400")}>
                                  {suggestion.reason}
                                </div>
                              )}
                            </div>
                            {alreadyCreated && (
                              <span className={cn("text-xs ml-2", "text-green-700 dark:text-green-400")}>
                                Created
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
                <button
                  onClick={() => setShowCreateModal(false)}
                  className={cn(
                    "w-full px-4 py-2 rounded-lg transition-colors",
                    "bg-neutral-200 dark:bg-slate-700 text-neutral-900 dark:text-white",
                    "hover:bg-neutral-300 dark:hover:bg-slate-600"
                  )}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
