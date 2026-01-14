"use client"

import { useState, useEffect } from "react"
import { AlertTriangle, Save, ArrowRight, SkipForward, Zap } from "lucide-react"
import toast from "react-hot-toast"

interface Tier2QuestionsProps {
  reportId: string
  onComplete: (responses: any) => void
  onSkip?: () => void
  onGenerateOptimised?: () => void
  onContinueToTier3?: () => void
  reportType?: 'basic' | 'enhanced' | 'optimised'
}

export default function Tier2Questions({ reportId, onComplete, onSkip, onGenerateOptimised, onContinueToTier3, reportType }: Tier2QuestionsProps) {
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [responses, setResponses] = useState({
    // Initial Data Entry Form Fields (for refinement)
    insurerName: '',
    methamphetamineScreen: 'NEGATIVE',
    methamphetamineTestCount: '',
    biologicalMouldDetected: false,
    biologicalMouldCategory: '',
    builderDeveloperCompanyName: '',
    builderDeveloperContact: '',
    builderDeveloperAddress: '',
    builderDeveloperPhone: '',
    ownerManagementContactName: '',
    ownerManagementPhone: '',
    ownerManagementEmail: '',
    lastInspectionDate: '',
    buildingChangedSinceLastInspection: '',
    structureChangesSinceLastInspection: '',
    previousLeakage: '',
    emergencyRepairPerformed: '',
    // Advanced Tier 2 Questions
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
        
        // Load InitialDataEntryForm fields from report
        const initialDataFields = {
          insurerName: data.insurerName || '',
          methamphetamineScreen: data.methamphetamineScreen || 'NEGATIVE',
          methamphetamineTestCount: data.methamphetamineTestCount || '',
          biologicalMouldDetected: data.biologicalMouldDetected || false,
          biologicalMouldCategory: data.biologicalMouldCategory || '',
          builderDeveloperCompanyName: data.builderDeveloperCompanyName || '',
          builderDeveloperContact: data.builderDeveloperContact || '',
          builderDeveloperAddress: data.builderDeveloperAddress || '',
          builderDeveloperPhone: data.builderDeveloperPhone || '',
          ownerManagementContactName: data.ownerManagementContactName || '',
          ownerManagementPhone: data.ownerManagementPhone || '',
          ownerManagementEmail: data.ownerManagementEmail || '',
          lastInspectionDate: data.lastInspectionDate ? new Date(data.lastInspectionDate).toISOString().split('T')[0] : '',
          buildingChangedSinceLastInspection: data.buildingChangedSinceLastInspection || '',
          structureChangesSinceLastInspection: data.structureChangesSinceLastInspection || '',
          previousLeakage: data.previousLeakage || '',
          emergencyRepairPerformed: data.emergencyRepairPerformed || '',
        }
        
        // Load Tier 2 responses if they exist
        const tier2Fields = data.tier2Responses || {}
        
        // Merge both sets of fields
        setResponses({
          ...initialDataFields,
          ...tier2Fields,
          // Ensure arrays are properly initialized
          T2_Q5_structuralConcerns: tier2Fields.T2_Q5_structuralConcerns || [],
          T2_Q6_buildingServicesAffected: tier2Fields.T2_Q6_buildingServicesAffected || [],
        })
      }
    } catch (error) {
      console.error('Error fetching existing responses:', error)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      // First, update the report with refined InitialDataEntryForm fields
      const updateResponse = await fetch(`/api/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insurerName: responses.insurerName,
          methamphetamineScreen: responses.methamphetamineScreen,
          methamphetamineTestCount: responses.methamphetamineTestCount,
          biologicalMouldDetected: responses.biologicalMouldDetected,
          biologicalMouldCategory: responses.biologicalMouldCategory,
          builderDeveloperCompanyName: responses.builderDeveloperCompanyName,
          builderDeveloperContact: responses.builderDeveloperContact,
          builderDeveloperAddress: responses.builderDeveloperAddress,
          builderDeveloperPhone: responses.builderDeveloperPhone,
          ownerManagementContactName: responses.ownerManagementContactName,
          ownerManagementPhone: responses.ownerManagementPhone,
          ownerManagementEmail: responses.ownerManagementEmail,
          lastInspectionDate: responses.lastInspectionDate ? new Date(responses.lastInspectionDate).toISOString() : null,
          buildingChangedSinceLastInspection: responses.buildingChangedSinceLastInspection,
          structureChangesSinceLastInspection: responses.structureChangesSinceLastInspection,
          previousLeakage: responses.previousLeakage,
          emergencyRepairPerformed: responses.emergencyRepairPerformed,
        })
      })

      if (!updateResponse.ok) {
        const error = await updateResponse.json()
        toast.error(error.error || 'Failed to update report data')
        setLoading(false)
        return
      }

      // Then save Tier 2 responses
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
        setSaved(true)
        onComplete(responses)
        // If optimised, automatically continue to Tier 3
        if (reportType === 'optimised' && onContinueToTier3) {
          onContinueToTier3()
        }
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

  // Quick Fill for Tier 2 Advanced Questions Only
  const handleQuickFill = () => {
    setResponses(prev => ({
      ...prev,
      // Only fill Tier 2 advanced questions, not basic information or previous tier data
      T2_Q1_moistureReadings: 'Master Bedroom carpet: 32% MC, Ensuite tile subfloor: 18% MC, Hallway yellow tongue: 22% MC. Thermal imaging confirms moisture migration into wall cavities.',
      T2_Q2_waterMigrationPattern: 'Water emerged from kitchen sink burst pipe, soaked through yellow tongue subfloor, saturated insulation in cavity, dripped through ceiling into two bedrooms below. Wall cavities also saturated on both sides of bathroom wall.',
      T2_Q3_equipmentDeployed: '12 air movers (800 CFM), 3 LGR dehumidifiers (85L/Day), 2 AFD units. Power consumption: 15 amps total. All equipment on dedicated circuits.',
      T2_Q4_affectedContents: 'Master Bedroom: Queen bed (mattress saturated, requires replacement), wardrobe base (particleboard swollen), carpet throughout. Ensuite: Vanity cabinet (MDF base swollen, doors misaligned), bathroom accessories. Hallway: Minimal contents affected.',
      T2_Q5_structuralConcerns: ['Wall cavities potentially saturated', 'Subfloor accessible for inspection (note condition)'],
      T2_Q5_structuralConcernsOther: '',
      T2_Q6_buildingServicesAffected: ['Outlets/switches in wet areas', 'Plumbing — visible leaks or repairs needed'],
      T2_Q7_insuranceConsiderations: 'Client confirmed sudden burst pipe covered under policy. Contents policy limit $50K, estimated contents damage $35K — within coverage. No exclusions identified.'
    }))
    toast.success('Tier 2 advanced questions filled with test data')
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg border-2 border-amber-500/50 bg-amber-500/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-semibold text-amber-400">TIER 2: ENHANCEMENT QUESTIONS</h2>
          </div>
          <button
            type="button"
            onClick={handleQuickFill}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Zap className="w-4 h-4" />
            Quick Fill Tier 2
          </button>
        </div>
        <p className="text-sm text-slate-300">
          Review and refine additional information, then answer the advanced enhancement questions. All questions are optional but improve report quality.
        </p>
      </div>

      {/* Initial Data Entry Form Fields - For Refinement */}
      <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <h3 className="text-lg font-semibold mb-4 text-amber-400">Additional Information Review</h3>
        <p className="text-sm text-slate-400 mb-4">Review and refine the hazard profile, contacts, and maintenance history.</p>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Insurer Name</label>
              <input
                type="text"
                value={responses.insurerName}
                onChange={(e) => setResponses(prev => ({ ...prev, insurerName: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Methamphetamine Screen</label>
              <select
                value={responses.methamphetamineScreen}
                onChange={(e) => setResponses(prev => ({ ...prev, methamphetamineScreen: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
              >
                <option value="NEGATIVE">NEGATIVE</option>
                <option value="POSITIVE">POSITIVE</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Methamphetamine Test Count</label>
              <input
                type="text"
                value={responses.methamphetamineTestCount}
                onChange={(e) => setResponses(prev => ({ ...prev, methamphetamineTestCount: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Biological Mould Detected</label>
              <select
                value={responses.biologicalMouldDetected ? 'true' : 'false'}
                onChange={(e) => setResponses(prev => ({ ...prev, biologicalMouldDetected: e.target.value === 'true' }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
              >
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
            {responses.biologicalMouldDetected && (
              <div>
                <label className="block text-sm font-medium mb-1">Biological Mould Category</label>
                <input
                  type="text"
                  value={responses.biologicalMouldCategory}
                  onChange={(e) => setResponses(prev => ({ ...prev, biologicalMouldCategory: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                />
              </div>
            )}
          </div>

          <div className="border-t border-slate-600 pt-4">
            <h4 className="text-md font-semibold mb-3">Builder/Developer Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Company Name</label>
                <input
                  type="text"
                  value={responses.builderDeveloperCompanyName}
                  onChange={(e) => setResponses(prev => ({ ...prev, builderDeveloperCompanyName: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Contact Person</label>
                <input
                  type="text"
                  value={responses.builderDeveloperContact}
                  onChange={(e) => setResponses(prev => ({ ...prev, builderDeveloperContact: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Address</label>
                <input
                  type="text"
                  value={responses.builderDeveloperAddress}
                  onChange={(e) => setResponses(prev => ({ ...prev, builderDeveloperAddress: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  type="text"
                  value={responses.builderDeveloperPhone}
                  onChange={(e) => setResponses(prev => ({ ...prev, builderDeveloperPhone: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-600 pt-4">
            <h4 className="text-md font-semibold mb-3">Owner/Management Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Contact Name</label>
                <input
                  type="text"
                  value={responses.ownerManagementContactName}
                  onChange={(e) => setResponses(prev => ({ ...prev, ownerManagementContactName: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  type="text"
                  value={responses.ownerManagementPhone}
                  onChange={(e) => setResponses(prev => ({ ...prev, ownerManagementPhone: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={responses.ownerManagementEmail}
                  onChange={(e) => setResponses(prev => ({ ...prev, ownerManagementEmail: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-600 pt-4">
            <h4 className="text-md font-semibold mb-3">Previous Maintenance & Repair History</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Last Inspection Date</label>
                <input
                  type="date"
                  value={responses.lastInspectionDate}
                  onChange={(e) => setResponses(prev => ({ ...prev, lastInspectionDate: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Building Changed Since Last Inspection</label>
                <input
                  type="text"
                  value={responses.buildingChangedSinceLastInspection}
                  onChange={(e) => setResponses(prev => ({ ...prev, buildingChangedSinceLastInspection: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Structure Changes Since Last Inspection</label>
                <input
                  type="text"
                  value={responses.structureChangesSinceLastInspection}
                  onChange={(e) => setResponses(prev => ({ ...prev, structureChangesSinceLastInspection: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Previous Leakage</label>
                <input
                  type="text"
                  value={responses.previousLeakage}
                  onChange={(e) => setResponses(prev => ({ ...prev, previousLeakage: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Emergency Repair Performed</label>
                <input
                  type="text"
                  value={responses.emergencyRepairPerformed}
                  onChange={(e) => setResponses(prev => ({ ...prev, emergencyRepairPerformed: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Tier 2 Questions */}
      <div className="p-4 rounded-lg border-2 border-amber-500/50 bg-amber-500/10">
        <h3 className="text-lg font-semibold text-amber-400 mb-2">Advanced Enhancement Questions</h3>
        <p className="text-sm text-slate-300">These advanced questions enhance scope detail and remediation sequencing.</p>
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
        {!saved ? (
          <>
            {onSkip && (
              <button
                onClick={() => {
                  if (onSkip) {
                    onSkip()
                  }
                }}
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
              {loading ? 'Saving...' : 'Save Tier 2 Responses'}
            </button>
          </>
        ) : saved && reportType === 'enhanced' ? (
          <div className="w-full space-y-4">
            {/* Always show skip option even after saving */}
            {onSkip && (
              <div className="flex justify-start mb-4">
                <button
                  onClick={() => {
                    if (onSkip) {
                      onSkip()
                    }
                  }}
                  className="flex items-center gap-2 px-6 py-3 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  <SkipForward className="w-4 h-4" />
                  Skip Tier 2 & Generate Report
                </button>
              </div>
            )}
            {(onGenerateOptimised || onContinueToTier3) ? (
          <div className="p-6 rounded-lg border-2 border-green-500/50 bg-green-500/10 space-y-4">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-green-400 mb-2">Tier 2 Completed Successfully!</h3>
              <p className="text-sm text-slate-300 mb-6">
                You can now generate an Optimised report with Tier 1 & Tier 2 data, or continue to Tier 3 for photo uploads and final optimization.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {onGenerateOptimised && (
                <button
                  onClick={onGenerateOptimised}
                  className="flex flex-col items-center justify-center gap-3 p-6 rounded-lg border-2 border-green-500 bg-gradient-to-br from-green-500/20 to-emerald-500/20 hover:from-green-500/30 hover:to-emerald-500/30 transition-all group"
                >
                  <div className="w-12 h-12 rounded-full bg-green-500/30 flex items-center justify-center group-hover:bg-green-500/40 transition-colors">
                    <Save className="w-6 h-6 text-green-300" />
                  </div>
                  <div className="text-center">
                    <h4 className="text-lg font-semibold text-white mb-1">Generate Optimised Report</h4>
                    <p className="text-sm text-slate-300">Generate report with Tier 1 & Tier 2 data</p>
                  </div>
                </button>
              )}
              {onContinueToTier3 && (
                <button
                  onClick={onContinueToTier3}
                  className="flex flex-col items-center justify-center gap-3 p-6 rounded-lg border-2 border-cyan-500 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 transition-all group"
                >
                  <div className="w-12 h-12 rounded-full bg-cyan-500/30 flex items-center justify-center group-hover:bg-cyan-500/40 transition-colors">
                    <ArrowRight className="w-6 h-6 text-cyan-300" />
                  </div>
                  <div className="text-center">
                    <h4 className="text-lg font-semibold text-white mb-1">Continue to Tier 3</h4>
                    <p className="text-sm text-slate-300">Add photos and final optimization</p>
                  </div>
                </button>
              )}
            </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

