"use client"

import { useState, useEffect } from "react"
import { DollarSign, Download, Loader2, AlertCircle, CheckCircle, Edit, Save } from "lucide-react"
import toast from "react-hot-toast"
import ProfessionalDocumentViewer from "./ProfessionalDocumentViewer"

interface CostEstimationViewerProps {
  reportId: string
  onEstimationGenerated?: () => void
}

export default function CostEstimationViewer({ reportId, onEstimationGenerated }: CostEstimationViewerProps) {
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<any>(null)
  const [costDocument, setCostDocument] = useState<string>('')
  const [costData, setCostData] = useState<any>(null)
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
          if (data.costEstimationDocument) {
            setCostDocument(data.costEstimationDocument)
          }
          if (data.costEstimationData) {
            // costEstimationData is already parsed by the API
            setCostData(data.costEstimationData)
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

  const handleGenerateEstimation = async () => {
    setGenerating(true)
    try {
      const response = await fetch('/api/reports/generate-cost-estimation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.costEstimation && data.costEstimation.document) {
          setCostDocument(data.costEstimation.document)
          setCostData(data.costEstimation.data)
          toast.success('Cost Estimation generated successfully')
          if (onEstimationGenerated) {
            onEstimationGenerated()
          }
          fetchReport()
        } else {
          console.error('Unexpected response structure:', data)
          toast.error('Failed to parse cost estimation response')
        }
      } else {
        let errorMessage = 'Failed to generate cost estimation'
        try {
          const error = await response.json()
          errorMessage = error.error || errorMessage
        } catch (e) {
          errorMessage = `Server error: ${response.status} ${response.statusText}`
        }
        toast.error(errorMessage)
      }
    } catch (error) {
      console.error('Error generating cost estimation:', error)
      toast.error('Failed to generate cost estimation')
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          costEstimationDocument: costDocument
        })
      })

      if (response.ok) {
        toast.success('Cost Estimation saved successfully')
        setEditing(false)
      } else {
        toast.error('Failed to save cost estimation')
      }
    } catch (error) {
      console.error('Error saving cost estimation:', error)
      toast.error('Failed to save cost estimation')
    }
  }

  const handleDownload = async () => {
    if (!costDocument) {
      toast.error('No cost estimation document to download')
      return
    }

    try {
      const response = await fetch(`/api/reports/${reportId}/download-cost-estimation`)
      
      if (!response.ok) {
        const error = await response.json()
        toast.error(error.error || 'Failed to download PDF')
        return
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      
      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition')
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const filename = filenameMatch ? filenameMatch[1] : `Cost-Estimation-${reportId}.pdf`
      
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Cost Estimation PDF downloaded')
    } catch (error) {
      console.error('Error downloading PDF:', error)
      toast.error('Failed to download PDF')
    }
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
            <DollarSign className="w-6 h-6" />
            Cost Estimation
          </h2>
          <p className="text-slate-400">
            {costDocument ? 'View and edit your cost estimation document' : 'Generate your comprehensive cost estimation document'}
          </p>
        </div>
        <div className="flex gap-2">
          {costDocument && (
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

      {/* Generate Estimation Options */}
      {!costDocument && (
        <div className="p-6 rounded-lg border border-amber-500/50 bg-amber-500/10">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-amber-400">Cost Estimation Not Generated</h3>
          </div>
          <p className="text-slate-300 mb-4">
            Generate your comprehensive cost estimation document with detailed cost breakdowns by category, industry comparisons, and all necessary disclaimers.
          </p>
          <button
            onClick={handleGenerateEstimation}
            disabled={generating}
            className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate Cost Estimation'}
          </button>
        </div>
      )}

      {/* Generating Indicator */}
      {generating && (
        <div className="p-6 rounded-lg border border-cyan-500/50 bg-cyan-500/10">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
            <div>
              <p className="text-cyan-400 font-medium">Generating cost estimation document...</p>
              <p className="text-sm text-slate-400">This may take a few moments. Please wait.</p>
            </div>
          </div>
        </div>
      )}

      {/* Cost Document Content */}
      {costDocument && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-400 font-medium">Cost Estimation Generated Successfully</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
            {editing ? (
              <div className="p-6">
                <textarea
                  value={costDocument}
                  onChange={(e) => setCostDocument(e.target.value)}
                  rows={30}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 font-mono text-sm text-slate-300"
                />
              </div>
            ) : (
              <ProfessionalDocumentViewer content={costDocument} />
            )}
          </div>

          {/* Cost Summary */}
          {costData?.totals && (
            <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
              <h3 className="text-sm font-semibold mb-3">Cost Summary</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-400">Total Labour:</span>
                  <span className="text-slate-300 ml-2">${costData.totals.totalLabour.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-400">Total Equipment:</span>
                  <span className="text-slate-300 ml-2">${costData.totals.totalEquipment.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-400">Total Chemicals:</span>
                  <span className="text-slate-300 ml-2">${costData.totals.totalChemicals.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-400">Subtotal:</span>
                  <span className="text-slate-300 ml-2 font-semibold">${costData.totals.subtotal.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-400">GST (10%):</span>
                  <span className="text-slate-300 ml-2">${costData.totals.gst.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-400">Total Inc GST:</span>
                  <span className="text-green-400 ml-2 font-bold text-lg">${costData.totals.totalIncGST.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Regenerate Option */}
          <div className="flex justify-end">
            <button
              onClick={handleGenerateEstimation}
              disabled={generating}
              className="px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-50"
            >
              Regenerate Estimation
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

