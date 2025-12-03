"use client"

import { useState, useEffect } from "react"
import { CheckCircle, Save, ArrowRight } from "lucide-react"
import toast from "react-hot-toast"

interface Tier3QuestionsProps {
  reportId: string
  onComplete: (responses: any) => void
}

export default function Tier3Questions({ reportId, onComplete }: Tier3QuestionsProps) {
  const [loading, setLoading] = useState(false)
  const [responses, setResponses] = useState({
    T3_Q1_timelineRequirements: '',
    T3_Q1_timelineRequirementsOther: '',
    T3_Q2_dryingPreferences: '',
    T3_Q3_chemicalTreatment: '',
    T3_Q4_totalAffectedArea: '',
    T3_Q5_class4DryingAssessment: ''
  })

  useEffect(() => {
    fetchExistingResponses()
  }, [reportId])

  const fetchExistingResponses = async () => {
    try {
      const response = await fetch(`/api/reports/${reportId}`)
      if (response.ok) {
        const data = await response.json()
        // API returns report directly, and tier3Responses is already parsed
        if (data && data.tier3Responses) {
          setResponses(data.tier3Responses)
        }
      }
    } catch (error) {
      console.error('Error fetching existing responses:', error)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/reports/save-tier-responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          tier: 3,
          responses
        })
      })

      if (response.ok) {
        toast.success('Tier 3 responses saved successfully')
        onComplete(responses)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to save responses')
      }
    } catch (error) {
      console.error('Error saving responses:', error)
      toast.error('Failed to save responses')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg border-2 border-green-500/50 bg-green-500/10">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <h2 className="text-xl font-semibold text-green-400">TIER 3: OPTIMISATION QUESTIONS</h2>
        </div>
        <p className="text-sm text-slate-300">
          These questions optimise cost estimation and timeline prediction. All questions are optional.
        </p>
      </div>

      {/* T3_Q1: Timeline Requirements */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T3_Q1: Timeline Requirements</h3>
        <div className="space-y-2">
          {[
            'ASAP (emergency — consider after-hours rates)',
            'Within 7 days',
            'Within 14 days',
            'Within 30 days',
            'No specific deadline',
            'Other'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="radio"
                name="timelineRequirements"
                value={option}
                checked={responses.T3_Q1_timelineRequirements === option}
                onChange={(e) => setResponses(prev => ({ ...prev, T3_Q1_timelineRequirements: e.target.value }))}
                className="w-4 h-4 text-cyan-500"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
          {responses.T3_Q1_timelineRequirements === 'Other' && (
            <input
              type="text"
              value={responses.T3_Q1_timelineRequirementsOther}
              onChange={(e) => setResponses(prev => ({ ...prev, T3_Q1_timelineRequirementsOther: e.target.value }))}
              placeholder="Please specify"
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg mt-2"
            />
          )}
        </div>
      </div>

      {/* T3_Q2: Drying Preferences */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T3_Q2: Drying Preferences</h3>
        <div className="space-y-2">
          {[
            'Speed priority (desiccant dehumidifiers, heat plates, injection drying — higher cost)',
            'Balanced (standard LGR dehumidifiers, normal airflow)',
            'Cost-efficiency (minimal equipment, extended drying period)'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="radio"
                name="dryingPreferences"
                value={option}
                checked={responses.T3_Q2_dryingPreferences === option}
                onChange={(e) => setResponses(prev => ({ ...prev, T3_Q2_dryingPreferences: e.target.value }))}
                className="w-4 h-4 text-cyan-500"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
        </div>
      </div>

      {/* T3_Q3: Chemical Treatment */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T3_Q3: Chemical Treatment</h3>
        <div className="space-y-2">
          {[
            'Standard antimicrobial treatment (preventative — all Category 1 losses)',
            'Enhanced mould remediation (if active growth suspected)',
            'Biohazard treatment (if contaminated water — Category 3)',
            'No additional chemical treatment',
            'To be determined based on final moisture readings'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="radio"
                name="chemicalTreatment"
                value={option}
                checked={responses.T3_Q3_chemicalTreatment === option}
                onChange={(e) => setResponses(prev => ({ ...prev, T3_Q3_chemicalTreatment: e.target.value }))}
                className="w-4 h-4 text-cyan-500"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
        </div>
      </div>

      {/* T3_Q4: Total Affected Area */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T3_Q4: Total Affected Area</h3>
        <p className="text-sm text-slate-400 mb-4">
          Example: 'Kitchen 15 sqm, Lounge 40 sqm, 2 Bedrooms 50 sqm total, Hallway 20 sqm = 125 sqm total.' Used for chemical treatment costing ($/sqm) and labour estimation.
        </p>
        <input
          type="text"
          value={responses.T3_Q4_totalAffectedArea}
          onChange={(e) => setResponses(prev => ({ ...prev, T3_Q4_totalAffectedArea: e.target.value }))}
          placeholder="Enter total affected area breakdown..."
          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* T3_Q5: Class 4 Drying Assessment */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T3_Q5: Class 4 Drying Assessment</h3>
        <div className="space-y-2">
          {[
            'No — Class 1 (simple air drying expected)',
            'No — Class 2 (standard LGR/air mover deployment sufficient)',
            'Possibly — Class 3 or 4 suspected (yellow tongue, cavity saturation, structural timber)',
            'Yes — Class 4 confirmed (requires qualified specialist assessment and quote)',
            'Uncertain — needs qualified technician site assessment'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="radio"
                name="class4DryingAssessment"
                value={option}
                checked={responses.T3_Q5_class4DryingAssessment === option}
                onChange={(e) => setResponses(prev => ({ ...prev, T3_Q5_class4DryingAssessment: e.target.value }))}
                className="w-4 h-4 text-cyan-500"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/50 transition-all disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {loading ? 'Saving...' : 'Save & Complete'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

