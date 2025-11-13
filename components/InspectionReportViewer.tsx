"use client"

import { useState, useEffect } from "react"
import { FileText, Download, Loader2, AlertCircle, CheckCircle } from "lucide-react"
import toast from "react-hot-toast"
import { useRouter } from "next/navigation"
import ProfessionalDocumentViewer from "./ProfessionalDocumentViewer"

interface InspectionReportViewerProps {
  reportId: string
  onReportGenerated?: () => void
}

export default function InspectionReportViewer({ reportId, onReportGenerated }: InspectionReportViewerProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<any>(null)
  const [reportContent, setReportContent] = useState<string>('')

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
          if (data.detailedReport) {
            setReportContent(data.detailedReport)
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

  const handleGenerateReport = async (reportType: 'basic' | 'enhanced' = 'enhanced') => {
    setGenerating(true)
    try {
      const response = await fetch('/api/reports/generate-inspection-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, reportType })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.report && data.report.detailedReport) {
          setReportContent(data.report.detailedReport)
          toast.success('Inspection report generated successfully')
          if (onReportGenerated) {
            onReportGenerated()
          }
          // Refresh report data
          fetchReport()
        } else {
          console.error('Unexpected response structure:', data)
          toast.error('Failed to parse report response')
        }
      } else {
        let errorMessage = 'Failed to generate report'
        try {
          const error = await response.json()
          errorMessage = error.error || errorMessage
        } catch (e) {
          errorMessage = `Server error: ${response.status} ${response.statusText}`
        }
        toast.error(errorMessage)
      }
    } catch (error) {
      console.error('Error generating report:', error)
      toast.error('Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async () => {
    if (!reportContent) {
      toast.error('No report content to download')
      return
    }

    try {
      const response = await fetch(`/api/reports/${reportId}/download-inspection-report`)
      
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
      const filename = filenameMatch ? filenameMatch[1] : `Inspection-Report-${reportId}.pdf`
      
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Inspection Report PDF downloaded')
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
            <FileText className="w-6 h-6" />
            Professional Inspection Report
          </h2>
          <p className="text-slate-400">
            {reportContent ? 'View and download your generated report' : 'Generate your comprehensive inspection report'}
          </p>
        </div>
        <div className="flex gap-2">
          {reportContent && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          )}
        </div>
      </div>

      {/* Generate Report Options */}
      {!reportContent && (
        <div className="p-6 rounded-lg border border-amber-500/50 bg-amber-500/10">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-amber-400">Report Not Generated</h3>
          </div>
          <p className="text-slate-300 mb-4">
            Generate your professional inspection report with all 13 sections. The report will include comprehensive analysis based on all collected data.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => handleGenerateReport('basic')}
              disabled={generating}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate Basic Report'}
            </button>
            <button
              onClick={() => handleGenerateReport('enhanced')}
              disabled={generating}
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate Enhanced Report'}
            </button>
          </div>
        </div>
      )}

      {/* Generating Indicator */}
      {generating && (
        <div className="p-6 rounded-lg border border-cyan-500/50 bg-cyan-500/10">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
            <div>
              <p className="text-cyan-400 font-medium">Generating comprehensive inspection report...</p>
              <p className="text-sm text-slate-400">This may take a few moments. Please wait.</p>
            </div>
          </div>
        </div>
      )}

      {/* Report Content */}
      {reportContent && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-400 font-medium">Report Generated Successfully</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
            <ProfessionalDocumentViewer content={reportContent} />
          </div>

          {/* Regenerate Option */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => handleGenerateReport('enhanced')}
              disabled={generating}
              className="px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-50"
            >
              Regenerate Report
            </button>
          </div>
        </div>
      )}

      {/* Report Info */}
      {report && (
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-sm font-semibold mb-2">Report Information</h3>
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-slate-400">Report Depth Level:</span>
              <span className="text-slate-300 ml-2">{report.reportDepthLevel || 'Not set'}</span>
            </div>
            <div>
              <span className="text-slate-400">Version:</span>
              <span className="text-slate-300 ml-2">{report.reportVersion || 1}</span>
            </div>
            <div>
              <span className="text-slate-400">Status:</span>
              <span className="text-slate-300 ml-2">{report.status}</span>
            </div>
            <div>
              <span className="text-slate-400">Last Updated:</span>
              <span className="text-slate-300 ml-2">
                {new Date(report.updatedAt).toLocaleString('en-AU')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

