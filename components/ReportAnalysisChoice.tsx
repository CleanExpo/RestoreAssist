"use client"

import { useState, useEffect } from "react"
import { FileText, Sparkles, CheckCircle, AlertCircle, ArrowRight, Loader2 } from "lucide-react"
import toast from "react-hot-toast"
import { useRouter } from "next/navigation"

interface AnalysisResult {
  affectedAreas: string[]
  waterSource: string
  waterCategory: string
  affectedMaterials: string[]
  equipmentDeployed: string[]
  moistureReadings: string[]
  hazardsIdentified: string[]
  observations: string
  complexityLevel: "simple" | "moderate" | "complex"
}

interface ReportAnalysisChoiceProps {
  reportId: string
  onChoiceSelected: (choice: 'basic' | 'enhanced') => void
}

export default function ReportAnalysisChoice({ reportId, onChoiceSelected }: ReportAnalysisChoiceProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)

  useEffect(() => {
    fetchAnalysis()
  }, [reportId])

  const fetchAnalysis = async () => {
    try {
      const response = await fetch(`/api/reports/${reportId}`)
      if (response.ok) {
        const data = await response.json()
        // API returns report directly, and technicianReportAnalysis is already parsed
        if (data && data.technicianReportAnalysis) {
          setAnalysis(data.technicianReportAnalysis)
          setLoading(false)
        } else {
          // No analysis yet, trigger it
          await triggerAnalysis()
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
        setLoading(false)
      }
    } catch (error) {
      console.error('Error fetching report:', error)
      toast.error('Failed to load report')
      setLoading(false)
    }
  }

  const triggerAnalysis = async () => {
    setAnalyzing(true)
    try {
      const response = await fetch('/api/reports/analyze-technician-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.analysis) {
          setAnalysis(data.analysis)
          toast.success('Report analyzed successfully')
        } else {
          console.error('Unexpected response structure:', data)
          toast.error('Failed to parse analysis response')
        }
      } else {
        let errorMessage = 'Failed to analyze report'
        try {
          const error = await response.json()
          errorMessage = error.error || errorMessage
        } catch (e) {
          errorMessage = `Server error: ${response.status} ${response.statusText}`
        }
        toast.error(errorMessage)
      }
    } catch (error) {
      console.error('Error analyzing report:', error)
      toast.error('Failed to analyze report')
    } finally {
      setAnalyzing(false)
      setLoading(false)
    }
  }

  const handleChoice = (choice: 'basic' | 'enhanced') => {
    onChoiceSelected(choice)
  }

  if (loading || analyzing) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
        <p className="text-slate-400">
          {analyzing ? 'Analyzing technician report...' : 'Loading...'}
        </p>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-slate-400 mb-4">Failed to load analysis</p>
        <button
          onClick={triggerAnalysis}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg"
        >
          Retry Analysis
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Analysis Summary */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-cyan-400" />
          Report Analysis Summary
        </h2>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-2">Affected Areas</h3>
            <div className="flex flex-wrap gap-2">
              {analysis.affectedAreas.length > 0 ? (
                analysis.affectedAreas.map((area, idx) => (
                  <span key={idx} className="px-3 py-1 bg-cyan-500/20 text-cyan-300 rounded-full text-sm">
                    {area}
                  </span>
                ))
              ) : (
                <span className="text-slate-500 text-sm">Not specified</span>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-2">Water Source</h3>
            <p className="text-white">{analysis.waterSource || 'Not specified'}</p>
            {analysis.waterCategory && (
              <span className="inline-block mt-2 px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs">
                Category {analysis.waterCategory}
              </span>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-2">Affected Materials</h3>
            <div className="flex flex-wrap gap-2">
              {analysis.affectedMaterials.length > 0 ? (
                analysis.affectedMaterials.map((material, idx) => (
                  <span key={idx} className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm">
                    {material}
                  </span>
                ))
              ) : (
                <span className="text-slate-500 text-sm">Not specified</span>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-2">Equipment Deployed</h3>
            <div className="flex flex-wrap gap-2">
              {analysis.equipmentDeployed.length > 0 ? (
                analysis.equipmentDeployed.map((equipment, idx) => (
                  <span key={idx} className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-sm">
                    {equipment}
                  </span>
                ))
              ) : (
                <span className="text-slate-500 text-sm">Not specified</span>
              )}
            </div>
          </div>
        </div>

        {analysis.hazardsIdentified.length > 0 && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <h3 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Hazards Identified
            </h3>
            <div className="flex flex-wrap gap-2">
              {analysis.hazardsIdentified.map((hazard, idx) => (
                <span key={idx} className="px-3 py-1 bg-red-500/20 text-red-300 rounded-full text-sm">
                  {hazard}
                </span>
              ))}
            </div>
          </div>
        )}

        {analysis.observations && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-slate-400 mb-2">Key Observations</h3>
            <p className="text-slate-300 text-sm">{analysis.observations}</p>
          </div>
        )}
      </div>

      {/* Choice Options */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Option A: Basic Report */}
        <button
          onClick={() => handleChoice('basic')}
          className="p-6 rounded-lg border-2 border-slate-600 hover:border-blue-500 bg-slate-800/30 hover:bg-slate-800/50 transition-all text-left group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                <FileText className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Basic Report</h3>
                <p className="text-sm text-slate-400">Quick Processing</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-blue-400 transition-colors" />
          </div>
          
          <p className="text-slate-300 mb-4">
            Suitable for straightforward, simple claims
          </p>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <CheckCircle className="w-4 h-4" />
              <span>Areas affected</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <CheckCircle className="w-4 h-4" />
              <span>Observations from technician</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <CheckCircle className="w-4 h-4" />
              <span>Equipment deployed</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <CheckCircle className="w-4 h-4" />
              <span>Reference to IICRC standards</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <CheckCircle className="w-4 h-4" />
              <span>Any obvious hazards flagged</span>
            </div>
          </div>
        </button>

        {/* Option B: Enhanced Report */}
        <button
          onClick={() => handleChoice('enhanced')}
          className="p-6 rounded-lg border-2 border-cyan-500 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/20 hover:to-blue-500/20 transition-all text-left group relative"
        >
          <div className="absolute top-4 right-4">
            <span className="px-3 py-1 bg-cyan-500 text-white text-xs font-semibold rounded-full">
              RECOMMENDED
            </span>
          </div>

          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-cyan-500/30 flex items-center justify-center group-hover:bg-cyan-500/40 transition-colors">
                <Sparkles className="w-6 h-6 text-cyan-300" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Enhanced Report</h3>
                <p className="text-sm text-cyan-400">Depth Analysis</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
          </div>
          
          <p className="text-slate-300 mb-4">
            Recommended for complex claims with detailed questioning system
          </p>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <CheckCircle className="w-4 h-4 text-cyan-400" />
              <span>All Basic Report features</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <CheckCircle className="w-4 h-4 text-cyan-400" />
              <span>Detailed tiered questioning</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <CheckCircle className="w-4 h-4 text-cyan-400" />
              <span>Comprehensive scope of works</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <CheckCircle className="w-4 h-4 text-cyan-400" />
              <span>Detailed cost estimation</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <CheckCircle className="w-4 h-4 text-cyan-400" />
              <span>Richer, more comprehensive reports</span>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}

