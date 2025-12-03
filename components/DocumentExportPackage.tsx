"use client"

import { useState } from "react"
import { Download, FileText, FileJson, FileArchive, Mail, Loader2, CheckCircle } from "lucide-react"
import toast from "react-hot-toast"

interface DocumentExportPackageProps {
  reportId: string
  reportNumber?: string
  claimReference?: string
}

export default function DocumentExportPackage({ 
  reportId, 
  reportNumber, 
  claimReference 
}: DocumentExportPackageProps) {
  const [exporting, setExporting] = useState<string | null>(null)

  const handleExport = async (format: 'pdf' | 'word' | 'json' | 'zip') => {
    setExporting(format)
    try {
      const response = await fetch(`/api/reports/${reportId}/export-package?format=${format}`)
      
      if (!response.ok) {
        const error = await response.json()
        toast.error(error.error || 'Failed to export documents')
        return
      }

      // Handle different response types
      if (format === 'json') {
        const data = await response.json()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        downloadBlob(blob, `RestoreAssist-Export-${reportId}.json`)
      } else if (format === 'zip' || format === 'pdf') {
        const blob = await response.blob()
        const extension = format === 'zip' ? 'zip' : 'pdf'
        downloadBlob(blob, `RestoreAssist-Package-${reportId}.${extension}`)
      } else {
        // Word format (future implementation)
        toast.info('Word format export coming soon')
      }

      toast.success(`Documents exported successfully as ${format.toUpperCase()}`)
    } catch (error) {
      console.error('Error exporting:', error)
      toast.error('Failed to export documents')
    } finally {
      setExporting(null)
    }
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const handleEmailDelivery = async () => {
    // Future implementation - email delivery
    toast.info('Email delivery feature coming soon')
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
          <Download className="w-6 h-6" />
          Document Export Package
        </h2>
        <p className="text-slate-400">
          Export all documents in your preferred format for delivery to clients or insurers.
        </p>
      </div>

      {/* Export Format Options */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Export Format Options</h3>
        
        <div className="grid md:grid-cols-2 gap-4">
          {/* PDF Format */}
          <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:border-cyan-500/50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <FileText className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h4 className="font-semibold">PDF Format</h4>
                <p className="text-xs text-slate-400">Ready for insurer submission</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-3">
              Formatted and ready for insurer submission. Cannot be edited. Professional appearance.
            </p>
            <button
              onClick={() => handleExport('pdf')}
              disabled={exporting !== null}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {exporting === 'pdf' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Export PDF
                </>
              )}
            </button>
          </div>

          {/* ZIP Format */}
          <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:border-cyan-500/50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <FileArchive className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h4 className="font-semibold">ZIP Package</h4>
                <p className="text-xs text-slate-400">All formats included</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-3">
              Complete package with PDF, Word, JSON, and version history. All documents included.
            </p>
            <button
              onClick={() => handleExport('zip')}
              disabled={exporting !== null}
              className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {exporting === 'zip' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileArchive className="w-4 h-4" />
                  Export ZIP
                </>
              )}
            </button>
          </div>

          {/* JSON Format */}
          <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:border-cyan-500/50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <FileJson className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h4 className="font-semibold">JSON Format</h4>
                <p className="text-xs text-slate-400">For CRM integration</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-3">
              Machine-readable data for CRM integration or future API workflow.
            </p>
            <button
              onClick={() => handleExport('json')}
              disabled={exporting !== null}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {exporting === 'json' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileJson className="w-4 h-4" />
                  Export JSON
                </>
              )}
            </button>
          </div>

          {/* Word Format (Future) */}
          <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 opacity-60">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <FileText className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h4 className="font-semibold">Word Format</h4>
                <p className="text-xs text-slate-400">Coming soon</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-3">
              Editable DOCX format for manual adjustments. Coming soon.
            </p>
            <button
              disabled
              className="w-full px-4 py-2 bg-slate-700 text-slate-400 rounded-lg cursor-not-allowed flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Coming Soon
            </button>
          </div>
        </div>
      </div>

      {/* Delivery Method Options */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Delivery Method Options</h3>
        
        <div className="grid md:grid-cols-2 gap-4">
          {/* Direct Download */}
          <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <h4 className="font-semibold text-green-400">Direct Download</h4>
            </div>
            <p className="text-sm text-slate-300">
              Download all documents directly from the application. Immediate access.
            </p>
          </div>

          {/* Email Delivery */}
          <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <div className="flex items-center gap-3 mb-2">
              <Mail className="w-5 h-5 text-slate-400" />
              <h4 className="font-semibold">Email Delivery</h4>
            </div>
            <p className="text-sm text-slate-300 mb-3">
              Email to client/admin automatically. Subject line includes claim reference.
            </p>
            <button
              onClick={handleEmailDelivery}
              className="px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors text-sm"
            >
              Configure Email
            </button>
          </div>
        </div>
      </div>

      {/* Package Contents */}
      <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h4 className="font-semibold mb-3">Package Contents</h4>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span>Professional Inspection Report (with watermark)</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span>Scope of Works (with watermark)</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span>Cost Estimation (with watermark)</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span>Version history & change log</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span>Raw data export (all Q&A responses)</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

