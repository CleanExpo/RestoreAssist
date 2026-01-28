"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Upload, FileText, Loader2, X, CheckCircle, Crown, Zap, DollarSign, ArrowRight, Sparkles, TrendingUp } from "lucide-react"
import { useSearchParams } from "next/navigation"
import toast from "react-hot-toast"
import ReportWorkflow from "@/components/ReportWorkflow"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"

export default function NewReportPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, update } = useSession()
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadedData, setUploadedData] = useState<any>(null)
  const [fileName, setFileName] = useState<string>('')
  const [reportId, setReportId] = useState<string | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [showSetupGuide, setShowSetupGuide] = useState(false)
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

  // Check for reportId or interview data in URL
  useEffect(() => {
    const urlReportId = searchParams.get('reportId')
    const interviewDataParam = searchParams.get('interviewData')
    const interviewMetadataParam = searchParams.get('interviewMetadata')
    
    // Handle interview data from guided interview
    if (interviewDataParam && interviewMetadataParam) {
      try {
        const interviewData = JSON.parse(decodeURIComponent(interviewDataParam))
        const interviewMetadata = JSON.parse(decodeURIComponent(interviewMetadataParam))
        
        console.log('Loading interview data into new report:', { interviewData, interviewMetadata })
        
        // Convert interview data to report form format
        // Map interview field IDs to report form field names
        const formData: Record<string, any> = {
          clientName: interviewData.clientName || '',
          clientContactDetails: interviewData.clientContactDetails || '',
          propertyAddress: interviewData.propertyAddress || '',
          propertyPostcode: interviewData.propertyPostcode || '',
          claimReferenceNumber: interviewData.claimReferenceNumber || '',
          incidentDate: interviewData.incidentDate || interviewData.incidentDate || '',
          technicianAttendanceDate: interviewData.technicianAttendanceDate || interviewData.technicianAttendanceDate || '',
          technicianName: interviewData.technicianName || '',
          technicianFieldReport: interviewData.technicianFieldReport || '',
          // IICRC fields
          sourceOfWater: interviewData.sourceOfWater || '',
          waterCategory: interviewData.waterCategory || '',
          waterClass: interviewData.waterClass || '',
          affectedArea: interviewData.affectedArea || interviewData.affectedAreaPercentage || '',
          // Additional fields
          buildingAge: interviewData.buildingAge || '',
          structureType: interviewData.structureType || '',
          hazardType: interviewData.hazardType || 'WATER_DAMAGE',
          insuranceType: interviewData.insuranceType || '',
        }
        
        // Handle any additional mapped fields
        Object.keys(interviewData).forEach((key) => {
          // Skip already mapped fields
          if (!formData.hasOwnProperty(key) && interviewData[key] !== null && interviewData[key] !== undefined) {
            // Map common field name variations
            const fieldMapping: Record<string, string> = {
              'timeSinceLoss': 'timeSinceLoss',
              'affectedAreaPercentage': 'affectedArea',
              'propertyId': 'propertyId',
              'jobNumber': 'jobNumber',
            }
            
            const mappedKey = fieldMapping[key] || key
            if (!formData.hasOwnProperty(mappedKey)) {
              formData[mappedKey] = interviewData[key]
            }
          }
        })
        
        setUploadedData(formData)
        toast.success(`Interview data loaded! ${interviewMetadata.fieldsCount} fields auto-populated.`, {
          duration: 5000,
          icon: '✨',
        })
        
        // Clear interview params from URL after loading
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.delete('interviewData')
        newUrl.searchParams.delete('interviewMetadata')
        window.history.replaceState({}, '', newUrl.toString())
      } catch (error) {
        console.error('Error parsing interview data:', error)
        toast.error('Failed to load interview data')
      }
    }
    
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
      if (!interviewDataParam) {
        // Only clear if not loading interview data
        setReportId(null)
        setUploadedData(null)
        setFileName('')
      }
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
          setShowSetupGuide(true)
          if (!hasCheckedOnboarding) {
            toast.error('Please complete setup before creating reports')
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

  const handleSkipSetup = async () => {
    setShowSetupGuide(false)
    await update()
    toast.success("Setup skipped! You can complete it anytime from Settings or the sidebar.", {
      duration: 4000,
      icon: "ℹ️"
    })
  }

  const handleStartSetup = async (route: string) => {
    await update()
    router.push(route)
  }

  const setupSteps = [
    {
      number: 1,
      icon: Zap,
      title: "Connect API Key",
      description: "Add your Anthropic API key to enable AI-powered report generation",
      impact: "High Impact",
      impactColor: "text-emerald-600 dark:text-emerald-400",
      impactBg: "bg-emerald-50 dark:bg-emerald-500/10",
      details: "Personalizes report generation, enables advanced AI features, and improves report quality",
      route: "/dashboard/integrations?onboarding=true",
      timeEstimate: "2 min"
    },
    {
      number: 2,
      icon: DollarSign,
      title: "Configure Pricing",
      description: "Set up your business rates for labour, equipment, and services",
      impact: "High Impact",
      impactColor: "text-emerald-600 dark:text-emerald-400",
      impactBg: "bg-emerald-50 dark:bg-emerald-500/10",
      details: "Ensures accurate cost estimations and professional quotes for your clients",
      route: "/dashboard/pricing-config?onboarding=true",
      timeEstimate: "5 min"
    },
    {
      number: 3,
      icon: FileText,
      title: "Create First Report",
      description: "Generate your first professional restoration report",
      impact: "Medium Impact",
      impactColor: "text-blue-600 dark:text-blue-400",
      impactBg: "bg-blue-50 dark:bg-blue-500/10",
      details: "Test the system and see how reports are generated with your settings",
      route: "/dashboard/reports/new?onboarding=true",
      timeEstimate: "10 min"
    }
  ]

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
        {uploadedData && fileName && (
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

        {/* Interview Data Notification */}
        {uploadedData && !fileName && searchParams.get('interviewData') && (
          <div className="mb-6 p-6 rounded-xl border-2 border-emerald-500/60 bg-gradient-to-r from-emerald-500/10 to-green-500/10 shadow-lg animate-in fade-in slide-in-from-top-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 flex-1">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shadow-lg flex-shrink-0">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mb-1">
                    Interview Data Loaded Successfully! ✨
                  </h3>
                  <p className={cn("text-sm leading-relaxed", "text-neutral-700 dark:text-slate-300")}>
                    Your guided interview responses have been automatically populated into the form below. 
                    Review the pre-filled fields and complete any remaining information before creating your report.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 text-xs font-medium">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Auto-populated from interview
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setUploadedData(null)
                  router.replace('/dashboard/reports/new')
                }}
                className="flex items-center gap-2 px-4 py-2 border border-red-600/50 text-red-400 rounded-lg hover:bg-red-600/10 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
                Clear
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
          // Modal will show automatically, so just show a loading state or empty state
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="max-w-md text-center">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500 mx-auto mb-4" />
              <h3 className={cn("text-2xl font-semibold mb-2", "text-neutral-900 dark:text-white")}>Setting up...</h3>
              <p className={cn("text-neutral-600 dark:text-slate-400")}>
                Please complete the setup steps to continue.
              </p>
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

      {/* Setup Guide Modal - Same as success page */}
      {showSetupGuide && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="max-w-2xl w-full bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 p-6 rounded-t-xl z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                    <Sparkles className="text-white" size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Complete Your Setup</h2>
                    <p className="text-sm text-gray-500 dark:text-slate-400">3 quick steps to get started</p>
                  </div>
                </div>
                <button
                  onClick={handleSkipSetup}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-gray-500 dark:text-slate-400"
                  title="Skip Setup"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-slate-400 text-center">
                Complete these steps to unlock the full potential of your account. Each step takes just a few minutes.
              </p>

              {/* Setup Steps */}
              <div className="space-y-4">
                {setupSteps.map((step, index) => {
                  const Icon = step.icon
                  return (
                    <div
                      key={step.number}
                      className="group relative p-5 rounded-xl border-2 border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 hover:border-cyan-500 dark:hover:border-cyan-500 hover:shadow-lg transition-all duration-300"
                    >
                      <div className="flex items-start gap-4">
                        {/* Step Number & Icon */}
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg">
                            <Icon className="text-white" size={24} />
                          </div>
                          <div className="mt-2 text-center">
                            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">Step {step.number}</span>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <h3 className="font-bold text-gray-900 dark:text-white text-lg">{step.title}</h3>
                              <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">{step.description}</p>
                            </div>
                            <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${step.impactBg} ${step.impactColor}`}>
                              {step.impact}
                            </div>
                          </div>

                          {/* Impact Details */}
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                            <TrendingUp size={14} />
                            <span>{step.details}</span>
                          </div>

                          {/* Time Estimate */}
                          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-slate-700">
                            <span className="text-xs text-gray-500 dark:text-slate-400">
                              ⏱️ Est. {step.timeEstimate}
                            </span>
                            <button
                              onClick={async () => {
                                await handleStartSetup(step.route)
                              }}
                              className="px-4 py-1.5 text-sm bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-cyan-500/50 transition-all flex items-center gap-2 group/btn"
                            >
                              Start
                              <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="sticky bottom-0 bg-gray-50 dark:bg-slate-800/80 border-t border-gray-200 dark:border-slate-700 p-6 rounded-b-xl backdrop-blur-sm">
              <div className="flex gap-3">
                <button
                  onClick={handleSkipSetup}
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors text-gray-700 dark:text-slate-300 font-medium"
                >
                  Skip Setup
                </button>
                <button
                  onClick={async () => {
                    await update()
                    router.push('/dashboard/subscription')
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors text-gray-700 dark:text-slate-300 font-medium"
                >
                  View Subscription
                </button>
              </div>
              <p className="text-xs text-center text-gray-500 dark:text-slate-400 mt-3">
                You can complete setup anytime from Settings or the sidebar
              </p>
            </div>
          </div>
        </div>
      )}

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

