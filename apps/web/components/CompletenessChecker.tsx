"use client"

import { AlertCircle, CheckCircle, Info, RefreshCw, XCircle } from "lucide-react"
import { useEffect, useState } from "react"

interface CompletenessCheckerProps {
  reportId: string
  onCompletenessChange?: (score: number, canGenerate: boolean) => void
}

export default function CompletenessChecker({ reportId, onCompletenessChange }: CompletenessCheckerProps) {
  const [loading, setLoading] = useState(true)
  const [completeness, setCompleteness] = useState<any>(null)

  useEffect(() => {
    fetchCompleteness()
  }, [reportId])

  const fetchCompleteness = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/reports/${reportId}/completeness-check`)
      if (response.ok) {
        const data = await response.json()
        setCompleteness(data)
        if (onCompletenessChange) {
          onCompletenessChange(data.completenessScore, data.canGenerate)
        }
      }
    } catch (error) {
      console.error('Error fetching completeness:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <RefreshCw className="w-4 h-4 animate-spin text-cyan-500" />
      </div>
    )
  }

  if (!completeness) {
    return null
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400'
    if (score >= 50) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-500/20'
    if (score >= 50) return 'bg-yellow-500/20'
    return 'bg-red-500/20'
  }

  return (
    <div className="space-y-4">
      {/* Overall Completeness Score */}
      <div className={`p-4 rounded-lg border-2 ${completeness.canGenerate ? 'border-green-500/50 bg-green-500/10' : 'border-amber-500/50 bg-amber-500/10'}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {completeness.canGenerate ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400" />
            )}
            <h3 className="text-lg font-semibold">
              Report Completeness: {completeness.completenessScore}%
            </h3>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-semibold ${getScoreColor(completeness.completenessScore)} ${getScoreBgColor(completeness.completenessScore)}`}>
            {completeness.completenessScore}%
          </div>
        </div>

        <div className="w-full bg-slate-700 rounded-full h-2 mt-3">
          <div 
            className={`h-2 rounded-full transition-all ${
              completeness.completenessScore >= 80 ? 'bg-green-500' :
              completeness.completenessScore >= 50 ? 'bg-yellow-500' :
              'bg-red-500'
            }`}
            style={{ width: `${completeness.completenessScore}%` }}
          />
        </div>
      </div>

      {/* Section Breakdown */}
      <div className="grid md:grid-cols-3 gap-4">
        {Object.entries(completeness.sections || {}).map(([key, section]: [string, any]) => (
          <div key={key} className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-300">{section.label}</span>
              {section.completed ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
            </div>
            <div className="text-xs text-slate-400">{section.details || (section.completed ? 'Complete ✓' : 'Incomplete')}</div>
            <div className="mt-2 w-full bg-slate-700 rounded-full h-1">
              <div 
                className={`h-1 rounded-full ${section.completed ? 'bg-green-500' : 'bg-slate-600'}`}
                style={{ width: `${section.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Missing Items */}
      {completeness.missingItems && completeness.missingItems.length > 0 && (
        <div className="p-4 rounded-lg border border-red-500/50 bg-red-500/10">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="w-5 h-5 text-red-400" />
            <h4 className="font-semibold text-red-400">Missing Required Items</h4>
          </div>
          <ul className="space-y-1">
            {completeness.missingItems.map((item: string, idx: number) => (
              <li key={idx} className="text-sm text-slate-300 flex items-center gap-2">
                <span className="text-red-400">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {completeness.warnings && completeness.warnings.length > 0 && (
        <div className="p-4 rounded-lg border border-amber-500/50 bg-amber-500/10">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-amber-400" />
            <h4 className="font-semibold text-amber-400">Warnings</h4>
          </div>
          <ul className="space-y-1">
            {completeness.warnings.map((warning: string, idx: number) => (
              <li key={idx} className="text-sm text-slate-300 flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-400" />
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={fetchCompleteness}
          className="flex items-center gap-2 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
        {!completeness.canGenerate && (
          <div className="flex-1 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
            <p className="text-sm text-slate-400">
              Complete all required sections before generating final documents.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

