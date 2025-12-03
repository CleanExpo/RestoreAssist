"use client"

import { useState, useEffect } from "react"
import { AlertCircle, Save, ArrowRight } from "lucide-react"
import toast from "react-hot-toast"

interface Tier1QuestionsProps {
  reportId: string
  onComplete: (responses: any) => void
}

export default function Tier1Questions({ reportId, onComplete }: Tier1QuestionsProps) {
  const [loading, setLoading] = useState(false)
  const [responses, setResponses] = useState({
    T1_Q1_propertyType: '',
    T1_Q1_propertyTypeOther: '',
    T1_Q2_constructionYear: '',
    T1_Q3_waterSource: '',
    T1_Q3_waterSourceOther: '',
    T1_Q4_occupancyStatus: '',
    T1_Q4_petsPresent: '',
    T1_Q5_roomsAffected: '',
    T1_Q6_materialsAffected: [] as string[],
    T1_Q6_materialsOther: '',
    T1_Q7_hazards: [] as string[],
    T1_Q7_hazardsOther: '',
    T1_Q8_waterDuration: ''
  })

  useEffect(() => {
    // Load existing responses if any
    fetchExistingResponses()
  }, [reportId])

  const fetchExistingResponses = async () => {
    try {
      const response = await fetch(`/api/reports/${reportId}`)
      if (response.ok) {
        const data = await response.json()
        // API returns report directly, and tier1Responses is already parsed
        if (data && data.tier1Responses) {
          setResponses(data.tier1Responses)
        }
      }
    } catch (error) {
      console.error('Error fetching existing responses:', error)
    }
  }

  const handleSave = async () => {
    // Validate required fields
    if (!responses.T1_Q1_propertyType) {
      toast.error('Please select property type')
      return
    }
    if (!responses.T1_Q2_constructionYear) {
      toast.error('Please select construction year')
      return
    }
    if (!responses.T1_Q3_waterSource) {
      toast.error('Please select water source')
      return
    }
    if (!responses.T1_Q4_occupancyStatus) {
      toast.error('Please select occupancy status')
      return
    }
    if (!responses.T1_Q5_roomsAffected.trim()) {
      toast.error('Please describe rooms/areas affected')
      return
    }
    if (responses.T1_Q6_materialsAffected.length === 0) {
      toast.error('Please select at least one affected material')
      return
    }
    if (responses.T1_Q7_hazards.length === 0) {
      toast.error('Please select hazard assessment (select "None identified" if no hazards)')
      return
    }
    if (!responses.T1_Q8_waterDuration) {
      toast.error('Please select water duration')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/reports/save-tier-responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          tier: 1,
          responses
        })
      })

      if (response.ok) {
        toast.success('Tier 1 responses saved successfully')
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
      <div className="p-4 rounded-lg border-2 border-red-500/50 bg-red-500/10">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <h2 className="text-xl font-semibold text-red-400">TIER 1: CRITICAL QUESTIONS</h2>
        </div>
        <p className="text-sm text-slate-300">
          These questions are required for report integrity and compliance. All questions must be answered.
        </p>
      </div>

      {/* T1_Q1: Property Type */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T1_Q1: Property Type <span className="text-red-400">*</span></h3>
        <div className="space-y-2">
          {[
            'Single-storey residential house',
            'Multi-storey residential (2+ storeys)',
            'Apartment/Unit (low-rise 3-5 levels)',
            'Apartment/Unit (high-rise 5+ levels)',
            'Commercial office',
            'Retail/Mixed use',
            'Industrial/Warehouse',
            'Heritage-listed property',
            'Other'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="radio"
                name="propertyType"
                value={option}
                checked={responses.T1_Q1_propertyType === option}
                onChange={(e) => setResponses(prev => ({ ...prev, T1_Q1_propertyType: e.target.value }))}
                className="w-4 h-4 text-cyan-500"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
          {responses.T1_Q1_propertyType === 'Other' && (
            <input
              type="text"
              value={responses.T1_Q1_propertyTypeOther}
              onChange={(e) => setResponses(prev => ({ ...prev, T1_Q1_propertyTypeOther: e.target.value }))}
              placeholder="Please specify"
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg mt-2"
            />
          )}
        </div>
      </div>

      {/* T1_Q2: Construction Year */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T1_Q2: Construction Year <span className="text-red-400">*</span></h3>
        <div className="space-y-2">
          {[
            'Pre-1970 (likely asbestos, lead paint risk)',
            '1970-1985 (asbestos risk, transitional materials)',
            '1985-2000',
            '2000-2010',
            '2010-present',
            'Unknown'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="radio"
                name="constructionYear"
                value={option}
                checked={responses.T1_Q2_constructionYear === option}
                onChange={(e) => setResponses(prev => ({ ...prev, T1_Q2_constructionYear: e.target.value }))}
                className="w-4 h-4 text-cyan-500"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
        </div>
      </div>

      {/* T1_Q3: Water Source */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T1_Q3: Water Source <span className="text-red-400">*</span></h3>
        <div className="space-y-2">
          {[
            'Burst pipe (clean water — Category 1)',
            'Overflowing toilet (Category 2 — grey water)',
            'Flood/stormwater (Category 3 — contaminated)',
            'Sewage backup (Category 3 — biohazard)',
            'Roof leak (Category 1 — clean)',
            'Hot water service failure (Category 1)',
            'Washing machine/dishwasher (Category 1)',
            'Unknown source',
            'Other'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="radio"
                name="waterSource"
                value={option}
                checked={responses.T1_Q3_waterSource === option}
                onChange={(e) => setResponses(prev => ({ ...prev, T1_Q3_waterSource: e.target.value }))}
                className="w-4 h-4 text-cyan-500"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
          {responses.T1_Q3_waterSource === 'Other' && (
            <input
              type="text"
              value={responses.T1_Q3_waterSourceOther}
              onChange={(e) => setResponses(prev => ({ ...prev, T1_Q3_waterSourceOther: e.target.value }))}
              placeholder="Please specify"
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg mt-2"
            />
          )}
        </div>
      </div>

      {/* T1_Q4: Occupancy Status */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T1_Q4: Occupancy Status <span className="text-red-400">*</span></h3>
        <div className="space-y-2">
          {[
            'Vacant/no one present',
            'Occupied — no vulnerable persons',
            'Occupied — children on premises',
            'Occupied — elderly residents',
            'Occupied — person with respiratory condition',
            'Occupied — person with disability support needs',
            'Occupied — multiple vulnerability factors',
            'Unknown'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="radio"
                name="occupancyStatus"
                value={option}
                checked={responses.T1_Q4_occupancyStatus === option}
                onChange={(e) => setResponses(prev => ({ ...prev, T1_Q4_occupancyStatus: e.target.value }))}
                className="w-4 h-4 text-cyan-500"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
          {responses.T1_Q4_occupancyStatus.includes('Occupied') && (
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">Are pets present? (Dogs/Cats/Birds/Exotic/Fish tanks/Other)</label>
              <input
                type="text"
                value={responses.T1_Q4_petsPresent}
                onChange={(e) => setResponses(prev => ({ ...prev, T1_Q4_petsPresent: e.target.value }))}
                placeholder="Describe pets if present"
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg"
              />
            </div>
          )}
        </div>
      </div>

      {/* T1_Q5: Rooms/Areas Affected */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T1_Q5: Rooms/Areas Affected <span className="text-red-400">*</span></h3>
        <textarea
          value={responses.T1_Q5_roomsAffected}
          onChange={(e) => setResponses(prev => ({ ...prev, T1_Q5_roomsAffected: e.target.value }))}
          rows={6}
          placeholder="List each room separately (e.g., Kitchen, Master Bedroom, Hallway, Lounge). Specify if water affected: floor only, walls, ceiling, cabinetry, insulation"
          className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* T1_Q6: Materials Affected */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T1_Q6: Materials Affected <span className="text-red-400">*</span></h3>
        <p className="text-sm text-slate-400 mb-4">Select all that apply</p>
        <div className="space-y-2">
          {[
            'Carpet on concrete slab',
            'Carpet on timber subfloor',
            'Carpet on particleboard/chipboard',
            'Floating timber floors (engineered)',
            'Solid timber floors',
            'Yellow tongue particleboard (common QLD construction)',
            'Ceramic/porcelain tile',
            'Vinyl/laminate',
            'Polished concrete',
            'Plasterboard walls',
            'Brick veneer',
            'Insulation in cavities',
            'Unknown/Other'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="checkbox"
                checked={responses.T1_Q6_materialsAffected.includes(option)}
                onChange={() => handleMultiSelect('T1_Q6_materialsAffected', option)}
                className="w-4 h-4 text-cyan-500 rounded"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
          {responses.T1_Q6_materialsAffected.includes('Unknown/Other') && (
            <input
              type="text"
              value={responses.T1_Q6_materialsOther}
              onChange={(e) => setResponses(prev => ({ ...prev, T1_Q6_materialsOther: e.target.value }))}
              placeholder="Please specify"
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg mt-2"
            />
          )}
        </div>
      </div>

      {/* T1_Q7: Hazard Assessment */}
      <div className="p-6 rounded-lg border-2 border-red-500/50 bg-red-500/10">
        <h3 className="text-lg font-semibold mb-4 text-red-400">T1_Q7: Hazard Assessment (CRITICAL) <span className="text-red-400">*</span></h3>
        <p className="text-sm text-slate-300 mb-4">Select all that apply</p>
        <div className="space-y-2">
          {[
            'None identified',
            'Visible asbestos materials (insulation, tiles, pipe wrap)',
            'Suspected asbestos (pre-1970s building, friable appearance)',
            'Lead paint (visible flaking, pre-1970 building)',
            'Active mould growth (black, green, powdery growth)',
            'Musty odours (VOCs, potential mould)',
            'Silica dust visible (concrete cutting, drywall breakdown)',
            'Biohazard contamination (sewage, animal matter)',
            'Electrical hazard (standing water near outlets, wet wiring)',
            'Structural damage (cracking, sagging, visible decay)',
            'Other'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="checkbox"
                checked={responses.T1_Q7_hazards.includes(option)}
                onChange={() => handleMultiSelect('T1_Q7_hazards', option)}
                className="w-4 h-4 text-red-500 rounded"
              />
              <span className="text-slate-300">{option}</span>
            </label>
          ))}
          {responses.T1_Q7_hazards.includes('Other') && (
            <input
              type="text"
              value={responses.T1_Q7_hazardsOther}
              onChange={(e) => setResponses(prev => ({ ...prev, T1_Q7_hazardsOther: e.target.value }))}
              placeholder="Please specify"
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg mt-2"
            />
          )}
        </div>
      </div>

      {/* T1_Q8: Water Duration */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4">T1_Q8: Water Duration <span className="text-red-400">*</span></h3>
        <div className="space-y-2">
          {[
            '< 24 hours',
            '24-48 hours',
            '48-72 hours',
            '3-7 days',
            '1-2 weeks',
            '> 2 weeks',
            'Unknown'
          ].map(option => (
            <label key={option} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 cursor-pointer">
              <input
                type="radio"
                name="waterDuration"
                value={option}
                checked={responses.T1_Q8_waterDuration === option}
                onChange={(e) => setResponses(prev => ({ ...prev, T1_Q8_waterDuration: e.target.value }))}
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
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-500 to-orange-500 rounded-lg font-medium hover:shadow-lg hover:shadow-red-500/50 transition-all disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {loading ? 'Saving...' : 'Save & Continue to Tier 2'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

