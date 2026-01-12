"use client"

import { useState, useEffect } from "react"
import { AlertCircle, Save, ArrowRight, Zap } from "lucide-react"
import toast from "react-hot-toast"

interface Tier1QuestionsProps {
  reportId: string
  onComplete: (responses: any) => void
  onGenerateEnhanced?: () => void
  onContinueToTier2?: () => void
  reportType?: 'basic' | 'enhanced' | 'optimised'
}

export default function Tier1Questions({ reportId, onComplete, onGenerateEnhanced, onContinueToTier2, reportType }: Tier1QuestionsProps) {
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [reportData, setReportData] = useState<any>(null)
  const [responses, setResponses] = useState({
    // Initial Data Entry Form Fields (for refinement)
    clientName: '',
    clientContactDetails: '',
    propertyAddress: '',
    propertyPostcode: '',
    claimReferenceNumber: '',
    incidentDate: '',
    technicianAttendanceDate: '',
    technicianName: '',
    technicianFieldReport: '',
    buildingAge: '',
    structureType: '',
    accessNotes: '',
    propertyId: '',
    jobNumber: '',
    reportInstructions: '',
    // Advanced Tier 1 Questions
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
        setReportData(data)
        
        // Load InitialDataEntryForm fields from report
        const initialDataFields = {
          clientName: data.clientName || '',
          clientContactDetails: data.clientContactDetails || '',
          propertyAddress: data.propertyAddress || '',
          propertyPostcode: data.propertyPostcode || '',
          claimReferenceNumber: data.claimReferenceNumber || '',
          incidentDate: data.incidentDate ? new Date(data.incidentDate).toISOString().split('T')[0] : '',
          technicianAttendanceDate: data.technicianAttendanceDate ? new Date(data.technicianAttendanceDate).toISOString().split('T')[0] : '',
          technicianName: data.technicianName || '',
          technicianFieldReport: data.technicianFieldReport || '',
          buildingAge: data.buildingAge || '',
          structureType: data.structureType || '',
          accessNotes: data.accessNotes || '',
          propertyId: data.propertyId || '',
          jobNumber: data.jobNumber || '',
          reportInstructions: data.reportInstructions || '',
        }
        
        // Load Tier 1 responses if they exist
        const tier1Fields = data.tier1Responses || {}
        
        // Merge both sets of fields
        setResponses({
          ...initialDataFields,
          ...tier1Fields,
          // Ensure arrays are properly initialized
          T1_Q6_materialsAffected: tier1Fields.T1_Q6_materialsAffected || [],
          T1_Q7_hazards: tier1Fields.T1_Q7_hazards || [],
        })
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
      // First, update the report with refined InitialDataEntryForm fields
      const updateResponse = await fetch(`/api/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: responses.clientName,
          clientContactDetails: responses.clientContactDetails,
          propertyAddress: responses.propertyAddress,
          propertyPostcode: responses.propertyPostcode,
          claimReferenceNumber: responses.claimReferenceNumber,
          incidentDate: responses.incidentDate ? new Date(responses.incidentDate).toISOString() : null,
          technicianAttendanceDate: responses.technicianAttendanceDate ? new Date(responses.technicianAttendanceDate).toISOString() : null,
          technicianName: responses.technicianName,
          technicianFieldReport: responses.technicianFieldReport,
          buildingAge: responses.buildingAge,
          structureType: responses.structureType,
          accessNotes: responses.accessNotes,
          propertyId: responses.propertyId,
          jobNumber: responses.jobNumber,
          reportInstructions: responses.reportInstructions,
        })
      })

      if (!updateResponse.ok) {
        const error = await updateResponse.json()
        toast.error(error.error || 'Failed to update report data')
        setLoading(false)
        return
      }

      // Then save Tier 1 responses
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
        setSaved(true)
        onComplete(responses)
        // If optimised, automatically continue to Tier 2
        if (reportType === 'optimised' && onContinueToTier2) {
          // Small delay to ensure state is updated
          setTimeout(() => {
            onContinueToTier2()
          }, 100)
        }
        // For enhanced, the options will show below (don't auto-navigate)
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

  // Quick Fill for Tier 1 Advanced Questions Only
  const handleQuickFill = () => {
    setResponses(prev => ({
      ...prev,
      // Only fill Tier 1 advanced questions, not basic information
      T1_Q1_propertyType: 'Multi-storey residential (2+ storeys)',
      T1_Q1_propertyTypeOther: '',
      T1_Q2_constructionYear: '2000-2010',
      T1_Q3_waterSource: 'Burst pipe (clean water — Category 1)',
      T1_Q3_waterSourceOther: '',
      T1_Q4_occupancyStatus: 'Occupied — no vulnerable persons',
      T1_Q4_petsPresent: '2 dogs, 1 cat',
      T1_Q5_roomsAffected: 'Master Bedroom: Floor and lower wall sections affected. Ensuite: Floor, vanity cabinet base, and lower wall sections. Hallway: Floor only, minimal wall contact.',
      T1_Q6_materialsAffected: ['Carpet on concrete slab', 'Plasterboard walls', 'Insulation in cavities'],
      T1_Q6_materialsOther: '',
      T1_Q7_hazards: ['None identified'],
      T1_Q7_hazardsOther: '',
      T1_Q8_waterDuration: '24-48 hours'
    }))
    toast.success('Tier 1 advanced questions filled with test data')
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg border-2 border-red-500/50 bg-red-500/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <h2 className="text-xl font-semibold text-red-400">TIER 1: CRITICAL QUESTIONS</h2>
          </div>
          <button
            type="button"
            onClick={handleQuickFill}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Zap className="w-4 h-4" />
            Quick Fill Tier 1
          </button>
        </div>
        <p className="text-sm text-slate-300">
          Review and refine the basic information, then answer the advanced critical questions. All advanced questions must be answered.
        </p>
      </div>

      {/* Initial Data Entry Form Fields - For Refinement */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4 text-cyan-400">Basic Information Review</h3>
        <p className="text-sm text-slate-400 mb-4">Review and refine the information entered in the initial data entry form.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Client Name</label>
            <input
              type="text"
              value={responses.clientName}
              onChange={(e) => setResponses(prev => ({ ...prev, clientName: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Client Contact Details</label>
            <input
              type="text"
              value={responses.clientContactDetails}
              onChange={(e) => setResponses(prev => ({ ...prev, clientContactDetails: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Property Address</label>
            <input
              type="text"
              value={responses.propertyAddress}
              onChange={(e) => setResponses(prev => ({ ...prev, propertyAddress: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Property Postcode</label>
            <input
              type="text"
              value={responses.propertyPostcode}
              onChange={(e) => setResponses(prev => ({ ...prev, propertyPostcode: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Claim Reference Number</label>
            <input
              type="text"
              value={responses.claimReferenceNumber}
              onChange={(e) => setResponses(prev => ({ ...prev, claimReferenceNumber: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Property ID</label>
            <input
              type="text"
              value={responses.propertyId}
              onChange={(e) => setResponses(prev => ({ ...prev, propertyId: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Job Number</label>
            <input
              type="text"
              value={responses.jobNumber}
              onChange={(e) => setResponses(prev => ({ ...prev, jobNumber: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Incident Date</label>
            <input
              type="date"
              value={responses.incidentDate}
              onChange={(e) => setResponses(prev => ({ ...prev, incidentDate: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Technician Attendance Date</label>
            <input
              type="date"
              value={responses.technicianAttendanceDate}
              onChange={(e) => setResponses(prev => ({ ...prev, technicianAttendanceDate: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Technician Name</label>
            <input
              type="text"
              value={responses.technicianName}
              onChange={(e) => setResponses(prev => ({ ...prev, technicianName: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Building Age</label>
            <input
              type="text"
              value={responses.buildingAge}
              onChange={(e) => setResponses(prev => ({ ...prev, buildingAge: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Structure Type</label>
            <input
              type="text"
              value={responses.structureType}
              onChange={(e) => setResponses(prev => ({ ...prev, structureType: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">Access Notes</label>
          <textarea
            value={responses.accessNotes}
            onChange={(e) => setResponses(prev => ({ ...prev, accessNotes: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
          />
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">Technician Field Report</label>
          <textarea
            value={responses.technicianFieldReport}
            onChange={(e) => setResponses(prev => ({ ...prev, technicianFieldReport: e.target.value }))}
            rows={4}
            className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
          />
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">Report Instructions</label>
          <textarea
            value={responses.reportInstructions}
            onChange={(e) => setResponses(prev => ({ ...prev, reportInstructions: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
            placeholder="Standards references, special requirements, etc."
          />
        </div>
      </div>

      {/* Advanced Tier 1 Questions */}
      <div className="p-4 rounded-lg border-2 border-red-500/50 bg-red-500/10">
        <h3 className="text-lg font-semibold text-red-400 mb-2">Advanced Critical Questions</h3>
        <p className="text-sm text-slate-300">These advanced questions are required for report integrity and compliance.</p>
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
          {responses.T1_Q4_occupancyStatus && responses.T1_Q4_occupancyStatus.includes('Occupied') && (
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">Are pets present? (Dogs/Cats/Birds/Exotic/Fish tanks/Other)</label>
              <input
                type="text"
                value={responses.T1_Q4_petsPresent || ''}
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

      {/* Submit Button or Options */}
      {!saved ? (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-500 to-orange-500 rounded-lg font-medium hover:shadow-lg hover:shadow-red-500/50 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {loading ? 'Saving...' : 'Save Tier 1 Responses'}
          </button>
        </div>
      ) : saved && reportType === 'enhanced' ? (
        <div className="p-6 rounded-lg border-2 border-cyan-500/50 bg-cyan-500/10 space-y-4">
          <div className="text-center">
            <h3 className="text-xl font-semibold text-cyan-400 mb-2">Tier 1 Completed Successfully!</h3>
            <p className="text-sm text-slate-300 mb-6">
              You can now generate an Enhanced report with Tier 1 data, or continue to Tier 2 for more detailed information.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {onGenerateEnhanced ? (
              <button
                onClick={onGenerateEnhanced}
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-lg border-2 border-green-500 bg-gradient-to-br from-green-500/20 to-emerald-500/20 hover:from-green-500/30 hover:to-emerald-500/30 transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-green-500/30 flex items-center justify-center group-hover:bg-green-500/40 transition-colors">
                  <Save className="w-6 h-6 text-green-300" />
                </div>
                <div className="text-center">
                  <h4 className="text-lg font-semibold text-white mb-1">Generate Enhanced Report</h4>
                  <p className="text-sm text-slate-300">Generate report with Tier 1 data</p>
                </div>
              </button>
            ) : null}
            {onContinueToTier2 ? (
              <button
                onClick={onContinueToTier2}
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-lg border-2 border-cyan-500 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-cyan-500/30 flex items-center justify-center group-hover:bg-cyan-500/40 transition-colors">
                  <ArrowRight className="w-6 h-6 text-cyan-300" />
                </div>
                <div className="text-center">
                  <h4 className="text-lg font-semibold text-white mb-1">Continue to Tier 2</h4>
                  <p className="text-sm text-slate-300">Add more detailed assessment</p>
                </div>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

