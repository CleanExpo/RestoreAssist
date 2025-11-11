"use client"

import { useState, useEffect } from "react"
import { FileText, Download, Loader2, AlertCircle, CheckCircle, Edit, Save } from "lucide-react"
import toast from "react-hot-toast"
import ProfessionalDocumentViewer from "./ProfessionalDocumentViewer"

interface ScopeOfWorksViewerProps {
  reportId: string
  onScopeGenerated?: () => void
}

export default function ScopeOfWorksViewer({ reportId, onScopeGenerated }: ScopeOfWorksViewerProps) {
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<any>(null)
  const [scopeDocument, setScopeDocument] = useState<string>('')
  const [scopeData, setScopeData] = useState<any>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    fetchReport()
  }, [reportId])

  const fetchReport = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/reports/${reportId}`)
      if (response.ok) {
        const data = await response.json()
        // API returns report directly, not wrapped in a 'report' object
        if (data && typeof data === 'object') {
          setReport(data)
          if (data.scopeOfWorksDocument) {
            setScopeDocument(data.scopeOfWorksDocument)
          }
          if (data.scopeOfWorksData) {
            // scopeOfWorksData is already parsed by the API
            setScopeData(data.scopeOfWorksData)
          }
        } else {
          console.error('Unexpected response structure:', data)
          toast.error('Failed to parse report data')
        }
      } else {
        let errorMessage = 'Failed to load report'
        try {
          const error = await response.json()
          errorMessage = error.error || errorMessage
        } catch (e) {
          errorMessage = `Server error: ${response.status} ${response.statusText}`
        }
        toast.error(errorMessage)
      }
    } catch (error) {
      console.error('Error fetching report:', error)
      toast.error('Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateScope = async () => {
    setGenerating(true)
    try {
      const response = await fetch('/api/reports/generate-scope-of-works', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.scopeOfWorks && data.scopeOfWorks.document) {
          setScopeDocument(data.scopeOfWorks.document)
          setScopeData(data.scopeOfWorks.data)
          toast.success('Scope of Works generated successfully')
          if (onScopeGenerated) {
            onScopeGenerated()
          }
          fetchReport()
        } else {
          console.error('Unexpected response structure:', data)
          toast.error('Failed to parse scope of works response')
        }
      } else {
        let errorMessage = 'Failed to generate scope of works'
        try {
          const error = await response.json()
          errorMessage = error.error || errorMessage
        } catch (e) {
          errorMessage = `Server error: ${response.status} ${response.statusText}`
        }
        toast.error(errorMessage)
      }
    } catch (error) {
      console.error('Error generating scope:', error)
      toast.error('Failed to generate scope of works')
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    // Save edited document
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scopeOfWorksDocument: scopeDocument
        })
      })

      if (response.ok) {
        toast.success('Scope of Works saved successfully')
        setEditing(false)
      } else {
        toast.error('Failed to save scope of works')
      }
    } catch (error) {
      console.error('Error saving scope:', error)
      toast.error('Failed to save scope of works')
    }
  }

  const handleDownload = () => {
    if (!scopeDocument) {
      toast.error('No scope document to download')
      return
    }

    const blob = new Blob([scopeDocument], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Scope-of-Works-${reportId}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Scope of Works downloaded')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Scope of Works
          </h2>
          <p className="text-slate-400">
            {scopeDocument ? 'View and edit your scope of works document' : 'Generate your comprehensive scope of works document'}
          </p>
        </div>
        <div className="flex gap-2">
          {scopeDocument && (
            <>
              <button
                onClick={() => setEditing(!editing)}
                className="flex items-center gap-2 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
              >
                <Edit className="w-4 h-4" />
                {editing ? 'Cancel Edit' : 'Edit'}
              </button>
              {editing && (
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
              )}
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </>
          )}
        </div>
      </div>

      {/* Generate Scope Options */}
      {!scopeDocument && (
        <div className="p-6 rounded-lg border border-amber-500/50 bg-amber-500/10">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-amber-400">Scope of Works Not Generated</h3>
          </div>
          <p className="text-slate-300 mb-4">
            Generate your comprehensive scope of works document with all remediation phases, restoration works line items, licensed trades requirements, and coordination notes.
          </p>
          <button
            onClick={handleGenerateScope}
            disabled={generating}
            className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate Scope of Works'}
          </button>
        </div>
      )}

      {/* Generating Indicator */}
      {generating && (
        <div className="p-6 rounded-lg border border-cyan-500/50 bg-cyan-500/10">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
            <div>
              <p className="text-cyan-400 font-medium">Generating scope of works document...</p>
              <p className="text-sm text-slate-400">This may take a few moments. Please wait.</p>
            </div>
          </div>
        </div>
      )}

      {/* Scope Document Content */}
      {scopeDocument && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-400 font-medium">Scope of Works Generated Successfully</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
            {editing ? (
              <div className="p-6">
                <textarea
                  value={scopeDocument}
                  onChange={(e) => setScopeDocument(e.target.value)}
                  rows={30}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 font-mono text-sm text-slate-300"
                />
              </div>
            ) : (
              <ProfessionalDocumentViewer content={scopeDocument} />
            )}
          </div>

          {/* Scope Data Summary */}
          {scopeData && (
            <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
              <h3 className="text-sm font-semibold mb-2">Scope Summary</h3>
              <div className="grid md:grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-slate-400">Line Items:</span>
                  <span className="text-slate-300 ml-2">{scopeData.lineItems?.length || 0}</span>
                </div>
                <div>
                  <span className="text-slate-400">Licensed Trades:</span>
                  <span className="text-slate-300 ml-2">{scopeData.licensedTrades?.length || 0}</span>
                </div>
                <div>
                  <span className="text-slate-400">Drying Duration:</span>
                  <span className="text-slate-300 ml-2">{scopeData.dryingDuration || 7} days</span>
                </div>
              </div>
            </div>
          )}

          {/* Regenerate Option */}
          <div className="flex justify-end">
            <button
              onClick={handleGenerateScope}
              disabled={generating}
              className="px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-50"
            >
              Regenerate Scope
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

