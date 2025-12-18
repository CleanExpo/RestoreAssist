"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Upload, FileText, Loader2, X, CheckCircle } from "lucide-react"
import toast from "react-hot-toast"
import ReportWorkflow from "@/components/ReportWorkflow"
import OnboardingModal from "@/components/OnboardingModal"

export default function NewReportPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadedData, setUploadedData] = useState<any>(null)
  const [fileName, setFileName] = useState<string>('')
  const [reportId, setReportId] = useState<string | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [showOnboardingModal, setShowOnboardingModal] = useState(false)
  const [hasCheckedOnboarding, setHasCheckedOnboarding] = useState(false)
  const [onboardingComplete, setOnboardingComplete] = useState(false)

  // Check onboarding status on mount (only for new reports)
  useEffect(() => {
    const urlReportId = searchParams.get('reportId')
    // Only check onboarding if creating a new report (no reportId)
    if (!urlReportId && !hasCheckedOnboarding) {
      checkOnboardingStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  // Check for reportId in URL only (don't auto-load from localStorage for new reports)
  useEffect(() => {
    const urlReportId = searchParams.get('reportId')
    
    // Only load if there's an explicit reportId in the URL
    if (urlReportId) {
      setReportId(urlReportId)
      if (typeof window !== 'undefined') {
        localStorage.setItem('currentReportId', urlReportId)
      }
      loadReportData(urlReportId)
    } else {
      // Clear localStorage when creating a new report (no reportId in URL)
      if (typeof window !== 'undefined') {
        localStorage.removeItem('currentReportId')
      }
      setReportId(null)
      setUploadedData(null)
      setFileName('')
    }
  }, [searchParams])

  const checkOnboardingStatus = async () => {
    try {
      const response = await fetch('/api/onboarding/status')
      if (response.ok) {
        const data = await response.json()
        setOnboardingComplete(data.isComplete)
        if (!data.isComplete) {
          setShowOnboardingModal(true)
          if (!hasCheckedOnboarding) {
            toast.error('Please complete onboarding before creating reports')
          }
        }
        setHasCheckedOnboarding(true)
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error)
    }
  }

  const loadReportData = async (id: string) => {
    setLoadingReport(true)
    try {
      const response = await fetch(`/api/reports/${id}`)
      if (response.ok) {
        const reportData = await response.json()
        // Set initial form data from report
        setUploadedData({
          clientName: reportData.clientName,
          clientContactDetails: reportData.clientContactDetails,
          propertyAddress: reportData.propertyAddress,
          propertyPostcode: reportData.propertyPostcode,
          claimReferenceNumber: reportData.claimReferenceNumber,
          incidentDate: reportData.incidentDate ? new Date(reportData.incidentDate).toISOString().split('T')[0] : '',
          technicianAttendanceDate: reportData.technicianAttendanceDate ? new Date(reportData.technicianAttendanceDate).toISOString().split('T')[0] : '',
          technicianName: reportData.technicianName,
          technicianFieldReport: reportData.technicianFieldReport,
        })
        toast.success('Report data loaded')
      } else {
        // Report not found, clear localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('currentReportId')
        }
        setReportId(null)
      }
    } catch (error) {
      console.error('Error loading report:', error)
    } finally {
      setLoadingReport(false)
    }
  }

  const handleComplete = () => {
    // Clear localStorage when report is complete
    if (typeof window !== 'undefined') {
      localStorage.removeItem('currentReportId')
    }
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
    setReportId(null)
    // Clear localStorage when discarding
    if (typeof window !== 'undefined') {
      localStorage.removeItem('currentReportId')
    }
    toast.success('Uploaded data discarded')
  }

  const handleStartNew = () => {
    setUploadedData(null)
    setFileName('')
    setReportId(null)
    setShowUpload(false)
    // Clear localStorage when starting new
    if (typeof window !== 'undefined') {
      localStorage.removeItem('currentReportId')
    }
    // Clear URL params if any
    router.replace('/dashboard/reports/new')
    // Reset onboarding check flag and re-check when starting new
    setHasCheckedOnboarding(false)
    setTimeout(() => {
      checkOnboardingStatus()
    }, 100)
    toast.success('Starting new report')
  }

  const handleOnboardingClose = () => {
    // Re-check onboarding status - don't allow closing if still incomplete
    checkOnboardingStatus().then(() => {
      // Only close if onboarding is now complete
      if (onboardingComplete) {
        setShowOnboardingModal(false)
      }
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-8xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
          <h1 className="text-3xl font-bold text-white mb-2">Create New Report</h1>
          <p className="text-slate-400">Complete the workflow to generate professional inspection reports, scope of works, and cost estimations</p>
          </div>
          {(reportId || uploadedData) && (
            <button
              onClick={handleStartNew}
              className="px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Start Fresh
            </button>
          )}
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

        {loadingReport ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        ) : !onboardingComplete && hasCheckedOnboarding ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="max-w-md text-center">
              <div className="inline-flex p-4 bg-amber-500/10 rounded-full mb-4">
                <FileText className="w-12 h-12 text-amber-400" />
              </div>
              <h3 className="text-2xl font-semibold text-white mb-2">Complete Onboarding First</h3>
              <p className="text-slate-400 mb-6">
                Please complete all required onboarding steps before creating a new report. This ensures your reports are generated with the correct business information and settings.
              </p>
              <button
                onClick={() => setShowOnboardingModal(true)}
                className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors"
              >
                Complete Onboarding
              </button>
            </div>
          </div>
        ) : (
          <ReportWorkflow 
            reportId={reportId || undefined}
            onComplete={handleComplete}
            initialFormData={uploadedData || undefined}
          />
        )}
      </div>

      {/* Onboarding Modal - Blocks report creation until complete */}
      <OnboardingModal
        isOpen={showOnboardingModal}
        onClose={handleOnboardingClose}
        onComplete={() => {
          setShowOnboardingModal(false)
          setOnboardingComplete(true)
          setHasCheckedOnboarding(true)
          toast.success('Onboarding complete! You can now create reports.')
        }}
      />
    </div>
  )
}

