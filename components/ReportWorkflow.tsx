"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import InitialDataEntryForm from "./InitialDataEntryForm"
import Tier1Questions from "./Tier1Questions"
import Tier2Questions from "./Tier2Questions"
import Tier3Questions from "./Tier3Questions"
import InspectionReportViewer from "./InspectionReportViewer"
import { ArrowRight, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type WorkflowStage = 
  | 'initial-entry'
  | 'tier1'
  | 'tier2'
  | 'tier3'
  | 'report-generation'

interface ReportWorkflowProps {
  reportId?: string
  onComplete?: () => void
  initialFormData?: {
    clientName?: string
    clientContactDetails?: string
    propertyAddress?: string
    propertyPostcode?: string
    claimReferenceNumber?: string
    incidentDate?: string
    technicianAttendanceDate?: string
    technicianName?: string
    technicianFieldReport?: string
  }
}

export default function ReportWorkflow({ reportId: initialReportId, onComplete, initialFormData }: ReportWorkflowProps) {
  const router = useRouter()
  const [currentStage, setCurrentStage] = useState<WorkflowStage>(initialReportId ? 'report-generation' : 'initial-entry')
  const [reportId, setReportId] = useState<string | null>(initialReportId || null)
  const [reportType, setReportType] = useState<'basic' | 'enhanced' | 'optimised' | null>(null)
  const [showTier3, setShowTier3] = useState(false)
  const [loading, setLoading] = useState(!!initialReportId)
  const [report, setReport] = useState<any>(null)

  // Load report data and determine current stage
  useEffect(() => {
    if (initialReportId) {
      loadReportState(initialReportId)
    }
  }, [initialReportId])

  // Fetch report data when in report-generation stage to check Tier 3 completion
  useEffect(() => {
    if (currentStage === 'report-generation' && reportId) {
      // Always refresh report data when entering report-generation stage
      loadReportState(reportId)
    }
  }, [currentStage, reportId])

  const loadReportState = async (id: string) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/reports/${id}`)
      if (response.ok) {
        const reportData = await response.json()
        setReport(reportData)
        
        // Determine report type
        if (reportData.reportDepthLevel) {
          const depthLevel = reportData.reportDepthLevel.toLowerCase()
          if (depthLevel === 'optimised' || depthLevel === 'optimized') {
            setReportType('optimised')
            // Only show Tier 3 option if not already completed
            if (!reportData.tier3Responses) {
              setShowTier3(true)
            } else {
              setShowTier3(false)
            }
          } else {
            setReportType(depthLevel as 'basic' | 'enhanced')
          }
        }
        
        // Determine current stage based on what data exists
        const depthLevel = reportData.reportDepthLevel?.toLowerCase()
        const isBasic = depthLevel === 'basic'
        const isEnhanced = depthLevel === 'enhanced'
        const isOptimised = depthLevel === 'optimised' || depthLevel === 'optimized'
        
        if (reportData.detailedReport) {
          setCurrentStage('report-generation')
        } else if (reportData.tier3Responses) {
          setCurrentStage('report-generation')
          setShowTier3(false) // Tier 3 is completed, hide the banner
        } else if (reportData.tier2Responses) {
          setCurrentStage('report-generation')
          // Only show Tier 3 option if not already completed and report type is optimised
          if (!reportData.tier3Responses && isOptimised) {
            setShowTier3(true)
          } else {
            setShowTier3(false)
          }
        } else if (reportData.tier1Responses) {
          // If Tier 1 is complete, check report type
          if (isEnhanced) {
            // Enhanced: can generate report or continue to Tier 2
            setCurrentStage('report-generation')
          } else if (isOptimised) {
            // Optimised: must continue to Tier 2
            setCurrentStage('tier2')
          } else {
            // Basic: should not have Tier 1, but if it does, go to report generation
            setCurrentStage('report-generation')
          }
        } else if (reportData.technicianReportAnalysis || reportData.reportDepthLevel) {
          // Check if basic report - skip Tier 1
          if (isBasic) {
            setCurrentStage('report-generation')
          } else {
            // Enhanced or Optimised need Tier 1
            setCurrentStage('tier1')
          }
        } else if (reportData.technicianFieldReport) {
          setCurrentStage('initial-entry')
        } else {
          setCurrentStage('initial-entry')
        }
        
        // Store reportId in localStorage for persistence
        if (typeof window !== 'undefined') {
          localStorage.setItem('currentReportId', id)
        }
      }
    } catch (error) {
      console.error('Error loading report state:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInitialEntryComplete = (newReportId: string, reportType?: 'basic' | 'enhanced' | 'optimised') => {
    setReportId(newReportId)
    // Store in localStorage for persistence
    if (typeof window !== 'undefined') {
      localStorage.setItem('currentReportId', newReportId)
    }

    if (reportType) {
      setReportType(reportType)
      if (reportType === 'basic') {
        // Skip to report generation for basic reports
        setCurrentStage('report-generation')
      } else if (reportType === 'enhanced') {
        // Go to Tier 1 for enhanced reports
        setCurrentStage('tier1')
      } else if (reportType === 'optimised') {
        // Go to Tier 1 for optimised reports (will continue through all tiers)
        setCurrentStage('tier1')
        setShowTier3(true) // Optimised always includes Tier 3
      }
    } else {
      // If no report type selected yet, wait for user to select (handled in form)
      // This shouldn't happen with the merged form, but keep as fallback
      setCurrentStage('report-generation')
    }
  }

  const handleTier1Complete = () => {
    if (reportType === 'optimised') {
      // Optimised always goes through Tier 2 and Tier 3
      setCurrentStage('tier2')
    } else if (reportType === 'enhanced') {
      // Enhanced: Show options to generate Enhanced report or continue to Tier 2
      // Don't automatically move - wait for user choice
      // The Tier1Questions component will handle showing the options
    }
  }

  const handleTier1GenerateEnhanced = () => {
    // User chose to generate Enhanced report after Tier 1
    setCurrentStage('report-generation')
  }

  const handleTier1ContinueToTier2 = () => {
    // User chose to continue to Tier 2
    setCurrentStage('tier2')
  }

  const handleTier2Complete = () => {
    if (reportType === 'optimised') {
      // Optimised always goes to Tier 3
      setCurrentStage('tier3')
    } else if (reportType === 'enhanced') {
      // Enhanced: Show options to generate Optimised report or continue to Tier 3
      // Don't automatically move - wait for user choice
      // The Tier2Questions component will handle showing the options
    }
  }

  const handleTier2GenerateOptimised = () => {
    // User chose to generate Optimised report after Tier 2
    setReportType('optimised')
    setCurrentStage('report-generation')
  }

  const handleTier2ContinueToTier3 = () => {
    // User chose to continue to Tier 3
    setShowTier3(true)
    setCurrentStage('tier3')
  }

  const handleTier2Skip = () => {
    setCurrentStage('report-generation')
  }

  const handleTier3Start = () => {
    setCurrentStage('tier3')
  }

  const handleTier3Skip = () => {
    setCurrentStage('report-generation')
  }

  const handleTier3Complete = async () => {
    // Refresh report data to check if Tier 3 is completed
    if (reportId) {
      await loadReportState(reportId)
    }
    setCurrentStage('report-generation')
  }

  const handleReportGenerated = () => {
    if (onComplete) {
      onComplete()
    } else {
      // Navigate to report detail page
      router.push(`/dashboard/reports/${reportId}`)
    }
  }

  // Progress indicator
  const stages = [
    { id: 'initial-entry', label: 'Initial Entry', completed: currentStage !== 'initial-entry' },
    { id: 'tier1', label: 'Tier 1', completed: reportType === 'enhanced' && currentStage !== 'tier1' && currentStage !== 'initial-entry' },
    { id: 'tier2', label: 'Tier 2', completed: reportType === 'enhanced' && (currentStage === 'tier3' || currentStage === 'report-generation') },
    { id: 'tier3', label: 'Tier 3', completed: reportType === 'enhanced' && currentStage === 'report-generation' && showTier3 },
    { id: 'report-generation', label: 'Report', completed: false }
  ]

  const visibleStages = reportType === 'basic' 
    ? stages.filter(s => s.id === 'initial-entry' || s.id === 'report-generation')
    : reportType === 'enhanced'
    ? stages.filter(s => s.id !== 'tier3' || showTier3)
    : stages // optimised shows all stages

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className={cn("p-4 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-neutral-50 dark:bg-slate-800/30")}>
        <div className="flex items-center justify-between">
          {visibleStages.map((stage, index) => (
            <div key={stage.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                  stage.completed
                    ? 'bg-green-500 text-white'
                    : currentStage === stage.id
                    ? 'bg-cyan-500 text-white'
                    : cn("bg-neutral-300 dark:bg-slate-700", "text-neutral-600 dark:text-slate-400")
                )}>
                  {stage.completed ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}
                </div>
                <span className={cn(
                  "text-xs mt-2 text-center",
                  currentStage === stage.id 
                    ? 'text-cyan-600 dark:text-cyan-400 font-medium' 
                    : cn("text-neutral-600 dark:text-slate-400")
                )}>
                  {stage.label}
                </span>
              </div>
              {index < visibleStages.length - 1 && (
                <div className={cn(
                  "flex-1 h-1 mx-2",
                  stage.completed 
                    ? 'bg-green-500' 
                    : cn("bg-neutral-300 dark:bg-slate-700")
                )} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stage Content */}
      {currentStage === 'initial-entry' && (
        <InitialDataEntryForm 
          onSuccess={handleInitialEntryComplete}
          initialReportId={reportId}
          initialData={initialFormData}
        />
      )}

      {currentStage === 'tier1' && reportId && (
        <Tier1Questions 
          reportId={reportId}
          onComplete={handleTier1Complete}
          onGenerateEnhanced={handleTier1GenerateEnhanced}
          onContinueToTier2={handleTier1ContinueToTier2}
          reportType={reportType || undefined}
        />
      )}

      {currentStage === 'tier2' && reportId && (
        <Tier2Questions 
          reportId={reportId}
          onComplete={handleTier2Complete}
          onSkip={handleTier2Skip}
          onGenerateOptimised={handleTier2GenerateOptimised}
          onContinueToTier3={handleTier2ContinueToTier3}
          reportType={reportType || undefined}
        />
      )}

      {currentStage === 'tier3' && reportId && (
        <Tier3Questions 
          reportId={reportId}
          onComplete={handleTier3Complete}
        />
      )}

      {currentStage === 'report-generation' && reportId && (
        <div className="space-y-6">
          {showTier3 && currentStage === 'report-generation' && !report?.tier3Responses && (
            <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-green-400 mb-2">Tier 3 Questions Available</h3>
                  <p className={cn("text-sm", "text-neutral-700 dark:text-slate-300")}>
                    You can optionally complete Tier 3 questions to optimise cost estimation and timeline prediction.
                  </p>
                </div>
                <button
                  onClick={handleTier3Start}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  Complete Tier 3
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={handleTier3Skip}
                className={cn("mt-4 text-sm transition-colors", "text-neutral-600 dark:text-slate-400", "hover:text-neutral-800 dark:hover:text-slate-300")}
              >
                Skip and generate report
              </button>
            </div>
          )}
          <InspectionReportViewer 
            reportId={reportId}
            onReportGenerated={handleReportGenerated}
          />
        </div>
      )}
    </div>
  )
}

