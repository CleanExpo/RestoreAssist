"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Upload, FileText, Loader2, X, CheckCircle } from "lucide-react"
import toast from "react-hot-toast"
import ReportWorkflow from "@/components/ReportWorkflow"

export default function NewReportPage() {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadedData, setUploadedData] = useState<any>(null)
  const [fileName, setFileName] = useState<string>('')

  const handleComplete = () => {
    router.push("/dashboard/reports")
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF file')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await fetch('/api/reports/upload', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        setUploadedData(data.parsedData)
        setFileName(file.name)
        toast.success('PDF uploaded and data extracted! Please review and complete the form below.')
        setShowUpload(false)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to upload PDF')
      }
    } catch (error) {
      toast.error('Failed to upload PDF')
    } finally {
      setUploading(false)
      e.target.value = '' // Reset file input
    }
  }

  const handleDiscardUpload = () => {
    setUploadedData(null)
    setFileName('')
    toast.success('Uploaded data discarded')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-8xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Create New Report</h1>
          <p className="text-slate-400">Complete the workflow to generate professional inspection reports, scope of works, and cost estimations</p>
            </div>

        {/* Upload Option */}
        {!uploadedData && (
          <div className="mb-6 p-6 rounded-lg border border-cyan-500/50 bg-cyan-500/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Upload className="w-6 h-6 text-cyan-400" />
                <div>
                  <h3 className="text-lg font-semibold text-cyan-400">Upload Existing Report</h3>
                  <p className="text-sm text-slate-300">Upload a PDF report to extract data and populate the form</p>
                </div>
              </div>
              <div className="flex gap-2">
                {!showUpload ? (
                  <button
                    onClick={() => setShowUpload(true)}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
                  >
                    Upload PDF
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <label className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors cursor-pointer">
                      {uploading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Uploading...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Upload className="w-4 h-4" />
                          Choose PDF File
                        </span>
                      )}
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={handleFileUpload}
                        disabled={uploading}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={() => setShowUpload(false)}
                      className="px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
                      disabled={uploading}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Uploaded Data Notification */}
        {uploadedData && (
          <div className="mb-6 p-6 rounded-lg border border-green-500/50 bg-green-500/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-400" />
                <div>
                  <h3 className="text-lg font-semibold text-green-400">PDF Data Extracted</h3>
                  <p className="text-sm text-slate-300">
                    Data from <strong>{fileName}</strong> has been extracted and populated in the form below. 
                    Please review and complete any missing fields before saving.
                  </p>
                </div>
              </div>
              <button
                onClick={handleDiscardUpload}
                className="flex items-center gap-2 px-4 py-2 border border-red-600/50 text-red-400 rounded-lg hover:bg-red-600/10 transition-colors"
              >
                <X className="w-4 h-4" />
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Divider - only show if no uploaded data */}
        {!uploadedData && (
          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-slate-950 text-slate-400">OR</span>
            </div>
          </div>
        )}

        {/* Create New Report Workflow */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-slate-400" />
            <h2 className="text-xl font-semibold text-white">
              {uploadedData ? 'Review and Complete Report' : 'Create New Report'}
            </h2>
          </div>
        </div>

        <ReportWorkflow 
          onComplete={handleComplete}
          initialFormData={uploadedData || undefined}
        />
      </div>
    </div>
  )
}

