"use client"

import { useState, useEffect } from "react"
import { FileText, Plus, Download, CheckCircle, Clock, X, PenTool, AlertCircle, Eye } from "lucide-react"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"
import AuthorityFormViewer from "./AuthorityFormViewer"

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
  const [suggestions, setSuggestions] = useState<SuggestedForm[]>([])
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; code: string }>>([])
  const [forms, setForms] = useState<FormInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string | null>(null)
  const [authorityDescription, setAuthorityDescription] = useState("")
  const [viewingFormId, setViewingFormId] = useState<string | null>(null)

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
          <h2 className="text-xl font-semibold mb-1">Authority Forms</h2>
          <p className="text-sm text-slate-400">
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
        <div className="bg-slate-800/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertCircle size={20} className="text-yellow-400" />
            Suggested Forms
          </h3>
          <div className="space-y-3">
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                className={cn(
                  "p-4 rounded-lg border",
                  suggestion.alreadyCreated
                    ? "bg-slate-700/30 border-slate-600"
                    : "bg-slate-700/50 border-slate-600"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium">{suggestion.templateName}</h4>
                      {getPriorityBadge(suggestion.priority)}
                      {suggestion.alreadyCreated && (
                        <span className="px-2 py-1 rounded-full text-xs bg-green-500/20 text-green-400">
                          Already Created
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400">{suggestion.reason}</p>
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
        <h3 className="text-lg font-semibold mb-4">Existing Forms</h3>
        {forms.length === 0 ? (
          <div className="text-center py-12 bg-slate-800/30 rounded-lg">
            <FileText size={48} className="mx-auto text-slate-500 mb-4" />
            <p className="text-slate-400">No authority forms created yet</p>
            <p className="text-sm text-slate-500 mt-2">
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
                  className="bg-slate-800/50 rounded-lg p-4 border border-slate-700"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-medium">{form.template.name}</h4>
                        {getStatusBadge(form.status)}
                      </div>
                      <p className="text-sm text-slate-400 mb-2 line-clamp-2">
                        {form.authorityDescription}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
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
                        onClick={() => setViewingFormId(form.id)}
                        className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                        title="View Form"
                      >
                        <Eye size={18} className="text-slate-400" />
                      </button>
                      <button
                        onClick={() => handleDownloadPDF(form.id, form.template.name)}
                        className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                        title="Download PDF"
                      >
                        <Download size={18} className="text-slate-400" />
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
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">Create Authority Form</h3>
            
            {selectedTemplateCode ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Authority Description
                  </label>
                  <textarea
                    value={authorityDescription}
                    onChange={(e) => setAuthorityDescription(e.target.value)}
                    placeholder="Describe the authority being granted..."
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400"
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
                    className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
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
                <p className="text-slate-400 text-sm mb-4">
                  Select a form template to create:
                </p>
                {templates.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-slate-400 mb-4">No templates available</p>
                    <p className="text-xs text-slate-500">
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
                            "w-full p-3 rounded-lg text-left transition-colors",
                            alreadyCreated
                              ? "bg-slate-700/50 border border-slate-600 opacity-60 cursor-not-allowed"
                              : "bg-slate-700 hover:bg-slate-600 border border-slate-600"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium">{template.name}</div>
                              {template.description && (
                                <div className="text-xs text-slate-400 mt-1">
                                  {template.description}
                                </div>
                              )}
                              {suggestion && (
                                <div className="text-xs text-yellow-400 mt-1">
                                  {suggestion.reason}
                                </div>
                              )}
                            </div>
                            {alreadyCreated && (
                              <span className="text-xs text-green-400 ml-2">
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
                  className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Form Viewer Modal */}
      {viewingFormId && (
        <div className="fixed inset-0 z-50 bg-black/80">
          <div className="h-full w-full overflow-auto">
            <AuthorityFormViewer 
              formId={viewingFormId}
              onClose={() => setViewingFormId(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
