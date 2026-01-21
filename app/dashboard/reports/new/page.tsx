"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Upload, FileText, Loader2, X, CheckCircle, Crown } from "lucide-react"
import toast from "react-hot-toast"
import ReportWorkflow from "@/components/ReportWorkflow"
import OnboardingModal from "@/components/OnboardingModal"
import { cn } from "@/lib/utils"

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
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [hasCheckedCredits, setHasCheckedCredits] = useState(false)
  const [canCreateReport, setCanCreateReport] = useState(false)
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null)

  // Fetch subscription status on mount (always needed for feature gating)
  useEffect(() => {
    fetchSubscriptionStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Check credits and onboarding status on mount (only for new reports)
  useEffect(() => {
    const urlReportId = searchParams.get('reportId')
    // Only check if creating a new report (no reportId)
    if (!urlReportId && !hasCheckedCredits) {
      checkCreditsAndOnboarding()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  const checkCreditsAndOnboarding = async () => {
    try {
      // Fetch subscription status first (needed for feature gating)
      await fetchSubscriptionStatus()

      // First check if user can create a report (credits check)
      const canCreateResponse = await fetch('/api/reports/check-credits')
      if (canCreateResponse.ok) {
        const canCreateData = await canCreateResponse.json()
        const allowed = typeof canCreateData.allowed === "boolean" ? canCreateData.allowed : !!canCreateData.canCreate

        if (!allowed) {
          // No credits available - show upgrade modal
          setShowUpgradeModal(true)
          setCanCreateReport(false)
          setHasCheckedCredits(true)
          return
        }

        setCanCreateReport(true)
      } else {
        // If API fails, assume they can't create (show upgrade modal)
        setShowUpgradeModal(true)
        setCanCreateReport(false)
        setHasCheckedCredits(true)
        return
      }

      // If credits are available, check onboarding
      if (!hasCheckedOnboarding) {
        await checkOnboardingStatus()
      }
      setHasCheckedCredits(true)
    } catch (error) {
      console.error('Error checking credits:', error)
      // On error, show upgrade modal to be safe
      setShowUpgradeModal(true)
      setCanCreateReport(false)
      setHasCheckedCredits(true)
    }
  }

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await fetch('/api/user/profile')
      if (response.ok) {
        const data = await response.json()
        // The API returns subscriptionStatus in data.profile.subscriptionStatus
        const status = data?.profile?.subscriptionStatus || data?.subscriptionStatus
        if (status) {
          console.log('[NewReportPage] Fetched subscription status:', status)
          setSubscriptionStatus(status)
        } else {
          console.warn('[NewReportPage] No subscription status found in response:', data)
        }
      }
    } catch (error) {
      console.error('Error fetching subscription status:', error)
    }
  }

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
        
        // Check if subscription is incomplete FIRST
        const subscriptionStep = data.steps?.subscription
        if (subscriptionStep && !subscriptionStep.completed) {
          // Subscription not complete - redirect to pricing
          toast.error('Please upgrade your package to create reports')
          router.push('/dashboard/pricing')
          setHasCheckedOnboarding(true)
          return
        }
        
        // If subscription is complete, check other steps
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
      // Fetch subscription status when loading existing report
      await fetchSubscriptionStatus()

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
    if (subscriptionStatus === 'TRIAL') {
      toast.error('Upload PDF is available on paid plans. Upgrade to use this feature.')
      e.target.value = ''
      return
    }

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
    <div className={cn("min-h-screen p-6", "bg-gradient-to-br from-neutral-50 via-white to-neutral-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950")}>
      <div className="max-w-8xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
          <h1 className={cn("text-3xl font-bold mb-2", "text-neutral-900 dark:text-white")}>Create New Report</h1>
          <p className={cn("text-neutral-600 dark:text-slate-400")}>Complete the workflow to generate professional inspection reports, scope of works, and cost estimations</p>
          </div>
          {(reportId || uploadedData) && (
            <button
              onClick={handleStartNew}
              className={cn(
                "px-4 py-2 border rounded-lg transition-colors",
                "border-neutral-300 dark:border-slate-600",
                "text-neutral-700 dark:text-slate-300",
                "hover:bg-neutral-100 dark:hover:bg-slate-800"
              )}
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
                  <p className={cn("text-sm", "text-neutral-700 dark:text-slate-300")}>Upload a PDF report to extract data and populate the form</p>
                </div>
              </div>
              <div className="flex gap-2">
                {!showUpload ? (
                  <button
                    disabled={subscriptionStatus === 'TRIAL'}
                    onClick={() => setShowUpload(true)}
                    className={cn(
                      "px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors",
                      "disabled:bg-neutral-300 disabled:text-neutral-500 disabled:cursor-not-allowed"
                    )}
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
                      className={cn(
                        "px-4 py-2 border rounded-lg transition-colors",
                        "border-neutral-300 dark:border-slate-600",
                        "text-neutral-700 dark:text-slate-300",
                        "hover:bg-neutral-100 dark:hover:bg-slate-700/50"
                      )}
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
                  <p className={cn("text-sm", "text-neutral-700 dark:text-slate-300")}>
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
              <div className={cn("w-full border-t", "border-neutral-300 dark:border-slate-700")}></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className={cn("px-4", "bg-white dark:bg-slate-950", "text-neutral-600 dark:text-slate-400")}>OR</span>
            </div>
          </div>
        )}

        {/* Create New Report Workflow */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-4">
            <FileText className={cn("w-5 h-5", "text-neutral-600 dark:text-slate-400")} />
            <h2 className={cn("text-xl font-semibold", "text-neutral-900 dark:text-white")}>
              {uploadedData ? 'Review and Complete Report' : 'Create New Report'}
            </h2>
          </div>
        </div>

        {loadingReport ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        ) : !canCreateReport && hasCheckedCredits ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="max-w-md text-center">
              <div className="inline-flex p-4 bg-amber-500/10 rounded-full mb-4">
                <Crown className="w-12 h-12 text-amber-400" />
              </div>
              <h3 className={cn("text-2xl font-semibold mb-2", "text-neutral-900 dark:text-white")}>Upgrade Required</h3>
              <p className={cn("mb-6", "text-neutral-600 dark:text-slate-400")}>
                You've used all your free credits. Please upgrade your package to create more reports.
              </p>
              <button
                onClick={() => router.push('/dashboard/pricing')}
                className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto"
              >
                <Crown className="w-4 h-4" />
                Upgrade Package
              </button>
            </div>
          </div>
        ) : !onboardingComplete && hasCheckedOnboarding ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="max-w-md text-center">
              <div className="inline-flex p-4 bg-amber-500/10 rounded-full mb-4">
                <FileText className="w-12 h-12 text-amber-400" />
              </div>
              <h3 className={cn("text-2xl font-semibold mb-2", "text-neutral-900 dark:text-white")}>Complete Onboarding First</h3>
              <p className={cn("mb-6", "text-neutral-600 dark:text-slate-400")}>
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
        ) : canCreateReport && (onboardingComplete || !hasCheckedOnboarding) ? (
          <ReportWorkflow 
            reportId={reportId || undefined}
            onComplete={handleComplete}
            initialFormData={uploadedData || undefined}
            subscriptionStatus={subscriptionStatus || undefined}
          />
        ) : null}
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

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-neutral-200 dark:border-slate-700 max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 flex items-center justify-center">
                  <Crown className="text-white" size={24} />
                </div>
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Upgrade Required</h2>
              </div>
              <button 
                onClick={() => {
                  setShowUpgradeModal(false)
                  router.push('/dashboard/reports')
                }} 
                className="p-1 hover:bg-neutral-100 dark:hover:bg-slate-700 rounded transition-all duration-200 hover:scale-110 active:scale-95 text-neutral-600 dark:text-slate-300"
                title="Close"
              >
                <X size={20} className="transition-transform duration-200" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-neutral-700 dark:text-slate-300">
                You've used all your free credits. To create more reports, you need to upgrade to a Monthly or Yearly plan.
              </p>
              <p className="text-sm text-neutral-600 dark:text-slate-400">
                Upgrade now to unlock unlimited reports, client management, API integrations, and priority support.
              </p>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowUpgradeModal(false)
                    router.push('/dashboard/reports')
                  }}
                  className="flex-1 px-4 py-2 border border-neutral-300 dark:border-slate-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-slate-700/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md text-neutral-700 dark:text-slate-300"
                >
                  Maybe Later
                </button>
                <button
                  onClick={() => {
                    setShowUpgradeModal(false)
                    router.push('/dashboard/pricing')
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg font-medium hover:shadow-lg hover:shadow-orange-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 group text-white"
                >
                  <Crown className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                  <span>Upgrade Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

