"use client"

import { useState, useEffect } from "react"
import { AlertTriangle, Save, ArrowRight, SkipForward } from "lucide-react"
import toast from "react-hot-toast"

interface Tier2QuestionsProps {
  reportId: string
  onComplete: (responses: any) => void
  onSkip?: () => void
}

export default function Tier2Questions({ reportId, onComplete, onSkip }: Tier2QuestionsProps) {
  const [loading, setLoading] = useState(false)
  const [responses, setResponses] = useState({
    T2_Q1_moistureReadings: '',
    T2_Q2_waterMigrationPattern: '',
    T2_Q3_equipmentDeployed: '',
    T2_Q4_affectedContents: '',
    T2_Q5_structuralConcerns: [] as string[],
    T2_Q5_structuralConcernsOther: '',
    T2_Q6_buildingServicesAffected: [] as string[],
    T2_Q7_insuranceConsiderations: ''
  })

  useEffect(() => {
    fetchExistingResponses()
  }, [reportId])

  const fetchExistingResponses = async () => {
    try {
      const response = await fetch(`/api/reports/${reportId}`)
      if (response.ok) {
        const data = await response.json()
        // API returns report directly, and tier2Responses is already parsed
        if (data && data.tier2Responses) {
          setResponses(data.tier2Responses)
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
          tier: 2,
          responses
        })
      })

      if (response.ok) {
        toast.success('Tier 2 responses saved successfully')
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

  const handleMultiSelect = (field: string, value: string) => {
    setResponses(prev => {
      const currentArray = prev[field as keyof typeof prev] as string[]
      if (Array.isArray(currentArray)) {
        if (currentArray.includes(value)) {
          return { ...prev, [field]: currentArray.filter(v => v !== value) }
        } else {
          return { ...prev, [field]: [...currentArray, value] }
        }
      }
      return prev
    })
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg border-2 border-amber-500/50 bg-amber-500/10">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-semibold text-amber-400">TIER 2: ENHANCEMENT QUESTIONS</h2>
        </div>
        <p className="text-sm text-slate-300">
          These questions enhance scope detail and remediation sequencing. All questions are optional but improve report quality.
        </p>
      </div>

      {/* T2_Q1: Moisture Readings */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T2_Q1: Moisture Readings</h3>
        <p className="text-sm text-slate-400 mb-4">
          Enter moisture readings in %MC (moisture content) for each material/location. Example: 'Kitchen tile subfloor 8% MC, Master Bedroom carpet 32% MC, Hallway yellow tongue 22% MC'. Include thermal image references if taken.
        </p>
        <textarea
          value={responses.T2_Q1_moistureReadings}
          onChange={(e) => setResponses(prev => ({ ...prev, T2_Q1_moistureReadings: e.target.value }))}
          rows={6}
          placeholder="Enter moisture readings here..."
          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* T2_Q2: Water Migration Pattern */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T2_Q2: Water Migration Pattern</h3>
        <p className="text-sm text-slate-400 mb-4">
          Example: 'Water emerged from kitchen sink burst pipe, soaked through yellow tongue subfloor, saturated insulation in cavity, dripped through ceiling into two bedrooms below. Wall cavities also saturated on both sides of bathroom wall.' This helps identify hidden moisture and secondary affected areas.
        </p>
        <textarea
          value={responses.T2_Q2_waterMigrationPattern}
          onChange={(e) => setResponses(prev => ({ ...prev, T2_Q2_waterMigrationPattern: e.target.value }))}
          rows={6}
          placeholder="Describe water migration pattern..."
          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* T2_Q3: Equipment Deployed */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T2_Q3: Equipment Deployed</h3>
        <p className="text-sm text-slate-400 mb-4">
          Equipment already deployed: 18 air movers (type?), 4 dehumidifiers (LGR or desiccant?), 2 AFD units. If different numbers/types, please specify. Power consumed/available circuits?
        </p>
        <textarea
          value={responses.T2_Q3_equipmentDeployed}
          onChange={(e) => setResponses(prev => ({ ...prev, T2_Q3_equipmentDeployed: e.target.value }))}
          rows={6}
          placeholder="Describe equipment deployed..."
          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* T2_Q4: Affected Contents */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T2_Q4: Affected Contents</h3>
        <p className="text-sm text-slate-400 mb-4">
          Example: 'Kitchen: wooden cabinets (swollen, door misalignment), tile grout saturated. Lounge: sofa (fabric absorbed water, requires cleaning), coffee table (timber veneer swollen). Bedrooms: beds (wet bedding, mattress saturation). All carpet affected — extent varies by location.'
        </p>
        <textarea
          value={responses.T2_Q4_affectedContents}
          onChange={(e) => setResponses(prev => ({ ...prev, T2_Q4_affectedContents: e.target.value }))}
          rows={6}
          placeholder="Describe affected contents..."
          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* T2_Q5: Structural Concerns */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T2_Q5: Structural Concerns</h3>
        <p className="text-sm text-slate-400 mb-4">Select all that apply</p>
        <div className="space-y-2">
          {[
            'None identified',
            'Ceiling/plasterboard sagging or visible damage',
            'Wall cavities potentially saturated',
            'Subfloor accessible for inspection (note condition)',
            'Subfloor not accessible',
            'Structural timber (bearers, joists) potentially affected',
            'Cracking in walls or structural elements',
            'Previous water damage visible (repeat occurrence)',
            'Pest damage observed (rot, termite activity)',
            'Other concerns'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="checkbox"
                checked={responses.T2_Q5_structuralConcerns.includes(option)}
                onChange={() => handleMultiSelect('T2_Q5_structuralConcerns', option)}
                className="w-4 h-4 text-cyan-500 rounded"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
          {responses.T2_Q5_structuralConcerns.includes('Other concerns') && (
            <input
              type="text"
              value={responses.T2_Q5_structuralConcernsOther}
              onChange={(e) => setResponses(prev => ({ ...prev, T2_Q5_structuralConcernsOther: e.target.value }))}
              placeholder="Please specify"
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg mt-2"
            />
          )}
        </div>
      </div>

      {/* T2_Q6: Building Services Affected */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T2_Q6: Building Services Affected</h3>
        <p className="text-sm text-slate-400 mb-4">Select all that apply</p>
        <div className="space-y-2">
          {[
            'No services affected',
            'Electrical panel or circuits wet',
            'Outlets/switches in wet areas',
            'Water heater/boiler affected',
            'Plumbing — visible leaks or repairs needed',
            'Air conditioning/HVAC system wet',
            'Gas appliances affected',
            'Solar panels/roof-mounted systems affected',
            'Unknown/not assessed'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="checkbox"
                checked={responses.T2_Q6_buildingServicesAffected.includes(option)}
                onChange={() => handleMultiSelect('T2_Q6_buildingServicesAffected', option)}
                className="w-4 h-4 text-cyan-500 rounded"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
        </div>
      </div>

      {/* T2_Q7: Insurance Coverage Considerations */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T2_Q7: Insurance Coverage Considerations</h3>
        <p className="text-sm text-slate-400 mb-4">
          Example: 'Client mentioned 'gradual leak exclusion' in their policy, but this is sudden burst. Confirm with insurer.' Or 'Contents policy has $50K limit; estimated contents damage $60K — may exceed coverage.' This helps flag potential disputes early.
        </p>
        <textarea
          value={responses.T2_Q7_insuranceConsiderations}
          onChange={(e) => setResponses(prev => ({ ...prev, T2_Q7_insuranceConsiderations: e.target.value }))}
          rows={6}
          placeholder="Enter insurance considerations..."
          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between">
        {onSkip && (
          <button
            onClick={onSkip}
            className="flex items-center gap-2 px-6 py-3 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            <SkipForward className="w-4 h-4" />
            Skip Tier 2
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg font-medium hover:shadow-lg hover:shadow-amber-500/50 transition-all disabled:opacity-50 ml-auto"
        >
          <Save className="w-4 h-4" />
          {loading ? 'Saving...' : 'Save & Continue'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

