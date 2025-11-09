"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import InitialDataEntryForm from "./InitialDataEntryForm"
import ReportAnalysisChoice from "./ReportAnalysisChoice"
import Tier1Questions from "./Tier1Questions"
import Tier2Questions from "./Tier2Questions"
import Tier3Questions from "./Tier3Questions"
import InspectionReportViewer from "./InspectionReportViewer"
import { ArrowRight, CheckCircle } from "lucide-react"

type WorkflowStage = 
  | 'initial-entry'
  | 'analysis-choice'
  | 'tier1'
  | 'tier2'
  | 'tier3'
  | 'report-generation'

interface ReportWorkflowProps {
  reportId?: string
  onComplete?: () => void
}

export default function ReportWorkflow({ reportId: initialReportId, onComplete }: ReportWorkflowProps) {
  const router = useRouter()
  const [currentStage, setCurrentStage] = useState<WorkflowStage>(initialReportId ? 'analysis-choice' : 'initial-entry')
  const [reportId, setReportId] = useState<string | null>(initialReportId || null)
  const [reportType, setReportType] = useState<'basic' | 'enhanced' | null>(null)
  const [showTier3, setShowTier3] = useState(false)

  const handleInitialEntryComplete = (newReportId: string) => {
    setReportId(newReportId)
    setCurrentStage('analysis-choice')
  }

  const handleAnalysisChoice = (choice: 'basic' | 'enhanced') => {
    setReportType(choice)
    if (choice === 'basic') {
      // Skip to report generation for basic reports
      setCurrentStage('report-generation')
    } else {
      // Go to Tier 1 for enhanced reports
      setCurrentStage('tier1')
    }
  }

  const handleTier1Complete = () => {
    setCurrentStage('tier2')
  }

  const handleTier2Complete = () => {
    // Offer Tier 3 or go to report generation
    setShowTier3(true)
    // Move to report generation stage where Tier 3 option will be shown
    setCurrentStage('report-generation')
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

  const handleTier3Complete = () => {
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
    { id: 'analysis-choice', label: 'Analysis', completed: currentStage !== 'initial-entry' && currentStage !== 'analysis-choice' },
    { id: 'tier1', label: 'Tier 1', completed: reportType === 'enhanced' && currentStage !== 'tier1' && currentStage !== 'analysis-choice' && currentStage !== 'initial-entry' },
    { id: 'tier2', label: 'Tier 2', completed: reportType === 'enhanced' && (currentStage === 'tier3' || currentStage === 'report-generation') },
    { id: 'tier3', label: 'Tier 3', completed: reportType === 'enhanced' && currentStage === 'report-generation' && showTier3 },
    { id: 'report-generation', label: 'Report', completed: false }
  ]

  const visibleStages = reportType === 'basic' 
    ? stages.filter(s => s.id === 'initial-entry' || s.id === 'analysis-choice' || s.id === 'report-generation')
    : stages

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <div className="flex items-center justify-between">
          {visibleStages.map((stage, index) => (
            <div key={stage.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  stage.completed
                    ? 'bg-green-500 text-white'
                    : currentStage === stage.id
                    ? 'bg-cyan-500 text-white'
                    : 'bg-slate-700 text-slate-400'
                }`}>
                  {stage.completed ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}
                </div>
                <span className={`text-xs mt-2 text-center ${
                  currentStage === stage.id ? 'text-cyan-400 font-medium' : 'text-slate-400'
                }`}>
                  {stage.label}
                </span>
              </div>
              {index < visibleStages.length - 1 && (
                <div className={`flex-1 h-1 mx-2 ${
                  stage.completed ? 'bg-green-500' : 'bg-slate-700'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stage Content */}
      {currentStage === 'initial-entry' && (
        <InitialDataEntryForm onSuccess={handleInitialEntryComplete} />
      )}

      {currentStage === 'analysis-choice' && reportId && (
        <ReportAnalysisChoice 
          reportId={reportId} 
          onChoiceSelected={handleAnalysisChoice}
        />
      )}

      {currentStage === 'tier1' && reportId && (
        <Tier1Questions 
          reportId={reportId}
          onComplete={handleTier1Complete}
        />
      )}

      {currentStage === 'tier2' && reportId && (
        <Tier2Questions 
          reportId={reportId}
          onComplete={handleTier2Complete}
          onSkip={handleTier2Skip}
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
          {showTier3 && currentStage === 'report-generation' && (
            <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-green-400 mb-2">Tier 3 Questions Available</h3>
                  <p className="text-sm text-slate-300">
                    You can optionally complete Tier 3 questions to optimize cost estimation and timeline prediction.
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
                className="mt-4 text-sm text-slate-400 hover:text-slate-300"
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

