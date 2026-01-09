'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Loader2, AlertCircle, Eye } from 'lucide-react'

interface PDFPreviewProps {
  submissionId: string
  templateName: string
  onDownload?: () => void
}

export function PDFPreview({ submissionId, templateName, onDownload }: PDFPreviewProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const handleDownload = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/forms/pdf/${submissionId}`)

      if (!response.ok) {
        throw new Error('Failed to download PDF')
      }

      // Create blob and download
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${templateName.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      onDownload?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download PDF')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePreview = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/forms/pdf/${submissionId}`)

      if (!response.ok) {
        throw new Error('Failed to load PDF')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setPdfUrl(url)
      setShowPreview(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PDF')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      {/* Controls */}
      <div className="flex gap-3">
        <Button
          onClick={handlePreview}
          disabled={isLoading}
          variant="outline"
          className="gap-2"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
          Preview
        </Button>

        <Button
          onClick={handleDownload}
          disabled={isLoading}
          className="gap-2"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          Download PDF
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-3">
          <AlertCircle className="text-red-600 flex-shrink-0" size={18} />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* PDF Preview Modal */}
      {showPreview && pdfUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-slate-900">{templateName}</h2>
              <button
                onClick={() => {
                  setShowPreview(false)
                  setPdfUrl(null)
                }}
                className="text-slate-500 hover:text-slate-700 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* PDF Viewer */}
            <div className="flex-1 overflow-auto">
              <iframe
                src={`${pdfUrl}#toolbar=0`}
                className="w-full h-full"
                title="PDF Preview"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t">
              <Button
                onClick={() => {
                  setShowPreview(false)
                  setPdfUrl(null)
                }}
                variant="outline"
              >
                Close
              </Button>
              <Button onClick={handleDownload} disabled={isLoading} className="gap-2">
                <Download size={16} />
                Download
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
